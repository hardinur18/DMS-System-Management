import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

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

function mapFaceStatus(status: unknown) {
  if (status === "approved" || status === "pending_review" || status === "rejected" || status === "disabled" || status === "unenrolled") return status
  if (status === "enrolled") return "approved"
  if (status === "review") return "pending_review"
  return "unenrolled"
}

function mapPayrollStatus(status: unknown) {
  if (status === "ready" || status === "locked" || status === "paid" || status === "void") return status
  return "active"
}

function mapAttendanceLog(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    attendanceDate: String(row.attendance_date || ""),
    eventType: row.event_type === "check_out" ? "check_out" : "check_in",
    eventAt: String(row.event_at || ""),
    status: row.status === "valid" || row.status === "rejected" ? row.status : "review",
    gpsStatus: row.gps_status === "valid" || row.gps_status === "out_of_radius" ? row.gps_status : "missing",
    faceStatus: row.face_status === "verified" || row.face_status === "review" || row.face_status === "failed" ? row.face_status : "not_required",
    faceScore: row.face_score === null || row.face_score === undefined ? null : Number(row.face_score),
    distanceM: row.distance_m === null || row.distance_m === undefined ? null : Number(row.distance_m),
    radiusM: row.radius_m === null || row.radius_m === undefined ? null : Number(row.radius_m),
    workdayCounted: row.workday_counted === true,
    notes: String(row.notes || ""),
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
    const token = authorization.replace(/^Bearer\s+/i, "")
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: "Session tidak valid." }, 401)

    const { data: actor, error: actorError } = await adminClient
      .from("app_users")
      .select("id, full_name, email, status, employee_id, app_scope")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle()

    if (actorError) throw actorError
    if (!actor || actor.status !== "active") return jsonResponse({ error: "Akses user lapangan tidak aktif." }, 403)
    if (actor.app_scope !== "field" && actor.app_scope !== "both") return jsonResponse({ error: "User belum punya scope app lapangan." }, 403)
    if (!actor.employee_id) return jsonResponse({ error: "User belum dikaitkan ke data karyawan." }, 403)

    const employeeId = String(actor.employee_id)
    await adminClient.rpc("refresh_employee_payroll_cycles", { target_employee_id: employeeId }).catch(() => {})

    const [employeeResult, faceResult, payrollResult, logsResult] = await Promise.all([
      adminClient
        .from("employees")
        .select("id, employee_code, full_name, photo_path, division_id, position_id, work_location_id, shift_id, salary_type, daily_salary, monthly_salary, payroll_method, join_date, status")
        .eq("id", employeeId)
        .is("deleted_at", null)
        .maybeSingle(),
      adminClient
        .from("employee_face_profiles")
        .select("status, verification_required, face_score_threshold, submitted_at, reviewed_at, review_notes")
        .eq("employee_id", employeeId)
        .maybeSingle(),
      adminClient
        .from("payroll_cycles")
        .select("id, cycle_number, work_days_count, target_work_days, gross_amount, overtime_amount, net_amount, status, period_started_at, period_closed_at, ready_at")
        .eq("employee_id", employeeId)
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient
        .from("attendance_logs")
        .select("id, attendance_date, event_type, event_at, status, gps_status, face_status, face_score, distance_m, radius_m, workday_counted, notes")
        .eq("employee_id", employeeId)
        .order("event_at", { ascending: false })
        .limit(30),
    ])

    if (employeeResult.error) throw employeeResult.error
    if (faceResult.error) throw faceResult.error
    if (payrollResult.error) throw payrollResult.error
    if (logsResult.error) throw logsResult.error
    if (!employeeResult.data) return jsonResponse({ error: "Data karyawan tidak ditemukan." }, 404)

    const employee = employeeResult.data as Record<string, unknown>
    const divisionId = String(employee.division_id || "")
    const positionId = String(employee.position_id || "")
    const locationId = String(employee.work_location_id || "")
    const shiftId = String(employee.shift_id || "")

    const [divisionResult, positionResult, locationResult, shiftResult] = await Promise.all([
      divisionId ? adminClient.from("divisions").select("name").eq("id", divisionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      positionId ? adminClient.from("positions").select("name").eq("id", positionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      locationId ? adminClient.from("work_locations").select("name, address, latitude, longitude, radius_m").eq("id", locationId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      shiftId ? adminClient.from("shifts").select("name").eq("id", shiftId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])

    if (divisionResult.error) throw divisionResult.error
    if (positionResult.error) throw positionResult.error
    if (locationResult.error) throw locationResult.error
    if (shiftResult.error) throw shiftResult.error

    const location = (locationResult.data || {}) as Record<string, unknown>
    const logs = ((logsResult.data || []) as Array<Record<string, unknown>>).map(mapAttendanceLog)
    const todayKey = new Date().toISOString().slice(0, 10)
    const payroll = payrollResult.data as Record<string, unknown> | null
    const face = faceResult.data as Record<string, unknown> | null

    return jsonResponse({
      ok: true,
      profile: {
        id: actor.id,
        name: actor.full_name,
        email: actor.email,
      },
      employee: {
        id: employee.id,
        code: employee.employee_code,
        name: employee.full_name,
        photoPath: employee.photo_path || "",
        divisionName: divisionResult.data?.name || "Belum pilih divisi",
        positionName: positionResult.data?.name || "Belum pilih jabatan",
        workLocationName: location.name || "Belum pilih lokasi",
        workLocationAddress: location.address || "",
        workLocationLatitude: location.latitude === null || location.latitude === undefined ? "" : String(location.latitude),
        workLocationLongitude: location.longitude === null || location.longitude === undefined ? "" : String(location.longitude),
        radiusM: Number(location.radius_m || 0),
        shiftName: shiftResult.data?.name || "Belum pilih shift",
        salaryType: employee.salary_type === "monthly" ? "monthly" : "daily",
        dailySalary: Number(employee.daily_salary || 0),
        monthlySalary: Number(employee.monthly_salary || 0),
        payrollMethod: employee.payroll_method === "calendar_month" || employee.payroll_method === "custom" ? employee.payroll_method : "attendance_cycle",
        joinDate: employee.join_date || "",
        status: employee.status === "review" || employee.status === "inactive" ? employee.status : "active",
      },
      faceProfile: {
        status: mapFaceStatus(face?.status),
        threshold: Number(face?.face_score_threshold || 85),
        verificationRequired: face?.verification_required !== false,
        submittedAt: face?.submitted_at || "",
        reviewedAt: face?.reviewed_at || "",
        reviewNotes: face?.review_notes || "",
      },
      payrollCycle: payroll ? {
        id: payroll.id,
        cycleNumber: Number(payroll.cycle_number || 0),
        workDaysCount: Number(payroll.work_days_count || 0),
        targetWorkDays: Number(payroll.target_work_days || 26),
        grossAmount: Number(payroll.gross_amount || 0),
        overtimeAmount: Number(payroll.overtime_amount || 0),
        netAmount: Number(payroll.net_amount || 0),
        status: mapPayrollStatus(payroll.status),
        periodStartedAt: payroll.period_started_at || "",
        periodClosedAt: payroll.period_closed_at || "",
        readyAt: payroll.ready_at || "",
      } : null,
      todayLogs: logs.filter((log) => log.attendanceDate === todayKey),
      recentLogs: logs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Data app karyawan belum bisa dibaca."
    return jsonResponse({ error: message }, 400)
  }
})
