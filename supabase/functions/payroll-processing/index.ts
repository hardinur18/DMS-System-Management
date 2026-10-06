import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type PayrollProcessAction = "lock" | "lock_early" | "mark_paid" | "unlock" | "void" | "restore" | "mark_overtime_paid" | "void_overtime_payment" | "save_weekly_bonus_policy" | "mark_weekly_bonus_paid" | "void_weekly_bonus_payment"
type PayrollPaymentMethod = "cash" | "bank_transfer" | "ewallet" | "other"

interface PayrollProcessPayload {
  cycleId?: string
  overtimeRequestIds?: string[]
  overtimePaymentId?: string
  weeklyBonusCycleIds?: string[]
  weeklyBonusPaymentId?: string
  weeklyBonusPolicyId?: string
  weeklyBonusPolicyCode?: string
  weeklyBonusPolicyName?: string
  weeklyBonusPolicyDescription?: string
  weeklyBonusTargetDays?: number | string
  weeklyBonusFullAmount?: number | string
  weeklyBonusWeekStartDow?: number | string
  weeklyBonusPaymentDayDow?: number | string
  weeklyBonusIsActive?: boolean
  weeklyBonusShiftIds?: string[]
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

function normalizeInteger(value: unknown, message: string, min: number, max: number) {
  const parsed = Number(value)
  assertPayload(Number.isInteger(parsed) && parsed >= min && parsed <= max, message)
  return parsed
}

function normalizeBonusAmount(value: unknown) {
  const amount = Number(value)
  assertPayload(Number.isFinite(amount) && amount >= 0, "Nominal bonus wajib angka dan minimal 0.")
  return amount
}

function getErrorMessage(error: unknown, fallback = "") {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === "object" && error) {
    const errorObject = error as Record<string, unknown>
    const messageParts = [errorObject.message, errorObject.details, errorObject.hint]
      .map((part) => typeof part === "string" ? part.trim() : "")
      .filter(Boolean)
    if (messageParts.length > 0) return messageParts.join(" ")
  }

  const text = String(error || "").trim()
  return text && text !== "[object Object]" ? text : fallback
}

function isMissingLedgerError(error: unknown) {
  const message = getErrorMessage(error)
  return /payroll_payments|payroll_cycle_items|overtime_payments|overtime_payment_items|overtime_payment_status|overtime_payment_policy|weekly_bonus_policies|weekly_bonus_policy_shifts|weekly_shift_bonus_cycles|weekly_shift_bonus_payments|weekly_shift_bonus_payment_items|target_payment_policy|set_overtime_payment_policy|mark_payroll_cycle_paid|mark_overtime_requests_paid|void_overtime_payment|refresh_weekly_shift_bonus_cycles|mark_weekly_shift_bonus_paid|void_weekly_bonus_payment|rebuild_payroll_cycle_items|schema cache|PGRST202/i.test(message)
}

function ledgerMigrationMessage() {
  return "Migration payment ledger belum diterapkan. Jalankan migration payroll/lembur/bonus terbaru lalu deploy ulang edge function."
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
  assertPayload(!reviewCount, "Masih ada absensi review di periode gaji ini.")

  let overtimeQuery = adminClient
    .from("overtime_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .in("status", ["draft", "pending"])
    .eq("overtime_payment_policy", "salary_cycle")

  if (periodStartedAt) overtimeQuery = overtimeQuery.gte("overtime_date", periodStartedAt)
  if (periodClosedAt) overtimeQuery = overtimeQuery.lte("overtime_date", periodClosedAt)

  const { count: overtimeCount, error: overtimeError } = await overtimeQuery
  if (overtimeError) {
    if (isMissingLedgerError(overtimeError)) throw new Error(ledgerMigrationMessage())
    throw overtimeError
  }
  assertPayload(!overtimeCount, "Masih ada lembur ikut gaji 26 hari yang belum selesai review di periode gaji ini.")
}

async function rebuildPayrollCycleItems(adminClient: any, cycleId: string) {
  const { error } = await adminClient.rpc("rebuild_payroll_cycle_items", { target_cycle_id: cycleId })
  if (!error) return

  if (isMissingLedgerError(error)) throw new Error(ledgerMigrationMessage())
  throw error
}

const payrollCycleColumns = "id, employee_id, cycle_number, period_started_at, period_closed_at, work_days_count, target_work_days, gross_amount, overtime_amount, net_amount, salary_type, status, ready_at, locked_at, paid_at, processed_at, processed_by, notes"
const payrollPaymentColumns = "id, payment_no, payroll_cycle_id, employee_id, employee_code, employee_name, cycle_number, period_started_at, period_closed_at, gross_amount, overtime_amount, net_amount, paid_amount, payment_method, payment_reference, paid_at, paid_by_name, status, notes"
const overtimeRequestColumns = "id, employee_id, attendance_log_id, payroll_cycle_id, payroll_component_id, overtime_date, shift_start_time, shift_end_time, actual_check_out_at, overtime_minutes, approved_minutes, rate_amount, total_amount, day_type, overtime_basis, status, request_source, planned_start_at, planned_end_at, planned_minutes, request_reason, requested_at, matched_attendance, notes, created_at, overtime_payment_status, overtime_payment_policy, overtime_payment_id, overtime_paid_at, overtime_payment_note, overtime_segment, actual_check_in_at, pre_shift_minutes, post_shift_minutes"
const overtimePaymentColumns = "id, payment_no, employee_id, employee_code, employee_name, period_started_at, period_closed_at, request_count, overtime_minutes, overtime_amount, paid_amount, payment_method, payment_reference, paid_at, paid_by_name, status, notes"
const weeklyBonusCycleColumns = "id, policy_id, policy_code, policy_name, employee_id, employee_code, employee_name, division_name, period_started_at, period_closed_at, payment_due_date, eligible_days, target_days, full_amount, bonus_amount, status, payment_id, paid_at, paid_by_name, payment_note, calculated_at"
const weeklyBonusPaymentColumns = "id, payment_no, employee_id, employee_code, employee_name, period_started_at, period_closed_at, cycle_count, eligible_days, target_days, bonus_amount, paid_amount, payment_method, payment_reference, paid_at, paid_by_name, status, notes"
const weeklyBonusPolicyColumns = "id, code, name, description, target_days, full_amount, week_start_dow, payment_day_dow, status, is_active, updated_at"

function getPaymentId(result: unknown) {
  const row = Array.isArray(result) ? result[0] : result
  if (!row || typeof row !== "object") return ""
  const record = row as Record<string, unknown>
  return String(record.payment_id || record.id || "")
}

async function fetchSingleRecord(adminClient: any, tableName: string, columns: string, id: string) {
  if (!id) return null

  const { data, error } = await adminClient
    .from(tableName)
    .select(columns)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    if (isMissingLedgerError(error)) throw new Error(ledgerMigrationMessage())
    throw error
  }

  return data
}

async function fetchRecordsByIds(adminClient: any, tableName: string, columns: string, ids: string[]) {
  const cleanIds = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)))
  if (cleanIds.length === 0) return []

  const { data, error } = await adminClient
    .from(tableName)
    .select(columns)
    .in("id", cleanIds)

  if (error) {
    if (isMissingLedgerError(error)) throw new Error(ledgerMigrationMessage())
    throw error
  }

  return data || []
}

async function fetchRecordIdsByPayment(adminClient: any, tableName: string, paymentColumn: string, paymentId: string) {
  if (!paymentId) return []

  const { data, error } = await adminClient
    .from(tableName)
    .select("id")
    .eq(paymentColumn, paymentId)

  if (error) {
    if (isMissingLedgerError(error)) throw new Error(ledgerMigrationMessage())
    throw error
  }

  return ((data || []) as Array<Record<string, unknown>>).map((row) => String(row.id || "")).filter(Boolean)
}

async function fetchWeeklyBonusPolicy(adminClient: any, policyId: string) {
  const policy = await fetchSingleRecord(adminClient, "weekly_bonus_policies", weeklyBonusPolicyColumns, policyId)
  if (!policy) return null

  const { data: shiftRows, error: shiftError } = await adminClient
    .from("weekly_bonus_policy_shifts")
    .select("shift_id, is_active")
    .eq("policy_id", policyId)
    .eq("is_active", true)

  if (shiftError) {
    if (isMissingLedgerError(shiftError)) throw new Error(ledgerMigrationMessage())
    throw shiftError
  }

  return {
    ...policy,
    shift_ids: ((shiftRows || []) as Array<Record<string, unknown>>).map((row) => String(row.shift_id || "")).filter(Boolean),
  }
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
      || action === "lock_early"
      || action === "mark_paid"
      || action === "unlock"
      || action === "void"
      || action === "restore"
      || action === "mark_overtime_paid"
      || action === "void_overtime_payment"
      || action === "save_weekly_bonus_policy"
      || action === "mark_weekly_bonus_paid"
      || action === "void_weekly_bonus_payment",
      "Aksi gaji tidak valid.",
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

    if (action === "save_weekly_bonus_policy") {
      const code = String(payload.weeklyBonusPolicyCode || "").trim().toUpperCase()
      const name = String(payload.weeklyBonusPolicyName || "").trim()
      const description = String(payload.weeklyBonusPolicyDescription || "").trim()
      const targetDays = normalizeInteger(payload.weeklyBonusTargetDays, "Target hari bonus wajib 1 sampai 31.", 1, 31)
      const fullAmount = normalizeBonusAmount(payload.weeklyBonusFullAmount)
      const weekStartDow = normalizeInteger(payload.weeklyBonusWeekStartDow ?? 1, "Hari mulai periode wajib Minggu sampai Sabtu.", 0, 6)
      const paymentDayDow = normalizeInteger(payload.weeklyBonusPaymentDayDow ?? 6, "Hari bayar wajib Minggu sampai Sabtu.", 0, 6)
      const shiftIds = Array.from(new Set(
        Array.isArray(payload.weeklyBonusShiftIds)
          ? payload.weeklyBonusShiftIds.map((id) => String(id || "").trim()).filter(Boolean)
          : [],
      ))

      assertPayload(code, "Kode policy bonus wajib diisi.")
      assertPayload(name, "Nama policy bonus wajib diisi.")
      assertPayload(shiftIds.length > 0, "Minimal satu shift bonus wajib dipilih.")

      const policyPayload = {
        code,
        name,
        description,
        target_days: targetDays,
        full_amount: fullAmount,
        week_start_dow: weekStartDow,
        payment_day_dow: paymentDayDow,
        status: payload.weeklyBonusIsActive === false ? "inactive" : "active",
        is_active: payload.weeklyBonusIsActive !== false,
      }

      const policyQuery = payload.weeklyBonusPolicyId
        ? adminClient
          .from("weekly_bonus_policies")
          .update({ ...policyPayload, updated_at: new Date().toISOString() })
          .eq("id", payload.weeklyBonusPolicyId)
          .select(weeklyBonusPolicyColumns)
          .single()
        : adminClient
          .from("weekly_bonus_policies")
          .upsert(policyPayload, { onConflict: "code" })
          .select(weeklyBonusPolicyColumns)
          .single()

      const { data: policy, error: policyError } = await policyQuery

      if (policyError) {
        if (isMissingLedgerError(policyError)) throw new Error(ledgerMigrationMessage())
        throw policyError
      }

      const { error: resetShiftError } = await adminClient
        .from("weekly_bonus_policy_shifts")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("policy_id", policy.id)

      if (resetShiftError) {
        if (isMissingLedgerError(resetShiftError)) throw new Error(ledgerMigrationMessage())
        throw resetShiftError
      }

      const { error: shiftError } = await adminClient
        .from("weekly_bonus_policy_shifts")
        .upsert(
          shiftIds.map((shiftId) => ({
            policy_id: policy.id,
            shift_id: shiftId,
            is_active: true,
          })),
          { onConflict: "policy_id,shift_id" },
        )

      if (shiftError) {
        if (isMissingLedgerError(shiftError)) throw new Error(ledgerMigrationMessage())
        throw shiftError
      }

      const { error: refreshError } = await adminClient.rpc("refresh_weekly_shift_bonus_cycles")
      if (refreshError && !isMissingLedgerError(refreshError)) throw refreshError

      await adminClient.from("audit_logs").insert({
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: payload.weeklyBonusPolicyId ? "Update pengaturan bonus shift" : "Tambah pengaturan bonus shift",
        target_table: "weekly_bonus_policies",
        target_id: policy.id,
        status: "success",
        metadata: {
          policy_code: policy.code,
          policy_name: policy.name,
          target_days: targetDays,
          full_amount: fullAmount,
          shift_ids: shiftIds,
          source: "edge-function",
        },
      })

      const refreshedPolicy = await fetchWeeklyBonusPolicy(adminClient, String(policy.id || ""))

      return jsonResponse({ ok: true, policy: refreshedPolicy || policy })
    }

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

      const paymentId = getPaymentId(paymentResult)
      const payment = await fetchSingleRecord(adminClient, "overtime_payments", overtimePaymentColumns, paymentId)
      const requests = await fetchRecordsByIds(adminClient, "overtime_requests", overtimeRequestColumns, requestIds)

      return jsonResponse({ ok: true, ...paymentResult, payment, requests })
    }

    if (action === "void_overtime_payment") {
      assertPayload(payload.overtimePaymentId, "ID pembayaran lembur wajib ada.")
      const affectedRequestIds = await fetchRecordIdsByPayment(adminClient, "overtime_requests", "overtime_payment_id", String(payload.overtimePaymentId || ""))

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

      const payment = await fetchSingleRecord(adminClient, "overtime_payments", overtimePaymentColumns, String(payload.overtimePaymentId || ""))
      const requests = await fetchRecordsByIds(adminClient, "overtime_requests", overtimeRequestColumns, affectedRequestIds)

      return jsonResponse({ ok: true, ...paymentResult, payment, requests, restoredRequestIds: affectedRequestIds })
    }

    if (action === "mark_weekly_bonus_paid") {
      const cycleIds = Array.isArray(payload.weeklyBonusCycleIds)
        ? payload.weeklyBonusCycleIds.map((id) => String(id || "").trim()).filter(Boolean)
        : []
      const paidAmount = payload.paidAmount === undefined || payload.paidAmount === null || payload.paidAmount === ""
        ? null
        : normalizePaidAmount(payload.paidAmount, 1)

      assertPayload(cycleIds.length > 0, "Minimal satu bonus shift wajib dipilih.")

      const { data: paymentResult, error: paymentError } = await adminClient.rpc("mark_weekly_shift_bonus_paid", {
        target_bonus_cycle_ids: cycleIds,
        actor_user_id: actor.id,
        actor_name: String(actor.full_name || actor.email || "Finance"),
        target_payment_method: normalizePaymentMethod(payload.paymentMethod),
        target_payment_reference: payload.paymentReference?.trim() || null,
        target_paid_at: normalizePaidAt(payload.paidAt),
        target_paid_amount: paidAmount,
        note_text: notes || "",
      })

      if (paymentError) {
        if (isMissingLedgerError(paymentError)) throw new Error(ledgerMigrationMessage())
        throw paymentError
      }

      const paymentId = getPaymentId(paymentResult)
      const payment = await fetchSingleRecord(adminClient, "weekly_shift_bonus_payments", weeklyBonusPaymentColumns, paymentId)
      const bonusCycles = await fetchRecordsByIds(adminClient, "weekly_shift_bonus_cycles", weeklyBonusCycleColumns, cycleIds)

      return jsonResponse({ ok: true, ...paymentResult, payment, bonusCycles })
    }

    if (action === "void_weekly_bonus_payment") {
      assertPayload(payload.weeklyBonusPaymentId, "ID pembayaran bonus wajib ada.")
      const affectedBonusCycleIds = await fetchRecordIdsByPayment(adminClient, "weekly_shift_bonus_cycles", "payment_id", String(payload.weeklyBonusPaymentId || ""))

      const { data: paymentResult, error: paymentError } = await adminClient.rpc("void_weekly_bonus_payment", {
        target_payment_id: payload.weeklyBonusPaymentId,
        actor_user_id: actor.id,
        actor_name: String(actor.full_name || actor.email || "Finance"),
        note_text: notes || "",
      })

      if (paymentError) {
        if (isMissingLedgerError(paymentError)) throw new Error(ledgerMigrationMessage())
        throw paymentError
      }

      const payment = await fetchSingleRecord(adminClient, "weekly_shift_bonus_payments", weeklyBonusPaymentColumns, String(payload.weeklyBonusPaymentId || ""))
      const bonusCycles = await fetchRecordsByIds(adminClient, "weekly_shift_bonus_cycles", weeklyBonusCycleColumns, affectedBonusCycleIds)

      return jsonResponse({ ok: true, ...paymentResult, payment, bonusCycles, restoredBonusCycleIds: affectedBonusCycleIds })
    }

    assertPayload(payload.cycleId, "ID gaji wajib ada.")

    const { data: cycle, error: cycleError } = await adminClient
      .from("payroll_cycles")
      .select("id, employee_id, cycle_number, work_days_count, target_work_days, gross_amount, overtime_amount, net_amount, status, notes, period_started_at, period_closed_at")
      .eq("id", payload.cycleId)
      .maybeSingle()

    if (cycleError) throw cycleError
    if (!cycle) return jsonResponse({ error: "Data gaji tidak ditemukan." }, 404)

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
      assertPayload(currentStatus === "locked", "Gaji wajib dikunci dulu sebelum dicatat terbayar.")

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

      const paymentId = getPaymentId(paymentResult)
      const [updatedCycle, payment] = await Promise.all([
        fetchSingleRecord(adminClient, "payroll_cycles", payrollCycleColumns, String(cycle.id || "")),
        fetchSingleRecord(adminClient, "payroll_payments", payrollPaymentColumns, paymentId),
      ])

      return jsonResponse({ ok: true, ...paymentResult, payroll: updatedCycle, payment })
    }

    let updatePayload: Record<string, unknown>
    let auditAction: string
    let nextStatus: string

    if (action === "lock") {
      assertPayload(currentStatus === "ready", "Gaji hanya bisa dikunci saat status Siap Dicek.")
      assertPayload(Number(cycle.work_days_count || 0) >= Number(cycle.target_work_days || 26), "Cycle belum mencapai target hari kerja.")
      await assertNoOpenPayrollDependencies(adminClient, cycle)
      await rebuildPayrollCycleItems(adminClient, String(cycle.id))

      nextStatus = "locked"
      auditAction = "Kunci gaji 26 hari"
      updatePayload = {
        status: nextStatus,
        locked_at: now,
        processed_by: actor.id,
        gross_amount: grossAmount,
        overtime_amount: overtimeAmount,
        net_amount: netAmount,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance kunci gaji: ${notes}` : "Finance kunci gaji."),
        updated_at: now,
      }
    } else if (action === "lock_early") {
      const workDaysCount = Number(cycle.work_days_count || 0)
      const targetWorkDays = Number(cycle.target_work_days || 26)
      const reason = notes || ""

      assertPayload(currentStatus === "active", "Kunci dini hanya bisa untuk gaji yang masih Berjalan.")
      assertPayload(workDaysCount > 0, "Kunci dini butuh minimal 1 hari kerja valid.")
      assertPayload(workDaysCount < targetWorkDays, "Cycle sudah mencapai target, gunakan Kunci Gaji biasa.")
      assertPayload(reason.length >= 5, "Alasan kunci dini wajib diisi minimal 5 karakter.")
      await assertNoOpenPayrollDependencies(adminClient, cycle)
      await rebuildPayrollCycleItems(adminClient, String(cycle.id))

      const { data: lastCountedSummary, error: lastCountedError } = await adminClient
        .from("attendance_daily_summaries")
        .select("attendance_date")
        .eq("payroll_cycle_id", cycle.id)
        .eq("workday_counted", true)
        .order("attendance_date", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastCountedError) throw lastCountedError
      assertPayload(lastCountedSummary?.attendance_date, "Tanggal tutup cycle dini tidak ditemukan.")

      nextStatus = "locked"
      auditAction = "Kunci dini gaji"
      updatePayload = {
        status: nextStatus,
        period_closed_at: lastCountedSummary.attendance_date,
        locked_at: now,
        processed_by: actor.id,
        gross_amount: grossAmount,
        overtime_amount: overtimeAmount,
        net_amount: netAmount,
        notes: appendPayrollNote(cycle.notes, `Finance kunci gaji dini (${workDaysCount}/${targetWorkDays} hari): ${reason}`),
        updated_at: now,
      }
    } else if (action === "unlock") {
      assertPayload(currentStatus === "locked", "Hanya gaji berstatus Menunggu Bayar yang bisa dibuka ulang.")

      const workDaysCount = Number(cycle.work_days_count || 0)
      const targetWorkDays = Number(cycle.target_work_days || 26)
      nextStatus = workDaysCount >= targetWorkDays ? "ready" : "active"
      auditAction = "Buka koreksi gaji 26 hari"
      updatePayload = {
        status: nextStatus,
        period_closed_at: workDaysCount >= targetWorkDays ? cycle.period_closed_at : null,
        locked_at: null,
        processed_by: null,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance buka koreksi gaji: ${notes}` : "Finance buka koreksi gaji."),
        updated_at: now,
      }
    } else if (action === "void") {
      assertPayload(currentStatus !== "paid", "Gaji yang sudah terbayar tidak bisa dibatalkan.")
      assertPayload(currentStatus !== "void", "Gaji 26 hari ini sudah dibatalkan.")

      nextStatus = "void"
      auditAction = "Batalkan gaji 26 hari"
      updatePayload = {
        status: nextStatus,
        processed_at: now,
        processed_by: actor.id,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance batalkan gaji: ${notes}` : "Finance batalkan gaji."),
        updated_at: now,
      }
    } else {
      assertPayload(currentStatus === "void", "Hanya gaji yang dibatalkan yang bisa dipulihkan.")

      nextStatus = Number(cycle.work_days_count || 0) >= Number(cycle.target_work_days || 26) ? "ready" : "active"
      auditAction = "Pulihkan gaji 26 hari"
      updatePayload = {
        status: nextStatus,
        locked_at: null,
        processed_at: null,
        processed_by: null,
        paid_at: null,
        net_amount: netAmount,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance pulihkan gaji: ${notes}` : "Finance pulihkan gaji."),
        updated_at: now,
      }
    }

    const { data: updatedCycle, error: updateError } = await adminClient
      .from("payroll_cycles")
      .update(updatePayload)
      .eq("id", cycle.id)
      .select(payrollCycleColumns)
      .single()

    if (updateError) throw updateError

    const auditGrossAmount = Number(updatedCycle.gross_amount ?? grossAmount)
    const auditOvertimeAmount = Number(updatedCycle.overtime_amount ?? overtimeAmount)
    const auditNetAmount = Number(updatedCycle.net_amount ?? netAmount)

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
        gross_amount: auditGrossAmount,
        overtime_amount: auditOvertimeAmount,
        net_amount: auditNetAmount,
        source: "edge-function",
      },
    })

    return jsonResponse({ ok: true, payroll: updatedCycle })
  } catch (error) {
    const message = getErrorMessage(error, "Payroll gagal diproses.")
    return jsonResponse({ error: message }, 400)
  }
})
