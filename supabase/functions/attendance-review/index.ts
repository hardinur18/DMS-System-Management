import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type AttendanceReviewAction = "approve" | "reject" | "reset_day" | "correct_checkin" | "correct_checkout"

interface AttendanceReviewPayload {
  id?: string
  employeeId?: string
  attendanceDate?: string
  checkInDate?: string
  checkInTime?: string
  checkOutDate?: string
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

function shiftDateKey(dateKey: string, offsetDays: number) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value))
  const base = new Date(Date.UTC(year, month - 1, day + offsetDays))
  return base.toISOString().slice(0, 10)
}

function parseTimeMinutes(value: unknown) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

function buildJakartaDateTime(attendanceDate: string, time: string, label: string) {
  const normalizedTime = String(time || "").trim()
  assertPayload(/^\d{2}:\d{2}$/.test(normalizedTime), `${label} wajib format HH:mm.`)
  const [hour, minute] = normalizedTime.split(":").map((value) => Number(value))
  assertPayload(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59, `${label} tidak valid.`)
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

    assertPayload(action === "approve" || action === "reject" || action === "reset_day" || action === "correct_checkin" || action === "correct_checkout", "Action review tidak valid.")

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
        .select("id, employee_id, attendance_date, event_type, face_snapshot_path, status, biofinger_event_id")
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

      const deletedLogIds = logs.map((log) => String(log.id)).filter(Boolean)
      const biofingerEventIds = logs.map((log) => String(log.biofinger_event_id || "")).filter(Boolean)
      const biofingerResetNote = appendReviewNote(
        "",
        `Direset HR ${attendanceDate}. Raw event lama diabaikan agar tidak otomatis membuat ulang absensi yang sudah direset.`,
      )

      if (biofingerEventIds.length > 0) {
        const { error: rawEventError } = await adminClient
          .from("biofinger_attendance_events")
          .update({
            import_status: "ignored",
            converted_attendance_log_id: null,
            notes: biofingerResetNote,
            updated_at: new Date().toISOString(),
          })
          .in("id", biofingerEventIds)

        if (rawEventError) throw rawEventError
      }

      if (deletedLogIds.length > 0) {
        const { error: linkedRawEventError } = await adminClient
          .from("biofinger_attendance_events")
          .update({
            import_status: "ignored",
            converted_attendance_log_id: null,
            notes: biofingerResetNote,
            updated_at: new Date().toISOString(),
          })
          .in("converted_attendance_log_id", deletedLogIds)

        if (linkedRawEventError) throw linkedRawEventError
      }

      const { error: deleteError } = await adminClient
        .from("attendance_logs")
        .delete()
        .eq("employee_id", employeeId)
        .eq("attendance_date", attendanceDate)

      if (deleteError) throw deleteError

      const { error: summaryRefreshError } = await adminClient.rpc("refresh_attendance_daily_summary", {
        target_employee_id: employeeId,
        target_attendance_date: attendanceDate,
      })
      if (summaryRefreshError) throw summaryRefreshError

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
          biofinger_raw_events_ignored: biofingerEventIds.length,
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

    if (action === "correct_checkin") {
      assertPayload(payload.employeeId, "ID karyawan wajib ada.")
      assertPayload(payload.attendanceDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.attendanceDate), "Tanggal absensi wajib format YYYY-MM-DD.")
      assertPayload(payload.checkInTime, "Jam masuk koreksi wajib ada.")

      const employeeId = payload.employeeId as string
      const attendanceDate = payload.attendanceDate as string
      const checkInDate = payload.checkInDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.checkInDate)
        ? payload.checkInDate
        : attendanceDate
      const checkInAt = buildJakartaDateTime(checkInDate, payload.checkInTime as string, "Jam masuk")
      const reviewNote = payload.notes?.trim()

      assertPayload(checkInDate === attendanceDate, "Tanggal masuk harus sama dengan tanggal absensi.")

      const { data: employee, error: employeeError } = await adminClient
        .from("employees")
        .select("id, work_location_id")
        .eq("id", employeeId)
        .maybeSingle()

      if (employeeError) throw employeeError
      if (!employee) return jsonResponse({ error: "Data karyawan tidak ditemukan." }, 404)

      const { data: dayLogs, error: dayLogsError } = await adminClient
        .from("attendance_logs")
        .select("id, employee_id, app_user_id, work_location_id, attendance_date, event_type, event_at, status, notes")
        .eq("employee_id", employeeId)
        .eq("attendance_date", attendanceDate)

      if (dayLogsError) throw dayLogsError

      const existingCheckIn = dayLogs?.find((log) => log.event_type === "check_in")
      const existingCheckOut = dayLogs?.find((log) => log.event_type === "check_out" && log.status !== "rejected")

      const checkInMs = new Date(checkInAt).getTime()
      assertPayload(Number.isFinite(checkInMs), "Jam masuk tidak valid.")
      assertPayload(checkInMs <= Date.now() + 5 * 60 * 1000, "Jam masuk tidak boleh melebihi waktu sekarang.")

      if (existingCheckOut?.event_at) {
        const checkOutMs = new Date(String(existingCheckOut.event_at)).getTime()
        assertPayload(Number.isFinite(checkOutMs) && checkInMs < checkOutMs, "Jam masuk harus sebelum jam pulang.")
        assertPayload(checkOutMs - checkInMs <= 24 * 60 * 60 * 1000, "Durasi koreksi terlalu panjang. Cek ulang tanggal dan jam masuk.")
      }

      const { data: appUser, error: appUserError } = await adminClient
        .from("app_users")
        .select("id")
        .eq("employee_id", employeeId)
        .maybeSingle()

      if (appUserError) throw appUserError

      const correctionNote = reviewNote
        ? `HR koreksi check-in ${checkInDate} ${payload.checkInTime}: ${reviewNote}`
        : `HR koreksi check-in ${checkInDate} ${payload.checkInTime} tanpa catatan tambahan.`

      const nowIso = new Date().toISOString()
      const { data: checkIn, error: checkInError } = await adminClient
        .from("attendance_logs")
        .upsert({
          employee_id: employeeId,
          app_user_id: existingCheckIn?.app_user_id || existingCheckOut?.app_user_id || appUser?.id || null,
          work_location_id: existingCheckIn?.work_location_id || existingCheckOut?.work_location_id || employee.work_location_id || null,
          attendance_date: attendanceDate,
          event_type: "check_in",
          event_at: checkInAt,
          gps_status: "missing",
          face_status: "not_required",
          status: "valid",
          workday_counted: Boolean(existingCheckOut),
          source: "management",
          attendance_media: "manual",
          notes: appendReviewNote(existingCheckIn?.notes, correctionNote),
          updated_at: nowIso,
        }, { onConflict: "employee_id,attendance_date,event_type" })
        .select("id, employee_id, attendance_date, event_type, status, workday_counted, notes")
        .single()

      if (checkInError) throw checkInError

      if (existingCheckOut) {
        const { error: checkOutUpdateError } = await adminClient
          .from("attendance_logs")
          .update({
            notes: appendReviewNote(existingCheckOut.notes, correctionNote),
            updated_at: nowIso,
          })
          .eq("id", existingCheckOut.id)

        if (checkOutUpdateError) throw checkOutUpdateError
      }

      const { error: summaryRefreshError } = await adminClient.rpc("refresh_attendance_daily_summary", {
        target_employee_id: employeeId,
        target_attendance_date: attendanceDate,
      })
      if (summaryRefreshError) throw summaryRefreshError

      const { error: refreshError } = await adminClient.rpc("refresh_employee_payroll_cycles", { target_employee_id: employeeId })
      if (refreshError) throw refreshError

      await adminClient.from("audit_logs").insert({
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: "Correct missing checkin",
        target_table: "attendance_logs",
        target_id: `${employeeId}:${attendanceDate}`,
        status: "success",
        metadata: {
          attendance_date: attendanceDate,
          employee_id: employeeId,
          check_in_id: checkIn.id,
          check_out_id: existingCheckOut?.id || null,
          check_in_at: checkInAt,
          check_in_date: checkInDate,
          source: "edge-function",
        },
      })

      return jsonResponse({
        ok: true,
        check_in: checkIn,
        attendance_date: attendanceDate,
      })
    }

    if (action === "correct_checkout") {
      assertPayload(payload.employeeId, "ID karyawan wajib ada.")
      assertPayload(payload.attendanceDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.attendanceDate), "Tanggal absensi wajib format YYYY-MM-DD.")
      assertPayload(payload.checkOutTime, "Jam pulang koreksi wajib ada.")

      const employeeId = payload.employeeId as string
      const attendanceDate = payload.attendanceDate as string
      const checkOutDate = payload.checkOutDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.checkOutDate)
        ? payload.checkOutDate
        : attendanceDate
      const checkOutAt = buildJakartaDateTime(checkOutDate, payload.checkOutTime as string, "Jam pulang")
      const reviewNote = payload.notes?.trim()

      const { data: employee, error: employeeError } = await adminClient
        .from("employees")
        .select("shift_id")
        .eq("id", employeeId)
        .maybeSingle()

      if (employeeError) throw employeeError

      let overnightShift = false
      if (employee?.shift_id) {
        const { data: shift, error: shiftError } = await adminClient
          .from("shifts")
          .select("start_time, end_time")
          .eq("id", employee.shift_id)
          .maybeSingle()

        if (shiftError) throw shiftError

        const startMinutes = parseTimeMinutes(shift?.start_time)
        const endMinutes = parseTimeMinutes(shift?.end_time)
        overnightShift = startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes
      }

      const maxAllowedCheckoutDate = overnightShift ? shiftDateKey(attendanceDate, 1) : attendanceDate
      assertPayload(
        checkOutDate === attendanceDate || (overnightShift && checkOutDate === maxAllowedCheckoutDate),
        overnightShift
          ? "Tanggal pulang shift malam hanya boleh tanggal masuk atau tanggal berikutnya."
          : "Tanggal pulang harus sama dengan tanggal absensi untuk shift reguler.",
      )

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
      assertPayload(checkOutMs <= Date.now() + 5 * 60 * 1000, "Jam pulang tidak boleh melebihi waktu sekarang.")
      assertPayload(checkOutMs - checkInAt <= 24 * 60 * 60 * 1000, "Durasi koreksi terlalu panjang. Cek ulang tanggal dan jam pulang.")

      const correctionNote = reviewNote
        ? `HR koreksi checkout ${checkOutDate} ${payload.checkOutTime}: ${reviewNote}`
        : `HR koreksi checkout ${checkOutDate} ${payload.checkOutTime} tanpa catatan tambahan.`

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
          attendance_media: "manual",
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

      const { error: summaryRefreshError } = await adminClient.rpc("refresh_attendance_daily_summary", {
        target_employee_id: employeeId,
        target_attendance_date: attendanceDate,
      })
      if (summaryRefreshError) throw summaryRefreshError

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
          check_out_date: checkOutDate,
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

    const { error: summaryRefreshError } = await adminClient.rpc("refresh_attendance_daily_summary", {
      target_employee_id: attendance.employee_id,
      target_attendance_date: attendance.attendance_date,
    })
    if (summaryRefreshError) throw summaryRefreshError

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
