import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type AttendanceReviewAction = "approve" | "reject" | "reset_day"

interface AttendanceReviewPayload {
  id?: string
  employeeId?: string
  attendanceDate?: string
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
    const body = await request.json() as { action?: AttendanceReviewAction; payload?: AttendanceReviewPayload }
    const action = body.action
    const payload = body.payload || {}

    assertPayload(action === "approve" || action === "reject" || action === "reset_day", "Action review tidak valid.")

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
      .eq("permission_key", "attendance.review")
      .eq("enabled", true)
      .maybeSingle()

    if (permissionError) throw permissionError
    if (!permission) return jsonResponse({ error: "Role tidak punya permission Review Absensi." }, 403)

    if (action === "reset_day") {
      assertPayload(payload.employeeId, "ID karyawan wajib ada.")
      assertPayload(payload.attendanceDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.attendanceDate), "Tanggal absensi wajib format YYYY-MM-DD.")
      const employeeId = payload.employeeId as string
      const attendanceDate = payload.attendanceDate as string

      const { data: logs, error: logsError } = await adminClient
        .from("attendance_logs")
        .select("id, employee_id, attendance_date, event_type, face_snapshot_path, status")
        .eq("employee_id", employeeId)
        .eq("attendance_date", attendanceDate)

      if (logsError) throw logsError
      if (!logs || logs.length === 0) return jsonResponse({ error: "Tidak ada data absensi untuk direset." }, 404)

      const snapshotPaths = logs
        .map((log) => String(log.face_snapshot_path || ""))
        .filter(Boolean)

      if (snapshotPaths.length > 0) {
        const { error: storageError } = await adminClient.storage.from("attendance-faces").remove(snapshotPaths)
        if (storageError) throw storageError
      }

      const { error: deleteError } = await adminClient
        .from("attendance_logs")
        .delete()
        .eq("employee_id", employeeId)
        .eq("attendance_date", attendanceDate)

      if (deleteError) throw deleteError

      const { error: refreshError } = await adminClient.rpc("refresh_employee_payroll_cycles", { target_employee_id: employeeId })
      if (refreshError) throw refreshError

      await adminClient.from("audit_logs").insert({
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: "Reset attendance day",
        target_table: "attendance_logs",
        target_id: `${employeeId}:${attendanceDate}`,
        status: "success",
        metadata: {
          attendance_date: attendanceDate,
          employee_id: employeeId,
          deleted_count: logs.length,
          deleted_ids: logs.map((log) => log.id),
          snapshot_paths: snapshotPaths,
          notes: payload.notes?.trim() || "",
          source: "edge-function",
        },
      })

      return jsonResponse({
        ok: true,
        employee_id: employeeId,
        attendance_date: attendanceDate,
        deleted_count: logs.length,
      })
    }

    assertPayload(payload.id, "ID absensi wajib ada.")

    const { data: attendance, error: attendanceError } = await adminClient
      .from("attendance_logs")
      .select("id, employee_id, attendance_date, event_type, status, workday_counted, notes")
      .eq("id", payload.id)
      .maybeSingle()

    if (attendanceError) throw attendanceError
    if (!attendance) return jsonResponse({ error: "Data absensi tidak ditemukan." }, 404)

    const approved = action === "approve"
    const reviewNote = payload.notes?.trim()
    const nextNotes = [
      attendance.notes,
      reviewNote ? `HR ${approved ? "approve" : "reject"}: ${reviewNote}` : `HR ${approved ? "approve" : "reject"} tanpa catatan tambahan.`,
    ].filter(Boolean).join("\n")

    const { data: updatedAttendance, error: updateError } = await adminClient
      .from("attendance_logs")
      .update({
        status: approved ? "valid" : "rejected",
        workday_counted: approved && attendance.event_type === "check_in",
        notes: nextNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attendance.id)
      .select("id, employee_id, attendance_date, event_type, status, workday_counted, notes")
      .single()

    if (updateError) throw updateError

    const { error: refreshError } = await adminClient.rpc("refresh_employee_payroll_cycles", { target_employee_id: attendance.employee_id })
    if (refreshError) throw refreshError

    await adminClient.from("audit_logs").insert({
      actor_user_id: actor.id,
      actor_name: actor.full_name,
      action: approved ? "Approve attendance review" : "Reject attendance review",
      target_table: "attendance_logs",
      target_id: attendance.id,
      status: "success",
      metadata: {
        attendance_date: attendance.attendance_date,
        event_type: attendance.event_type,
        previous_status: attendance.status,
        next_status: approved ? "valid" : "rejected",
        workday_counted: approved && attendance.event_type === "check_in",
        source: "edge-function",
      },
    })

    return jsonResponse({ ok: true, attendance: updatedAttendance })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review absensi gagal diproses."
    return jsonResponse({ error: message }, 400)
  }
})
