import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type FaceProfileAction = "submit_self" | "submit_for_employee" | "approve" | "reject" | "reset" | "disable"

interface FaceProfilePayload {
  employeeId?: string
  snapshotBase64?: string | null
  snapshotsBase64?: string[] | null
  snapshotContentType?: string | null
  threshold?: number | null
  verificationRequired?: boolean
  notes?: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const faceBucket = "employee-face-profiles"
const allowedContentTypes = ["image/jpeg", "image/png", "image/webp"]

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function assertPayload(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
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

function buildReferencePath(employeeCode: string, contentType: string, sampleIndex?: number) {
  const safeCode = employeeCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-") || "EMPLOYEE"
  const suffix = sampleIndex ? `-${sampleIndex}` : ""
  return `profiles/${safeCode}/reference${suffix}.${getImageExtension(contentType)}`
}

function referencePathVariants(employeeCode: string) {
  const safeCode = employeeCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-") || "EMPLOYEE"
  const names = ["reference", "reference-1", "reference-2", "reference-3"]
  return names.flatMap((name) => [
    `profiles/${safeCode}/${name}.jpg`,
    `profiles/${safeCode}/${name}.png`,
    `profiles/${safeCode}/${name}.webp`,
  ])
}

async function safeAudit(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { error } = await adminClient.from("audit_logs").insert(payload)
  if (error) console.warn("audit log skipped", error.message)
}

async function safeRemove(adminClient: ReturnType<typeof createClient>, bucket: string, paths: string[]) {
  const { error } = await adminClient.storage.from(bucket).remove(paths)
  if (error) console.warn("storage remove skipped", error.message)
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
    const body = await request.json() as { action?: FaceProfileAction; payload?: FaceProfilePayload }
    const action = body.action
    const payload = body.payload || {}

    assertPayload(action === "submit_self" || action === "submit_for_employee" || action === "approve" || action === "reject" || action === "reset" || action === "disable", "Action face profile tidak valid.")

    const token = authorization.replace(/^Bearer\s+/i, "")
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: "Session tidak valid." }, 401)

    const { data: actor, error: actorError } = await adminClient
      .from("app_users")
      .select("id, full_name, email, role_id, status, employee_id, app_scope")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle()

    if (actorError) throw actorError
    if (!actor || actor.status !== "active") return jsonResponse({ error: "Akses user tidak aktif." }, 403)

    const managementAction = action !== "submit_self"
    let targetEmployeeId = payload.employeeId?.trim() || ""

    if (managementAction) {
      assertPayload(targetEmployeeId, "Karyawan wajib dipilih.")

      const { data: permission, error: permissionError } = await adminClient
        .from("role_permissions")
        .select("permission_key")
        .eq("role_id", actor.role_id)
        .in("permission_key", ["employees.manage", "attendance.review"])
        .eq("enabled", true)
        .limit(1)
        .maybeSingle()

      if (permissionError) throw permissionError
      if (!permission) return jsonResponse({ error: "Role tidak punya akses review face profile." }, 403)
    } else {
      if (actor.app_scope !== "field" && actor.app_scope !== "both") return jsonResponse({ error: "User belum punya scope app lapangan." }, 403)
      if (!actor.employee_id) return jsonResponse({ error: "User belum dikaitkan ke data karyawan." }, 403)
      targetEmployeeId = String(actor.employee_id)
    }

    const { data: employee, error: employeeError } = await adminClient
      .from("employees")
      .select("id, employee_code, full_name, status")
      .eq("id", targetEmployeeId)
      .is("deleted_at", null)
      .maybeSingle()

    if (employeeError) throw employeeError
    if (!employee) return jsonResponse({ error: "Data karyawan tidak ditemukan." }, 404)
    if (employee.status === "inactive") return jsonResponse({ error: "Karyawan nonaktif tidak bisa registrasi wajah." }, 403)

    const now = new Date().toISOString()
    const threshold = Number(payload.threshold ?? 85)
    assertPayload(Number.isFinite(threshold) && threshold >= 60 && threshold <= 99, "Threshold wajah harus 60 sampai 99.")

    if (action === "submit_self" || action === "submit_for_employee") {
      const snapshotsBase64 = Array.isArray(payload.snapshotsBase64)
        ? payload.snapshotsBase64.map((snapshot) => snapshot?.trim() || "").filter(Boolean).slice(0, 3)
        : []
      const fallbackSnapshotBase64 = payload.snapshotBase64?.trim() || ""
      const submittedSnapshots = snapshotsBase64.length > 0 ? snapshotsBase64 : [fallbackSnapshotBase64].filter(Boolean)
      const snapshotContentType = payload.snapshotContentType?.trim() || "image/jpeg"

      assertPayload(submittedSnapshots.length > 0, "Foto wajah wajib dikirim.")
      assertPayload(submittedSnapshots.length <= 3, "Sampel wajah maksimal 3 foto.")
      assertPayload(allowedContentTypes.includes(snapshotContentType), "Format foto wajah wajib JPG, PNG, atau WEBP.")

      const decodedSamples = submittedSnapshots.map((snapshot) => decodeBase64Image(snapshot))
      const totalBytes = decodedSamples.reduce((total, bytes) => total + bytes.length, 0)
      assertPayload(decodedSamples.every((bytes) => bytes.length > 0), "Foto wajah tidak valid.")
      assertPayload(decodedSamples.every((bytes) => bytes.length <= 2 * 1024 * 1024), "Ukuran tiap foto wajah maksimal 2MB.")
      assertPayload(totalBytes <= 6 * 1024 * 1024, "Total sampel wajah maksimal 6MB.")

      const nextPaths = decodedSamples.map((_, index) => buildReferencePath(employee.employee_code, snapshotContentType, index + 1))
      const previewPath = nextPaths[nextPaths.length - 1]
      const stalePaths = referencePathVariants(employee.employee_code)

      await safeRemove(adminClient, faceBucket, stalePaths)

      for (let index = 0; index < decodedSamples.length; index += 1) {
        const { error: uploadError } = await adminClient.storage.from(faceBucket).upload(nextPaths[index], decodedSamples[index], {
          cacheControl: "3600",
          contentType: snapshotContentType,
          upsert: true,
        })

        if (uploadError) throw uploadError
      }

      const { data: profile, error: upsertError } = await adminClient
        .from("employee_face_profiles")
        .upsert({
          employee_id: employee.id,
          status: "pending_review",
          verification_required: true,
          face_score_threshold: threshold,
          reference_image_path: previewPath,
          reference_image_paths: nextPaths,
          submitted_at: now,
          reviewed_at: null,
          reviewed_by: null,
          review_notes: null,
          notes: payload.notes?.trim() || (action === "submit_for_employee" ? "Registrasi wajah dari management app." : "Registrasi wajah dari app lapangan."),
        }, { onConflict: "employee_id" })
        .select("id, employee_id, status, reference_image_path, reference_image_paths, face_score_threshold, submitted_at, reviewed_at, review_notes")
        .single()

      if (upsertError) throw upsertError

      await safeAudit(adminClient, {
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: action === "submit_for_employee" ? "Submit employee face profile by management" : "Submit employee face profile",
        target_table: "employee_face_profiles",
        target_id: profile.id,
        status: "success",
        metadata: { employee_code: employee.employee_code, source: action === "submit_for_employee" ? "management-app" : "field-app", samples: nextPaths.length },
      })

      return jsonResponse({ ok: true, profile, employee: { id: employee.id, code: employee.employee_code, name: employee.full_name } })
    }

    const { data: currentProfile, error: profileError } = await adminClient
      .from("employee_face_profiles")
        .select("id, reference_image_path, status")
      .eq("employee_id", employee.id)
      .maybeSingle()

    if (profileError) throw profileError

    if (action === "approve") {
      assertPayload(currentProfile?.reference_image_path, "Belum ada foto wajah untuk di-approve.")

      const { data: profile, error: updateError } = await adminClient
        .from("employee_face_profiles")
        .upsert({
          employee_id: employee.id,
          status: "approved",
          verification_required: payload.verificationRequired !== false,
          face_score_threshold: threshold,
          reviewed_at: now,
          reviewed_by: actor.id,
          review_notes: payload.notes?.trim() || "Face profile approved.",
          last_verified_at: now,
        }, { onConflict: "employee_id" })
        .select("id, employee_id, status, reference_image_path, reference_image_paths, face_score_threshold, reviewed_at, review_notes")
        .single()

      if (updateError) throw updateError
      await safeAudit(adminClient, {
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: "Approve employee face profile",
        target_table: "employee_face_profiles",
        target_id: profile.id,
        status: "success",
        metadata: { employee_code: employee.employee_code },
      })
      return jsonResponse({ ok: true, profile })
    }

    if (action === "reject") {
      const { data: profile, error: updateError } = await adminClient
        .from("employee_face_profiles")
        .upsert({
          employee_id: employee.id,
          status: "rejected",
          verification_required: true,
          face_score_threshold: threshold,
          reviewed_at: now,
          reviewed_by: actor.id,
          review_notes: payload.notes?.trim() || "Face profile rejected.",
        }, { onConflict: "employee_id" })
        .select("id, employee_id, status, reference_image_path, reference_image_paths, face_score_threshold, reviewed_at, review_notes")
        .single()

      if (updateError) throw updateError
      await safeAudit(adminClient, {
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: "Reject employee face profile",
        target_table: "employee_face_profiles",
        target_id: profile.id,
        status: "success",
        metadata: { employee_code: employee.employee_code },
      })
      return jsonResponse({ ok: true, profile })
    }

    if (action === "reset") {
      const paths = referencePathVariants(employee.employee_code)
      await safeRemove(adminClient, faceBucket, paths)

      const { data: profile, error: updateError } = await adminClient
        .from("employee_face_profiles")
        .upsert({
          employee_id: employee.id,
          status: "unenrolled",
          verification_required: true,
          face_score_threshold: threshold,
          reference_image_path: null,
          reference_image_paths: [],
          submitted_at: null,
          reviewed_at: now,
          reviewed_by: actor.id,
          review_notes: payload.notes?.trim() || "Face profile direset. Karyawan perlu daftar ulang.",
          last_verified_at: null,
        }, { onConflict: "employee_id" })
        .select("id, employee_id, status, reference_image_path, reference_image_paths, face_score_threshold, reviewed_at, review_notes")
        .single()

      if (updateError) throw updateError
      await safeAudit(adminClient, {
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: "Reset employee face profile",
        target_table: "employee_face_profiles",
        target_id: profile.id,
        status: "success",
        metadata: { employee_code: employee.employee_code },
      })
      return jsonResponse({ ok: true, profile })
    }

    const { data: profile, error: updateError } = await adminClient
      .from("employee_face_profiles")
      .upsert({
        employee_id: employee.id,
        status: "disabled",
        verification_required: false,
        face_score_threshold: threshold,
        reviewed_at: now,
        reviewed_by: actor.id,
        review_notes: payload.notes?.trim() || "Face verification dimatikan untuk karyawan ini.",
      }, { onConflict: "employee_id" })
      .select("id, employee_id, status, reference_image_path, reference_image_paths, face_score_threshold, reviewed_at, review_notes")
      .single()

    if (updateError) throw updateError
    await safeAudit(adminClient, {
      actor_user_id: actor.id,
      actor_name: actor.full_name,
      action: "Disable employee face verification",
      target_table: "employee_face_profiles",
      target_id: profile.id,
      status: "success",
      metadata: { employee_code: employee.employee_code },
    })
    return jsonResponse({ ok: true, profile })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Face profile belum bisa diproses."
    return jsonResponse({ error: message }, 400)
  }
})
