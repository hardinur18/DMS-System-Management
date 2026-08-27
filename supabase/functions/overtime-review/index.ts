import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type OvertimeReviewAction = "approve" | "reject"

interface OvertimeReviewPayload {
  id?: string
  approvedMinutes?: number
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
    const body = await request.json() as { action?: OvertimeReviewAction; payload?: OvertimeReviewPayload }
    const action = body.action
    const payload = body.payload || {}

    assertPayload(action === "approve" || action === "reject", "Action lembur tidak valid.")
    assertPayload(payload.id, "ID lembur wajib ada.")

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
      .eq("permission_key", "overtime.review")
      .eq("enabled", true)
      .maybeSingle()

    if (permissionError) throw permissionError
    if (!permission) return jsonResponse({ error: "Role tidak punya permission Review Lembur." }, 403)

    const { data: overtime, error: overtimeError } = await adminClient
      .from("overtime_requests")
      .select("id, employee_id, payroll_cycle_id, overtime_date, overtime_minutes, approved_minutes, rate_amount, total_amount, status, request_source, overtime_basis, actual_check_out_at, notes")
      .eq("id", payload.id)
      .maybeSingle()

    if (overtimeError) throw overtimeError
    if (!overtime) return jsonResponse({ error: "Data lembur tidak ditemukan." }, 404)

    let payrollCycle: { status?: string; cycle_number?: number } | null = null

    if (overtime.payroll_cycle_id) {
      const { data: cycle, error: cycleError } = await adminClient
        .from("payroll_cycles")
        .select("status, cycle_number")
        .eq("id", overtime.payroll_cycle_id)
        .maybeSingle()

      if (cycleError) throw cycleError
      payrollCycle = cycle
    }

    const approved = action === "approve"
    const requestedMinutes = Number(overtime.overtime_minutes || 0)
    const reviewNote = payload.notes?.trim()
    const isPlannedDraft = overtime.status === "draft" && overtime.request_source === "planned"

    if (overtime.status === "approved" || overtime.status === "rejected") {
      return jsonResponse({ error: "Approval lembur sudah final dan tidak bisa diproses ulang." }, 409)
    }

    if (payrollCycle?.status === "locked" || payrollCycle?.status === "paid") {
      return jsonResponse({
        error: payrollCycle.status === "paid"
          ? "Payroll cycle sudah terbayar. Lembur tidak bisa diubah dari approval."
          : "Payroll cycle sudah locked. Lembur tidak bisa diubah dari approval.",
      }, 409)
    }

    if (!approved && !reviewNote) {
      return jsonResponse({ error: "Catatan wajib diisi untuk reject lembur." }, 400)
    }

    if (approved && (!overtime.actual_check_out_at || overtime.status === "draft" || requestedMinutes <= 0)) {
      return jsonResponse({ error: "Request lembur belum punya realisasi checkout dan menit payable." }, 400)
    }

    const approvedMinutes = approved
      ? Math.max(0, Math.min(requestedMinutes, Number(payload.approvedMinutes ?? requestedMinutes)))
      : 0

    if (approved && approvedMinutes <= 0) {
      return jsonResponse({ error: "Menit lembur yang dibayar harus lebih dari 0." }, 400)
    }

    const rateAmount = Number(overtime.rate_amount || 0)
    const totalAmount = approved ? Math.round((approvedMinutes / 60) * rateAmount) : 0
    const rejectVerb = isPlannedDraft ? "batalkan request" : "reject"
    const nextNotes = [
      overtime.notes,
      reviewNote ? `HR ${approved ? "approve" : rejectVerb} lembur: ${reviewNote}` : `HR ${approved ? "approve" : rejectVerb} lembur tanpa catatan tambahan.`,
    ].filter(Boolean).join("\n")

    const { data: updatedOvertime, error: updateError } = await adminClient
      .from("overtime_requests")
      .update({
        status: approved ? "approved" : "rejected",
        approved_minutes: approvedMinutes,
        total_amount: totalAmount,
        reviewed_by: actor.id,
        reviewed_at: new Date().toISOString(),
        notes: nextNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", overtime.id)
      .select("id, employee_id, overtime_date, overtime_minutes, approved_minutes, rate_amount, total_amount, status, notes")
      .single()

    if (updateError) throw updateError

    const { error: refreshError } = await adminClient.rpc("refresh_employee_payroll_cycles", { target_employee_id: overtime.employee_id })
    if (refreshError) throw refreshError

    await adminClient.from("audit_logs").insert({
      actor_user_id: actor.id,
      actor_name: actor.full_name,
      action: approved ? "Approve overtime" : isPlannedDraft ? "Cancel overtime request" : "Reject overtime",
      target_table: "overtime_requests",
      target_id: overtime.id,
      status: "success",
      metadata: {
        overtime_date: overtime.overtime_date,
        previous_status: overtime.status,
        next_status: approved ? "approved" : "rejected",
        overtime_minutes: requestedMinutes,
        approved_minutes: approvedMinutes,
        total_amount: totalAmount,
        request_source: overtime.request_source,
        overtime_basis: overtime.overtime_basis,
        payroll_cycle_number: payrollCycle?.cycle_number || null,
        payroll_status: payrollCycle?.status || null,
        source: "edge-function",
      },
    })

    return jsonResponse({ ok: true, overtime: updatedOvertime })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review lembur gagal diproses."
    return jsonResponse({ error: message }, 400)
  }
})
