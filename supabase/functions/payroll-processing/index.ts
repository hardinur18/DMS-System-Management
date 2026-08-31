import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type PayrollProcessAction = "lock" | "mark_paid" | "unlock" | "void" | "restore" | "mark_overtime_paid" | "void_overtime_payment"
type PayrollPaymentMethod = "cash" | "bank_transfer" | "ewallet" | "other"

interface PayrollProcessPayload {
  cycleId?: string
  overtimeRequestIds?: string[]
  overtimePaymentId?: string
  notes?: string
  paymentMethod?: PayrollPaymentMethod
  paymentReference?: string
  paidAt?: string
  paidAmount?: number | string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function assertPayload(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function appendPayrollNote(previous: unknown, next: string) {
  return [typeof previous === "string" ? previous : "", next].filter(Boolean).join("\n")
}

function normalizePaymentMethod(value: unknown): PayrollPaymentMethod {
  if (value === "cash" || value === "ewallet" || value === "other") return value
  return "bank_transfer"
}

function normalizePaidAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return new Date().toISOString()

  const cleaned = value.trim()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(cleaned)
    ? new Date(`${cleaned}T12:00:00+07:00`)
    : new Date(cleaned)

  assertPayload(Number.isFinite(date.getTime()), "Tanggal bayar tidak valid.")
  return date.toISOString()
}

function normalizePaidAmount(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback
  const amount = Number(value)
  assertPayload(Number.isFinite(amount) && amount > 0, "Nominal pembayaran wajib lebih dari 0.")
  return amount
}

function isMissingLedgerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  return /payroll_payments|payroll_cycle_items|overtime_payments|overtime_payment_items|overtime_payment_status|mark_payroll_cycle_paid|mark_overtime_requests_paid|void_overtime_payment|rebuild_payroll_cycle_items|schema cache|PGRST202/i.test(message)
}

function ledgerMigrationMessage() {
  return "Migration payment ledger belum diterapkan. Jalankan migration payroll/overtime ledger terbaru lalu deploy ulang edge function."
}

async function assertNoOpenPayrollDependencies(adminClient: any, cycle: Record<string, unknown>) {
  const employeeId = String(cycle.employee_id || "")
  const periodStartedAt = String(cycle.period_started_at || "")
  const periodClosedAt = String(cycle.period_closed_at || "")

  let attendanceQuery = adminClient
    .from("attendance_logs")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("status", "review")

  if (periodStartedAt) attendanceQuery = attendanceQuery.gte("attendance_date", periodStartedAt)
  if (periodClosedAt) attendanceQuery = attendanceQuery.lte("attendance_date", periodClosedAt)

  const { count: reviewCount, error: reviewError } = await attendanceQuery
  if (reviewError) throw reviewError
  assertPayload(!reviewCount, "Masih ada absensi review di periode payroll ini.")

  let overtimeQuery = adminClient
    .from("overtime_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .in("status", ["draft", "pending"])

  if (periodStartedAt) overtimeQuery = overtimeQuery.gte("overtime_date", periodStartedAt)
  if (periodClosedAt) overtimeQuery = overtimeQuery.lte("overtime_date", periodClosedAt)

  const { count: overtimeCount, error: overtimeError } = await overtimeQuery
  if (overtimeError) throw overtimeError
  assertPayload(!overtimeCount, "Masih ada lembur draft/pending di periode payroll ini.")
}

async function rebuildPayrollCycleItems(adminClient: any, cycleId: string) {
  const { error } = await adminClient.rpc("rebuild_payroll_cycle_items", { target_cycle_id: cycleId })
  if (!error) return

  if (isMissingLedgerError(error)) throw new Error(ledgerMigrationMessage())
  throw error
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Function env belum lengkap." }, 500)
  }

  const authorization = request.headers.get("Authorization")
  if (!authorization) return jsonResponse({ error: "Authorization wajib ada." }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const body = await request.json() as { action?: PayrollProcessAction; payload?: PayrollProcessPayload }
    const action = body.action
    const payload = body.payload || {}

    assertPayload(
      action === "lock"
      || action === "mark_paid"
      || action === "unlock"
      || action === "void"
      || action === "restore"
      || action === "mark_overtime_paid"
      || action === "void_overtime_payment",
      "Action payroll tidak valid.",
    )

    const token = authorization.replace(/^Bearer\s+/i, "")
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: "Session tidak valid." }, 401)

    const { data: actor, error: actorError } = await adminClient
      .from("app_users")
      .select("id, full_name, email, role_id, status")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle()

    if (actorError) throw actorError
    if (!actor || actor.status !== "active") return jsonResponse({ error: "Akses user tidak aktif." }, 403)

    const { data: permission, error: permissionError } = await adminClient
      .from("role_permissions")
      .select("permission_key")
      .eq("role_id", actor.role_id)
      .eq("permission_key", "payroll.process")
      .eq("enabled", true)
      .maybeSingle()

    if (permissionError) throw permissionError
    if (!permission) return jsonResponse({ error: "Role tidak punya permission Proses Payroll." }, 403)

    const notes = payload.notes?.trim()

    if (action === "mark_overtime_paid") {
      const requestIds = Array.isArray(payload.overtimeRequestIds)
        ? payload.overtimeRequestIds.map((id) => String(id || "").trim()).filter(Boolean)
        : []
      const paidAmount = payload.paidAmount === undefined || payload.paidAmount === null || payload.paidAmount === ""
        ? null
        : normalizePaidAmount(payload.paidAmount, 1)

      assertPayload(requestIds.length > 0, "Minimal satu request lembur wajib dipilih.")

      const { data: paymentResult, error: paymentError } = await adminClient.rpc("mark_overtime_requests_paid", {
        target_overtime_request_ids: requestIds,
        actor_user_id: actor.id,
        actor_name: String(actor.full_name || actor.email || "Finance"),
        payment_method: normalizePaymentMethod(payload.paymentMethod),
        payment_reference: payload.paymentReference?.trim() || null,
        paid_at: normalizePaidAt(payload.paidAt),
        paid_amount: paidAmount,
        note_text: notes || "",
      })

      if (paymentError) {
        if (isMissingLedgerError(paymentError)) throw new Error(ledgerMigrationMessage())
        throw paymentError
      }

      return jsonResponse({ ok: true, ...paymentResult })
    }

    if (action === "void_overtime_payment") {
      assertPayload(payload.overtimePaymentId, "ID pembayaran lembur wajib ada.")

      const { data: paymentResult, error: paymentError } = await adminClient.rpc("void_overtime_payment", {
        target_payment_id: payload.overtimePaymentId,
        actor_user_id: actor.id,
        actor_name: String(actor.full_name || actor.email || "Finance"),
        note_text: notes || "",
      })

      if (paymentError) {
        if (isMissingLedgerError(paymentError)) throw new Error(ledgerMigrationMessage())
        throw paymentError
      }

      return jsonResponse({ ok: true, ...paymentResult })
    }

    assertPayload(payload.cycleId, "ID payroll cycle wajib ada.")

    const { data: cycle, error: cycleError } = await adminClient
      .from("payroll_cycles")
      .select("id, employee_id, cycle_number, work_days_count, target_work_days, gross_amount, overtime_amount, net_amount, status, notes, period_started_at, period_closed_at")
      .eq("id", payload.cycleId)
      .maybeSingle()

    if (cycleError) throw cycleError
    if (!cycle) return jsonResponse({ error: "Payroll cycle tidak ditemukan." }, 404)

    const { data: employee, error: employeeError } = await adminClient
      .from("employees")
      .select("employee_code, full_name")
      .eq("id", cycle.employee_id)
      .maybeSingle()

    if (employeeError) throw employeeError

    const now = new Date().toISOString()
    const grossAmount = Number(cycle.gross_amount || 0)
    const overtimeAmount = Number(cycle.overtime_amount || 0)
    const savedNetAmount = Number(cycle.net_amount || 0)
    const netAmount = savedNetAmount > 0 ? savedNetAmount : Math.max(0, grossAmount + overtimeAmount)
    const currentStatus = String(cycle.status || "active")
    const employeeName = String(employee?.full_name || "Karyawan")
    const employeeCode = String(employee?.employee_code || "")

    if (action === "mark_paid") {
      assertPayload(currentStatus === "locked", "Payroll wajib dikunci sebelum ditandai terbayar.")

      const paidAt = normalizePaidAt(payload.paidAt)
      const paidAmount = normalizePaidAmount(payload.paidAmount, netAmount)
      const { data: paymentResult, error: paymentError } = await adminClient.rpc("mark_payroll_cycle_paid", {
        target_cycle_id: cycle.id,
        actor_user_id: actor.id,
        actor_name: String(actor.full_name || actor.email || "Finance"),
        payment_method: normalizePaymentMethod(payload.paymentMethod),
        payment_reference: payload.paymentReference?.trim() || null,
        paid_at: paidAt,
        paid_amount: paidAmount,
        note_text: notes || "",
      })

      if (paymentError) {
        if (isMissingLedgerError(paymentError)) throw new Error(ledgerMigrationMessage())
        throw paymentError
      }

      return jsonResponse({ ok: true, ...paymentResult })
    }

    let updatePayload: Record<string, unknown>
    let auditAction: string
    let nextStatus: string

    if (action === "lock") {
      assertPayload(currentStatus === "ready", "Payroll hanya bisa dikunci saat status Siap Gajian.")
      assertPayload(Number(cycle.work_days_count || 0) >= Number(cycle.target_work_days || 26), "Cycle belum mencapai target hari kerja.")
      await assertNoOpenPayrollDependencies(adminClient, cycle)
      await rebuildPayrollCycleItems(adminClient, String(cycle.id))

      nextStatus = "locked"
      auditAction = "Lock payroll cycle"
      updatePayload = {
        status: nextStatus,
        locked_at: now,
        processed_by: actor.id,
        gross_amount: grossAmount,
        overtime_amount: overtimeAmount,
        net_amount: netAmount,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance lock payroll: ${notes}` : "Finance lock payroll."),
        updated_at: now,
      }
    } else if (action === "unlock") {
      assertPayload(currentStatus === "locked", "Hanya payroll locked yang bisa dibuka ulang.")

      nextStatus = "ready"
      auditAction = "Unlock payroll cycle"
      updatePayload = {
        status: nextStatus,
        locked_at: null,
        processed_by: null,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance unlock payroll: ${notes}` : "Finance unlock payroll."),
        updated_at: now,
      }
    } else if (action === "void") {
      assertPayload(currentStatus !== "paid", "Payroll yang sudah terbayar tidak bisa dibatalkan.")
      assertPayload(currentStatus !== "void", "Payroll cycle sudah dalam status Void.")

      nextStatus = "void"
      auditAction = "Void payroll cycle"
      updatePayload = {
        status: nextStatus,
        processed_at: now,
        processed_by: actor.id,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance void payroll: ${notes}` : "Finance void payroll."),
        updated_at: now,
      }
    } else {
      assertPayload(currentStatus === "void", "Hanya payroll Void yang bisa direstore.")

      nextStatus = Number(cycle.work_days_count || 0) >= Number(cycle.target_work_days || 26) ? "ready" : "active"
      auditAction = "Restore payroll cycle"
      updatePayload = {
        status: nextStatus,
        locked_at: null,
        processed_at: null,
        processed_by: null,
        paid_at: null,
        net_amount: netAmount,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance restore payroll: ${notes}` : "Finance restore payroll."),
        updated_at: now,
      }
    }

    const { data: updatedCycle, error: updateError } = await adminClient
      .from("payroll_cycles")
      .update(updatePayload)
      .eq("id", cycle.id)
      .select("id, employee_id, cycle_number, work_days_count, target_work_days, gross_amount, overtime_amount, net_amount, status, ready_at, locked_at, paid_at, processed_at, processed_by, notes")
      .single()

    if (updateError) throw updateError

    await adminClient.from("audit_logs").insert({
      actor_user_id: actor.id,
      actor_name: actor.full_name,
      action: auditAction,
      target_table: "payroll_cycles",
      target_id: cycle.id,
      status: "success",
      metadata: {
        employee_id: cycle.employee_id,
        employee_code: employeeCode,
        employee_name: employeeName,
        cycle_number: cycle.cycle_number,
        previous_status: currentStatus,
        next_status: nextStatus,
        gross_amount: grossAmount,
        overtime_amount: overtimeAmount,
        net_amount: nextStatus === "locked" ? netAmount : Number(cycle.net_amount || netAmount),
        source: "edge-function",
      },
    })

    return jsonResponse({ ok: true, payroll: updatedCycle })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payroll gagal diproses."
    return jsonResponse({ error: message }, 400)
  }
})
