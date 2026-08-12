import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type AttendanceEventType = "check_in" | "check_out"

interface FieldAttendancePayload {
  eventType?: AttendanceEventType
  latitude?: number
  longitude?: number
  faceScore?: number | null
  faceEmbedding?: number[] | null
  faceEmbeddingModel?: string | null
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

function getJakartaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.year}-${values.month}-${values.day}`
}

function appendSystemNote(existing: unknown, note: string) {
  return [String(existing || "").trim(), note].filter(Boolean).join("\n")
}

function normalizeEmbedding(value: unknown) {
  if (!Array.isArray(value)) return []
  const vector = value.map((item) => Number(item))
  assertPayload(vector.length === 128, "Embedding wajah wajib berisi 128 angka.")
  assertPayload(vector.every((item) => Number.isFinite(item) && item >= -2 && item <= 2), "Embedding wajah tidak valid.")
  return vector
}

function normalizeEmbeddings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeEmbedding(item)).filter((vector) => vector.length === 128)
}

function cosineScore(candidate: number[], reference: number[]) {
  let dot = 0
  let candidateNorm = 0
  let referenceNorm = 0

  for (let index = 0; index < candidate.length; index += 1) {
    dot += candidate[index] * reference[index]
    candidateNorm += candidate[index] * candidate[index]
    referenceNorm += reference[index] * reference[index]
  }

  if (!candidateNorm || !referenceNorm) return 0
  const similarity = dot / (Math.sqrt(candidateNorm) * Math.sqrt(referenceNorm))
  return Math.max(0, Math.min(100, Math.round(((similarity + 1) / 2) * 100)))
}

function euclideanDistance(candidate: number[], reference: number[]) {
  let total = 0
  for (let index = 0; index < candidate.length; index += 1) {
    total += (candidate[index] - reference[index]) ** 2
  }
  return Number(Math.sqrt(total).toFixed(6))
}

function findBestFaceMatch(candidate: number[], references: number[][]) {
  return references.reduce(
    (best, reference) => {
      const score = cosineScore(candidate, reference)
      const distance = euclideanDistance(candidate, reference)
      return score > best.score ? { score, distance } : best
    },
    { score: 0, distance: null as number | null },
  )
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
    const faceEmbedding = normalizeEmbedding(payload.faceEmbedding)
    const faceEmbeddingModel = payload.faceEmbeddingModel?.trim() || null
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
    if (gpsStatus !== "valid") {
      return jsonResponse({
        error: `Absensi ditolak. Posisi berada ${distanceM}m dari ${location.name}, melebihi radius ${radiusM}m.`,
        code: "OUT_OF_RADIUS",
        distance_m: distanceM,
        radius_m: radiusM,
        location_name: location.name,
      }, 422)
    }

    const { data: faceProfile, error: faceProfileError } = await adminClient
      .from("employee_face_profiles")
      .select("verification_required, face_score_threshold, status, reference_image_path, face_embedding, face_embeddings, face_embedding_model")
      .eq("employee_id", employee.id)
      .maybeSingle()

    if (faceProfileError) throw faceProfileError

    const verificationRequired = faceProfile?.verification_required !== false
    const faceThreshold = Number(faceProfile?.face_score_threshold || 85)
    const faceProfileApproved = faceProfile?.status === "approved" || faceProfile?.status === "enrolled"
    if (verificationRequired && !faceProfileApproved) {
      return jsonResponse({ error: "Profil wajah belum approved HR. Daftarkan wajah dulu sebelum absensi." }, 422)
    }

    const referenceEmbeddings = verificationRequired
      ? normalizeEmbeddings(faceProfile?.face_embeddings).concat(normalizeEmbedding(faceProfile?.face_embedding)).filter((vector, index, rows) => (
        vector.length === 128 && rows.findIndex((item) => JSON.stringify(item) === JSON.stringify(vector)) === index
      ))
      : []
    const embeddingMatch = verificationRequired && faceEmbedding.length === 128 && referenceEmbeddings.length > 0
      ? findBestFaceMatch(faceEmbedding, referenceEmbeddings)
      : null
    const effectiveFaceScore = embeddingMatch?.score ?? faceScore
    const faceMatchDistance = embeddingMatch?.distance ?? null

    if (verificationRequired && referenceEmbeddings.length === 0) {
      return jsonResponse({ error: "Profil wajah belum punya embedding. Daftarkan ulang wajah sebelum absensi." }, 422)
    }
    if (verificationRequired && faceEmbedding.length !== 128 && !faceSnapshotBase64) {
      return jsonResponse({ error: "Bukti wajah absensi belum valid. Scan wajah ulang." }, 422)
    }

    const faceStatus = !verificationRequired
      ? "not_required"
      : effectiveFaceScore === null
        ? "review"
        : faceEmbedding.length !== 128
          ? "review"
        : effectiveFaceScore >= faceThreshold
          ? "verified"
          : effectiveFaceScore >= Math.max(0, faceThreshold - 15)
            ? "review"
            : "failed"
    const status = gpsStatus === "valid" && (faceStatus === "verified" || faceStatus === "not_required") ? "valid" : "review"
    const workdayCounted = false
    const eventDateKey = getJakartaDateKey()

    const { data: priorCheckIns, error: priorCheckInsError } = await adminClient
      .from("attendance_logs")
      .select("id, attendance_date, status, workday_counted, notes")
      .eq("employee_id", employee.id)
      .eq("event_type", "check_in")
      .lt("attendance_date", eventDateKey)
      .neq("status", "rejected")
      .order("attendance_date", { ascending: false })
      .limit(14)

    if (priorCheckInsError) throw priorCheckInsError

    const priorDates = Array.from(new Set((priorCheckIns || []).map((log) => String(log.attendance_date || "")).filter(Boolean)))
    let closedPreviousOpenShifts = 0

    if (priorDates.length > 0) {
      const { data: priorCheckOuts, error: priorCheckOutsError } = await adminClient
        .from("attendance_logs")
        .select("attendance_date")
        .eq("employee_id", employee.id)
        .eq("event_type", "check_out")
        .in("attendance_date", priorDates)

      if (priorCheckOutsError) throw priorCheckOutsError

      const datesWithCheckout = new Set((priorCheckOuts || []).map((log) => String(log.attendance_date || "")))
      const staleCheckIns = (priorCheckIns || []).filter((log) => !datesWithCheckout.has(String(log.attendance_date || "")))

      if (staleCheckIns.length > 0) {
        await Promise.all(staleCheckIns.map(async (log) => {
          const { error: staleUpdateError } = await adminClient
            .from("attendance_logs")
            .update({
              status: "review",
              workday_counted: false,
              notes: appendSystemNote(log.notes, `SYSTEM: Missing checkout otomatis ditandai saat ${employee.full_name} absen pada ${eventDateKey}. Hari kerja belum dihitung sampai HR koreksi.`),
              updated_at: new Date().toISOString(),
            })
            .eq("id", log.id)

          if (staleUpdateError) throw staleUpdateError
        }))

        closedPreviousOpenShifts = staleCheckIns.length
      }
    }

    const { data: todayLogs, error: todayLogsError } = await adminClient
      .from("attendance_logs")
      .select("id, event_type, status, workday_counted, event_at")
      .eq("employee_id", employee.id)
      .eq("attendance_date", eventDateKey)

    if (todayLogsError) throw todayLogsError

    const todayCheckIn = todayLogs?.find((log) => log.event_type === "check_in")
    const todayCheckOut = todayLogs?.find((log) => log.event_type === "check_out")

    if (eventType === "check_in" && todayCheckIn) {
      return jsonResponse({ error: "Check-in hari ini sudah tercatat. Data awal tidak boleh ditimpa." }, 409)
    }

    if (eventType === "check_out") {
      if (!todayCheckIn) {
        return jsonResponse({ error: "Check-out belum bisa dilakukan karena check-in hari ini belum ada." }, 409)
      }

      if (todayCheckIn.status === "rejected") {
        return jsonResponse({ error: "Check-out tidak bisa dilakukan karena check-in hari ini ditolak HR." }, 409)
      }

      if (todayCheckOut) {
        return jsonResponse({ error: "Check-out hari ini sudah tercatat. Data awal tidak boleh ditimpa." }, 409)
      }
    }

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
      attendance_date: eventDateKey,
      event_type: eventType,
      latitude,
      longitude,
      distance_m: distanceM,
      radius_m: radiusM,
      gps_status: gpsStatus,
      face_status: faceStatus,
      face_score: effectiveFaceScore,
      face_embedding_model: faceEmbeddingModel || faceProfile?.face_embedding_model || null,
      face_match_distance: faceMatchDistance,
      status,
      workday_counted: workdayCounted,
      source: "field_app",
      notes: payload.notes?.trim() || `${eventType === "check_in" ? "Check-in" : "Check-out"} dari app lapangan.`,
      event_at: new Date().toISOString(),
    }

    if (faceSnapshotPath) logPayload.face_snapshot_path = faceSnapshotPath

    const { data: log, error: logError } = await adminClient
      .from("attendance_logs")
      .insert(logPayload)
      .select("id, attendance_date, event_type, status, gps_status, face_status, distance_m, radius_m, face_score, face_match_distance, face_snapshot_path")
      .single()

    if (logError) throw logError

    if (eventType === "check_out" && todayCheckIn) {
      const shouldCountCheckIn = todayCheckIn.status === "valid" && status === "valid"
      const { error: checkInUpdateError } = await adminClient
        .from("attendance_logs")
        .update({
          workday_counted: shouldCountCheckIn,
          updated_at: new Date().toISOString(),
        })
        .eq("id", todayCheckIn.id)

      if (checkInUpdateError) throw checkInUpdateError
    }

    const { error: refreshError } = await adminClient.rpc("refresh_employee_payroll_cycles", { target_employee_id: employee.id })
    if (refreshError) throw refreshError

    return jsonResponse({
      ok: true,
      log,
      closed_previous_open_shifts: closedPreviousOpenShifts,
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
