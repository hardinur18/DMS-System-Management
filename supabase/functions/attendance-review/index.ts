import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type AttendanceReviewAction = "approve" | "reject" | "reset_day" | "correct_checkout"

interface AttendanceReviewPayload {
  id?: string
  employeeId?: string
  attendanceDate?: string
  checkOutTime?: string
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

function appendReviewNote(existing: unknown, note: string) {
  return [String(existing || "").trim(), note].filter(Boolean).join("\n")
}

function buildJakartaDateTime(attendanceDate: string, time: string) {
  const normalizedTime = time.trim()
  assertPayload(/^\d{2}:\d{2}$/.test(normalizedTime), "Jam pulang wajib format HH:mm.")
  const [hour, minute] = normalizedTime.split(":").map((value) => Number(value))
  assertPayload(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59, "Jam pulang tidak valid.")
  return `${attendanceDate}T${normalizedTime}:00+07:00`
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

    assertPayload(action === "approve" || action === "reject" || action === "reset_day" || action === "correct_checkout", "Action review tidak valid.")

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

    if (action === "correct_checkout") {
      assertPayload(payload.employeeId, "ID karyawan wajib ada.")
      assertPayload(payload.attendanceDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.attendanceDate), "Tanggal absensi wajib format YYYY-MM-DD.")
      assertPayload(payload.checkOutTime, "Jam pulang koreksi wajib ada.")

      const employeeId = payload.employeeId as string
      const attendanceDate = payload.attendanceDate as string
      const checkOutAt = buildJakartaDateTime(attendanceDate, payload.checkOutTime as string)
      const reviewNote = payload.notes?.trim()

      const { data: checkIn, error: checkInError } = await adminClient
        .from("attendance_logs")
        .select("id, employee_id, app_user_id, work_location_id, attendance_date, event_type, event_at, status, notes")
        .eq("employee_id", employeeId)
        .eq("attendance_date", attendanceDate)
        .eq("event_type", "check_in")
        .maybeSingle()

      if (checkInError) throw checkInError
      if (!checkIn) return jsonResponse({ error: "Check-in belum ada. Koreksi checkout harus punya log masuk." }, 404)
      if (checkIn.status === "rejected") return jsonResponse({ error: "Check-in ditolak HR. Koreksi checkout tidak bisa langsung dihitung." }, 409)

      const checkInAt = new Date(String(checkIn.event_at || "")).getTime()
      const checkOutMs = new Date(checkOutAt).getTime()
      assertPayload(Number.isFinite(checkInAt) && Number.isFinite(checkOutMs) && checkOutMs > checkInAt, "Jam pulang harus setelah jam masuk.")

      const correctionNote = reviewNote
        ? `HR koreksi checkout ${payload.checkOutTime}: ${reviewNote}`
        : `HR koreksi checkout ${payload.checkOutTime} tanpa catatan tambahan.`

      const { data: checkOut, error: checkOutError } = await adminClient
        .from("attendance_logs")
        .upsert({
          employee_id: employeeId,
          app_user_id: checkIn.app_user_id,
          work_location_id: checkIn.work_location_id,
          attendance_date: attendanceDate,
          event_type: "check_out",
          event_at: checkOutAt,
          gps_status: "missing",
          face_status: "not_required",
          status: "valid",
          workday_counted: false,
          source: "management",
          notes: correctionNote,
          updated_at: new Date().toISOString(),
        }, { onConflict: "employee_id,attendance_date,event_type" })
        .select("id, employee_id, attendance_date, event_type, status, workday_counted, notes")
        .single()

      if (checkOutError) throw checkOutError

      const { error: checkInUpdateError } = await adminClient
        .from("attendance_logs")
        .update({
          status: "valid",
          workday_counted: true,
          notes: appendReviewNote(checkIn.notes, correctionNote),
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkIn.id)

      if (checkInUpdateError) throw checkInUpdateError

      const { error: refreshError } = await adminClient.rpc("refresh_employee_payroll_cycles", { target_employee_id: employeeId })
      if (refreshError) throw refreshError

      await adminClient.from("audit_logs").insert({
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: "Correct missing checkout",
        target_table: "attendance_logs",
        target_id: `${employeeId}:${attendanceDate}`,
        status: "success",
        metadata: {
          attendance_date: attendanceDate,
          employee_id: employeeId,
          check_in_id: checkIn.id,
          check_out_id: checkOut.id,
          check_out_at: checkOutAt,
          source: "edge-function",
        },
      })

      return jsonResponse({
        ok: true,
        check_in_id: checkIn.id,
        check_out: checkOut,
        attendance_date: attendanceDate,
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

    const { data: dayLogs, error: dayLogsError } = await adminClient
      .from("attendance_logs")
      .select("id, event_type, status, workday_counted")
      .eq("employee_id", attendance.employee_id)
      .eq("attendance_date", attendance.attendance_date)

    if (dayLogsError) throw dayLogsError

    const approved = action === "approve"
    const pairedCheckOut = dayLogs?.find((log) => log.event_type === "check_out" && log.id !== attendance.id)
    const nextWorkdayCounted = approved
      && attendance.event_type === "check_in"
      && pairedCheckOut?.status === "valid"

    const reviewNote = payload.notes?.trim()
    const nextNotes = [
      attendance.notes,
      reviewNote ? `HR ${approved ? "approve" : "reject"}: ${reviewNote}` : `HR ${approved ? "approve" : "reject"} tanpa catatan tambahan.`,
    ].filter(Boolean).join("\n")

    const { data: updatedAttendance, error: updateError } = await adminClient
      .from("attendance_logs")
      .update({
        status: approved ? "valid" : "rejected",
        workday_counted: nextWorkdayCounted,
        notes: nextNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attendance.id)
      .select("id, employee_id, attendance_date, event_type, status, workday_counted, notes")
      .single()

    if (updateError) throw updateError

    if (attendance.event_type === "check_out") {
      const pairedCheckIn = dayLogs?.find((log) => log.event_type === "check_in")
      if (pairedCheckIn) {
        const { error: checkInUpdateError } = await adminClient
          .from("attendance_logs")
          .update({
            workday_counted: approved && pairedCheckIn.status === "valid",
            updated_at: new Date().toISOString(),
          })
          .eq("id", pairedCheckIn.id)

        if (checkInUpdateError) throw checkInUpdateError
      }
    }

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
        workday_counted: attendance.event_type === "check_in" ? nextWorkdayCounted : undefined,
        source: "edge-function",
      },
    })

    return jsonResponse({ ok: true, attendance: updatedAttendance })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review absensi gagal diproses."
    return jsonResponse({ error: message }, 400)
  }
})
