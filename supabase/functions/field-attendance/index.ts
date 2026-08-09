import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type AttendanceEventType = "check_in" | "check_out"

interface FieldAttendancePayload {
  eventType?: AttendanceEventType
  latitude?: number
  longitude?: number
  faceScore?: number | null
  faceSnapshotBase64?: string | null
  faceSnapshotContentType?: string | null
  faceSnapshotPath?: string | null
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

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function haversineDistanceMeters(fromLat: number, fromLon: number, toLat: number, toLon: number) {
  const earthRadiusM = 6371000
  const toRadians = (value: number) => (value * Math.PI) / 180
  const latDelta = toRadians(toLat - fromLat)
  const lonDelta = toRadians(toLon - fromLon)
  const startLat = toRadians(fromLat)
  const endLat = toRadians(toLat)
  const halfChord = Math.sin(latDelta / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(lonDelta / 2) ** 2

  return Math.round(earthRadiusM * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord)))
}

function decodeBase64Image(value: string) {
  const base64 = value.includes(",") ? value.split(",").pop() || "" : value
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function getImageExtension(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
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
    const payload = await request.json() as FieldAttendancePayload
    const eventType = payload.eventType || "check_in"
    const latitude = toNumber(payload.latitude)
    const longitude = toNumber(payload.longitude)
    const faceScore = payload.faceScore === null || payload.faceScore === undefined ? null : toNumber(payload.faceScore)
    const faceSnapshotBase64 = payload.faceSnapshotBase64?.trim() || ""
    const faceSnapshotContentType = payload.faceSnapshotContentType?.trim() || "image/jpeg"
    let faceSnapshotPath = payload.faceSnapshotPath?.trim() || null

    assertPayload(eventType === "check_in" || eventType === "check_out", "Tipe absensi tidak valid.")
    assertPayload(latitude !== null && latitude >= -90 && latitude <= 90, "Latitude GPS tidak valid.")
    assertPayload(longitude !== null && longitude >= -180 && longitude <= 180, "Longitude GPS tidak valid.")
    assertPayload(faceScore === null || (faceScore >= 0 && faceScore <= 100), "Face score harus 0 sampai 100.")
    assertPayload(!faceSnapshotBase64 || ["image/jpeg", "image/png", "image/webp"].includes(faceSnapshotContentType), "Format snapshot wajah tidak valid.")
    assertPayload(!faceSnapshotPath || faceSnapshotPath.startsWith("attendance/"), "Path snapshot wajah tidak valid.")

    const token = authorization.replace(/^Bearer\s+/i, "")
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: "Session tidak valid." }, 401)

    const { data: actor, error: actorError } = await adminClient
      .from("app_users")
      .select("id, full_name, status, employee_id, app_scope")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle()

    if (actorError) throw actorError
    if (!actor || actor.status !== "active") return jsonResponse({ error: "Akses user lapangan tidak aktif." }, 403)
    if (actor.app_scope !== "field" && actor.app_scope !== "both") return jsonResponse({ error: "User belum punya scope app lapangan." }, 403)
    if (!actor.employee_id) return jsonResponse({ error: "User belum dikaitkan ke data karyawan." }, 403)

    const { data: employee, error: employeeError } = await adminClient
      .from("employees")
      .select("id, employee_code, full_name, status, work_location_id")
      .eq("id", actor.employee_id)
      .is("deleted_at", null)
      .maybeSingle()

    if (employeeError) throw employeeError
    if (!employee) return jsonResponse({ error: "Data karyawan tidak ditemukan." }, 404)
    if (employee.status === "inactive") return jsonResponse({ error: "Karyawan nonaktif tidak bisa absensi." }, 403)
    if (!employee.work_location_id) return jsonResponse({ error: "Lokasi kerja karyawan belum diset." }, 422)

    const { data: location, error: locationError } = await adminClient
      .from("work_locations")
      .select("id, name, latitude, longitude, radius_m, is_active")
      .eq("id", employee.work_location_id)
      .maybeSingle()

    if (locationError) throw locationError
    if (!location || location.is_active === false) return jsonResponse({ error: "Lokasi kerja belum aktif." }, 422)

    const locationLat = toNumber(location.latitude)
    const locationLon = toNumber(location.longitude)
    const radiusM = Number(location.radius_m || 0)
    assertPayload(locationLat !== null && locationLon !== null && radiusM > 0, "Koordinat atau radius lokasi kerja belum lengkap.")

    const distanceM = haversineDistanceMeters(latitude, longitude, locationLat, locationLon)
    const gpsStatus = distanceM <= radiusM ? "valid" : "out_of_radius"

    const { data: faceProfile, error: faceProfileError } = await adminClient
      .from("employee_face_profiles")
      .select("verification_required, face_score_threshold, status, reference_image_path")
      .eq("employee_id", employee.id)
      .maybeSingle()

    if (faceProfileError) throw faceProfileError

    const verificationRequired = faceProfile?.verification_required !== false
    const faceThreshold = Number(faceProfile?.face_score_threshold || 85)
    const faceProfileApproved = faceProfile?.status === "approved" || faceProfile?.status === "enrolled"
    if (verificationRequired && !faceProfileApproved) {
      return jsonResponse({ error: "Profil wajah belum approved HR. Daftarkan wajah dulu sebelum absensi." }, 422)
    }

    const faceStatus = !verificationRequired
      ? "not_required"
      : faceScore === null
        ? "review"
        : faceScore >= faceThreshold
          ? "verified"
          : faceScore >= Math.max(0, faceThreshold - 15)
            ? "review"
            : "failed"
    const status = gpsStatus === "valid" && (faceStatus === "verified" || faceStatus === "not_required") ? "valid" : "review"
    const workdayCounted = eventType === "check_in" && status === "valid"
    const eventDateKey = new Date().toISOString().slice(0, 10)

    if (faceSnapshotBase64) {
      const bytes = decodeBase64Image(faceSnapshotBase64)
      assertPayload(bytes.length <= 2 * 1024 * 1024, "Ukuran snapshot wajah maksimal 2MB.")

      const extension = getImageExtension(faceSnapshotContentType)
      faceSnapshotPath = `attendance/${employee.employee_code}/${eventDateKey}-${eventType}.${extension}`
      const { error: uploadError } = await adminClient.storage.from("attendance-faces").upload(faceSnapshotPath, bytes, {
        cacheControl: "3600",
        contentType: faceSnapshotContentType,
        upsert: true,
      })

      if (uploadError) throw uploadError
    }

    const logPayload: Record<string, unknown> = {
      employee_id: employee.id,
      app_user_id: actor.id,
      work_location_id: location.id,
      event_type: eventType,
      latitude,
      longitude,
      distance_m: distanceM,
      radius_m: radiusM,
      gps_status: gpsStatus,
      face_status: faceStatus,
      face_score: faceScore,
      status,
      workday_counted: workdayCounted,
      source: "field_app",
      notes: payload.notes?.trim() || `${eventType === "check_in" ? "Check-in" : "Check-out"} dari app lapangan.`,
      event_at: new Date().toISOString(),
    }

    if (faceSnapshotPath) logPayload.face_snapshot_path = faceSnapshotPath

    const { data: log, error: logError } = await adminClient
      .from("attendance_logs")
      .upsert(logPayload, { onConflict: "employee_id,attendance_date,event_type" })
      .select("id, attendance_date, event_type, status, gps_status, face_status, distance_m, radius_m, face_score, face_snapshot_path")
      .single()

    if (logError) throw logError

    const { error: refreshError } = await adminClient.rpc("refresh_employee_payroll_cycles", { target_employee_id: employee.id })
    if (refreshError) throw refreshError

    return jsonResponse({
      ok: true,
      log,
      employee: {
        id: employee.id,
        code: employee.employee_code,
        name: employee.full_name,
      },
      location: {
        id: location.id,
        name: location.name,
        radiusM,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyimpan absensi."
    return jsonResponse({ error: message }, 400)
  }
})
