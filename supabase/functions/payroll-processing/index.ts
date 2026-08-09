import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type PayrollProcessAction = "lock" | "mark_paid" | "unlock" | "void" | "restore"

interface PayrollProcessPayload {
  cycleId?: string
  notes?: string
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

    assertPayload(action === "lock" || action === "mark_paid" || action === "unlock" || action === "void" || action === "restore", "Action payroll tidak valid.")
    assertPayload(payload.cycleId, "ID payroll cycle wajib ada.")

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
    const notes = payload.notes?.trim()
    const grossAmount = Number(cycle.gross_amount || 0)
    const overtimeAmount = Number(cycle.overtime_amount || 0)
    const netAmount = Math.max(0, grossAmount + overtimeAmount)
    const currentStatus = String(cycle.status || "active")
    const employeeName = String(employee?.full_name || "Karyawan")
    const employeeCode = String(employee?.employee_code || "")

    let updatePayload: Record<string, unknown>
    let auditAction: string
    let nextStatus: string

    if (action === "lock") {
      assertPayload(currentStatus === "ready", "Payroll hanya bisa dikunci saat status Siap Gajian.")
      assertPayload(Number(cycle.work_days_count || 0) >= Number(cycle.target_work_days || 26), "Cycle belum mencapai target hari kerja.")

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
    } else if (action === "mark_paid") {
      assertPayload(currentStatus === "locked", "Payroll wajib dikunci sebelum ditandai terbayar.")

      nextStatus = "paid"
      auditAction = "Mark payroll paid"
      updatePayload = {
        status: nextStatus,
        processed_at: now,
        paid_at: now,
        processed_by: actor.id,
        notes: appendPayrollNote(cycle.notes, notes ? `Finance mark paid: ${notes}` : "Finance mark paid."),
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
