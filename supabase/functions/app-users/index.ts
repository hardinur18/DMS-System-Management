import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type UserStatus = "active" | "invited" | "locked"
type TwoFactorStatus = "enabled" | "pending" | "disabled"
type AppUserAction = "create" | "update" | "delete" | "lock" | "unlock" | "send_password_link"

interface AppUserPayload {
  id?: string
  userCode?: string
  fullName?: string
  email?: string
  roleId?: string
  divisionId?: string
  status?: UserStatus
  twoFactorStatus?: TwoFactorStatus
  notes?: string
  passwordActionType?: "setup" | "reset"
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const permissionByAction: Record<AppUserAction, string> = {
  create: "users.create",
  update: "users.edit",
  delete: "users.edit",
  lock: "users.lock",
  unlock: "users.lock",
  send_password_link: "users.edit",
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || ""
}

function assertPayload(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

async function findAuthUserIdByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error

    const user = data.users.find((item) => item.email?.toLowerCase() === email)
    if (user) return user.id
    if (data.users.length < 100) return null
  }

  return null
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const siteUrl = Deno.env.get("APP_SITE_URL") || new URL(request.url).origin

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
    const body = await request.json() as { action?: AppUserAction; payload?: AppUserPayload }
    const action = body.action
    const payload = body.payload || {}

    assertPayload(action && permissionByAction[action], "Action tidak valid.")

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
      .eq("permission_key", permissionByAction[action])
      .eq("enabled", true)
      .maybeSingle()

    if (permissionError) throw permissionError
    if (!permission) return jsonResponse({ error: "Role tidak punya permission untuk aksi ini." }, 403)

    if (action === "create" || action === "update") {
      const email = normalizeEmail(payload.email)
      assertPayload(payload.fullName?.trim(), "Nama user wajib diisi.")
      assertPayload(email, "Email wajib diisi.")
      assertPayload(payload.roleId, "Role wajib dipilih.")
      assertPayload(payload.divisionId, "Divisi wajib dipilih.")

      let authUserId: string | null = null
      const { data: existingProfile, error: existingProfileError } = await adminClient
        .from("app_users")
        .select("id, auth_user_id")
        .eq("email", email)
        .maybeSingle()

      if (existingProfileError) throw existingProfileError
      authUserId = existingProfile?.auth_user_id || null

      if (!authUserId) {
        authUserId = await findAuthUserIdByEmail(adminClient, email)
      }

      if (!authUserId) {
        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/?flow=reset-password`,
          data: { full_name: payload.fullName.trim(), user_code: payload.userCode },
        })

        if (inviteError) throw inviteError
        authUserId = inviteData.user?.id || null
      }

      const profilePayload = {
        auth_user_id: authUserId,
        user_code: payload.userCode?.trim().toUpperCase(),
        full_name: payload.fullName.trim(),
        email,
        role_id: payload.roleId,
        division_id: payload.divisionId,
        status: payload.status || "invited",
        two_factor_status: payload.twoFactorStatus || "pending",
        invited_at: payload.status === "invited" ? new Date().toISOString() : null,
        notes: payload.notes?.trim() || null,
      }

      const query = action === "update" && payload.id
        ? adminClient.from("app_users").update(profilePayload).eq("id", payload.id).select("id").single()
        : adminClient.from("app_users").upsert(profilePayload, { onConflict: "email" }).select("id").single()
      const { data: saved, error: saveError } = await query
      if (saveError) throw saveError

      await adminClient.from("audit_logs").insert({
        actor_user_id: actor.id,
        actor_name: actor.full_name,
        action: action === "create" ? "Create app user with auth invite" : "Update app user",
        target_table: "app_users",
        target_id: saved.id,
        status: "success",
        metadata: { email, source: "edge-function" },
      })

      return jsonResponse({ ok: true, id: saved.id })
    }

    assertPayload(payload.id, "ID user wajib ada.")

    const { data: target, error: targetError } = await adminClient
      .from("app_users")
      .select("id, auth_user_id, full_name, email, status")
      .eq("id", payload.id)
      .single()

    if (targetError) throw targetError

    if (action === "delete") {
      if (target.auth_user_id) {
        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(target.auth_user_id)
        if (deleteAuthError) throw deleteAuthError
      }

      const { error: deleteProfileError } = await adminClient.from("app_users").delete().eq("id", target.id)
      if (deleteProfileError) throw deleteProfileError
    }

    if (action === "lock" || action === "unlock") {
      const nextStatus = action === "lock" ? "locked" : "active"
      const { error: statusError } = await adminClient.from("app_users").update({ status: nextStatus }).eq("id", target.id)
      if (statusError) throw statusError
    }

    if (action === "send_password_link") {
      const passwordActionType = payload.passwordActionType || (target.status === "invited" ? "setup" : "reset")
      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(target.email, {
        redirectTo: `${siteUrl}/?flow=reset-password`,
      })

      if (resetError) throw resetError

      const timestampColumn = passwordActionType === "setup" ? "password_setup_sent_at" : "password_reset_sent_at"
      const { error: timestampError } = await adminClient
        .from("app_users")
        .update({ [timestampColumn]: new Date().toISOString() })
        .eq("id", target.id)

      if (timestampError) throw timestampError
    }

    await adminClient.from("audit_logs").insert({
      actor_user_id: actor.id,
      actor_name: actor.full_name,
      action: `App user ${action}`,
      target_table: "app_users",
      target_id: target.id,
      status: "success",
      metadata: { email: target.email, source: "edge-function" },
    })

    return jsonResponse({ ok: true, id: target.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Aksi user gagal."
    return jsonResponse({ error: message }, 400)
  }
})
