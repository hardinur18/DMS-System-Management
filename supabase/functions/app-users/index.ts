import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type UserStatus = "active" | "invited" | "locked"
type TwoFactorStatus = "enabled" | "pending" | "disabled"
type AppScope = "management" | "field" | "both"
type AppUserAction = "claim_profile" | "complete_email_password_link" | "complete_password_change" | "create" | "update" | "delete" | "lock" | "unlock" | "send_password_link" | "set_password"

interface AppUserPayload {
  id?: string
  userCode?: string
  fullName?: string
  email?: string
  roleId?: string
  divisionId?: string
  employeeId?: string
  appScope?: AppScope
  status?: UserStatus
  twoFactorStatus?: TwoFactorStatus
  notes?: string
  passwordActionType?: "setup" | "reset"
  password?: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const permissionByAction: Record<Exclude<AppUserAction, "claim_profile" | "complete_email_password_link" | "complete_password_change">, string> = {
  create: "users.create",
  update: "users.edit",
  delete: "users.edit",
  lock: "users.lock",
  unlock: "users.lock",
  send_password_link: "users.edit",
  set_password: "users.edit",
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

function isEmailRateLimitError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("email rate limit")
}

function assertStrongEnoughPassword(password?: string) {
  const value = password || ""
  const weakPasswords = ["password", "password123", "admin123", "qwerty123", "dms12345", "12345678", "123456789", "letmein123"]

  assertPayload(value.length >= 12, "Password minimal 12 karakter.")
  assertPayload(/[a-z]/.test(value), "Password wajib berisi huruf kecil.")
  assertPayload(/[A-Z]/.test(value), "Password wajib berisi huruf besar.")
  assertPayload(/\d/.test(value), "Password wajib berisi angka.")
  assertPayload(/[^A-Za-z0-9]/.test(value), "Password wajib berisi simbol.")
  assertPayload(!weakPasswords.includes(value.toLowerCase()), "Password terlalu umum. Gunakan password yang lebih unik.")
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

    assertPayload(action, "Action tidak valid.")

    const token = authorization.replace(/^Bearer\s+/i, "")
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) return jsonResponse({ error: "Session tidak valid." }, 401)

    if (action === "claim_profile") {
      const email = normalizeEmail(authData.user.email)
      assertPayload(email, "Email session tidak ditemukan.")

      const { data: profile, error: profileError } = await adminClient
        .from("app_users")
        .select("id, auth_user_id, email, status")
        .or(`auth_user_id.eq.${authData.user.id},email.eq.${email}`)
        .maybeSingle()

      if (profileError) throw profileError
      if (!profile) return jsonResponse({ ok: true, profile: null })

      const emailConfirmedAt = authData.user.email_confirmed_at || authData.user.confirmed_at || null
      const manualPasswordAuth = authData.user.user_metadata?.dms_manual_password === true
      const normalizedProfileEmail = normalizeEmail(profile.email)
      const shouldVerifyEmail = normalizedProfileEmail === email && Boolean(emailConfirmedAt) && !manualPasswordAuth

      const { error: claimError } = await adminClient
        .from("app_users")
        .update({
          auth_user_id: profile.auth_user_id || authData.user.id,
          email_verified_at: shouldVerifyEmail ? emailConfirmedAt : null,
          last_login_at: new Date().toISOString(),
        })
        .eq("id", profile.id)

      if (claimError) throw claimError

      return jsonResponse({ ok: true, profileId: profile.id })
    }

    if (action === "complete_email_password_link") {
      const email = normalizeEmail(authData.user.email)
      const emailConfirmedAt = authData.user.email_confirmed_at || authData.user.confirmed_at || new Date().toISOString()
      const manualPasswordAuth = authData.user.user_metadata?.dms_manual_password === true

      if (manualPasswordAuth) {
        return jsonResponse({ error: "Email belum diverifikasi lewat link. Gunakan Kirim Link setelah SMTP aktif." }, 403)
      }

      const { data: profile, error: profileError } = await adminClient
        .from("app_users")
        .select("id, email")
        .eq("auth_user_id", authData.user.id)
        .maybeSingle()

      if (profileError) throw profileError
      if (!profile || normalizeEmail(profile.email) !== email) return jsonResponse({ error: "Profil user tidak cocok dengan email session." }, 403)

      const { error: updateError } = await adminClient
        .from("app_users")
        .update({ email_verified_at: emailConfirmedAt, force_password_change: false })
        .eq("id", profile.id)

      if (updateError) throw updateError

      await adminClient.auth.admin.updateUserById(authData.user.id, {
        user_metadata: { ...authData.user.user_metadata, dms_manual_password: false },
      }).catch(() => {})

      return jsonResponse({ ok: true, profileId: profile.id })
    }

    if (action === "complete_password_change") {
      const { data: profile, error: profileError } = await adminClient
        .from("app_users")
        .select("id, status")
        .eq("auth_user_id", authData.user.id)
        .maybeSingle()

      if (profileError) throw profileError
      if (!profile) return jsonResponse({ error: "Profil user tidak ditemukan." }, 404)
      if (profile.status !== "active") return jsonResponse({ error: "Akses user tidak aktif." }, 403)

      const { error: updateError } = await adminClient
        .from("app_users")
        .update({ force_password_change: false })
        .eq("id", profile.id)

      if (updateError) throw updateError

      return jsonResponse({ ok: true, profileId: profile.id })
    }

    const permissionKey = permissionByAction[action as Exclude<AppUserAction, "claim_profile" | "complete_email_password_link" | "complete_password_change">]
    assertPayload(permissionKey, "Action tidak valid.")

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
      .eq("permission_key", permissionKey)
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
      assertPayload(!payload.appScope || ["management", "field", "both"].includes(payload.appScope), "Scope app tidak valid.")
      assertPayload(payload.appScope !== "field" && payload.appScope !== "both" || payload.employeeId, "User lapangan wajib dikaitkan ke karyawan.")

      if (action === "update" && payload.id === actor.id) {
        const nextStatus = payload.status || actor.status
        assertPayload(email === actor.email, "Email akun sendiri tidak bisa diubah dari halaman user.")
        assertPayload(payload.roleId === actor.role_id, "Role akun sendiri tidak bisa diubah dari halaman user.")
        assertPayload(nextStatus === actor.status, "Status akun sendiri tidak bisa diubah dari halaman user.")
      }

      let authUserId: string | null = null
      let currentProfile: { id: string; auth_user_id: string | null; email: string | null; email_verified_at: string | null } | null = null

      if (action === "update") {
        assertPayload(payload.id, "ID user wajib ada.")

        const { data: profile, error: profileError } = await adminClient
          .from("app_users")
          .select("id, auth_user_id, email, email_verified_at")
          .eq("id", payload.id)
          .single()

        if (profileError) throw profileError
        currentProfile = profile
        authUserId = profile.auth_user_id || null
      }

      const { data: existingProfile, error: existingProfileError } = await adminClient
        .from("app_users")
        .select("id, auth_user_id")
        .eq("email", email)
        .maybeSingle()

      if (existingProfileError) throw existingProfileError
      if (action === "create") {
        assertPayload(!existingProfile, "Email sudah terdaftar di Pengguna & Akses.")
        authUserId = null
      }

      if (action === "update") {
        assertPayload(!existingProfile || existingProfile.id === payload.id, "Email sudah dipakai user lain.")
        authUserId = authUserId || existingProfile?.auth_user_id || null
      }

      if (payload.employeeId) {
        const { data: linkedEmployeeUser, error: linkedEmployeeError } = await adminClient
          .from("app_users")
          .select("id, full_name, email")
          .eq("employee_id", payload.employeeId)
          .maybeSingle()

        if (linkedEmployeeError) throw linkedEmployeeError
        assertPayload(
          !linkedEmployeeUser || linkedEmployeeUser.id === payload.id,
          `Karyawan terkait sudah dipakai oleh user ${linkedEmployeeUser?.full_name || linkedEmployeeUser?.email}. Satu karyawan hanya boleh punya satu user login.`,
        )
      }

      if (!authUserId) {
        authUserId = await findAuthUserIdByEmail(adminClient, email)
      }

      if (!authUserId && action === "create") {
        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${siteUrl}/?flow=reset-password`,
          data: { full_name: payload.fullName.trim(), user_code: payload.userCode },
        })

        if (inviteError) {
          if (isEmailRateLimitError(inviteError)) {
            return jsonResponse({ error: "Limit email Supabase tercapai. Tunggu beberapa menit atau aktifkan SMTP custom sebelum kirim invite lagi." }, 429)
          }

          throw inviteError
        }
        authUserId = inviteData.user?.id || null
      }

      if (action === "update" && authUserId && currentProfile?.email && normalizeEmail(currentProfile.email) !== email) {
        const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(authUserId, {
          email,
          user_metadata: { full_name: payload.fullName.trim(), user_code: payload.userCode },
        })

        if (updateAuthError) throw updateAuthError
      }

      const profilePayload = {
        auth_user_id: authUserId,
        user_code: payload.userCode?.trim().toUpperCase(),
        full_name: payload.fullName.trim(),
        email,
        role_id: payload.roleId,
        division_id: payload.divisionId,
        employee_id: payload.employeeId || null,
        app_scope: payload.appScope || "management",
        status: payload.status || "invited",
        two_factor_status: "disabled",
        invited_at: payload.status === "invited" ? new Date().toISOString() : null,
        email_verified_at: action === "update" && currentProfile && normalizeEmail(currentProfile.email || "") === email ? currentProfile.email_verified_at : null,
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
      .select("id, auth_user_id, full_name, email, status, user_code")
      .eq("id", payload.id)
      .single()

    if (targetError) throw targetError

    if (action === "delete") {
      assertPayload(target.id !== actor.id, "Akun sendiri tidak bisa dihapus.")

      if (target.auth_user_id) {
        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(target.auth_user_id)
        if (deleteAuthError) throw deleteAuthError
      }

      const { error: deleteProfileError } = await adminClient.from("app_users").delete().eq("id", target.id)
      if (deleteProfileError) throw deleteProfileError
    }

    if (action === "lock" || action === "unlock") {
      assertPayload(target.id !== actor.id, "Status akun sendiri tidak bisa diubah.")

      const nextStatus = action === "lock" ? "locked" : "active"
      const { error: statusError } = await adminClient.from("app_users").update({ status: nextStatus }).eq("id", target.id)
      if (statusError) throw statusError
    }

    if (action === "send_password_link") {
      const passwordActionType = payload.passwordActionType || (target.status === "invited" ? "setup" : "reset")

      let targetAuthUserId = target.auth_user_id || await findAuthUserIdByEmail(adminClient, target.email)

      if (!targetAuthUserId) {
        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(target.email, {
          redirectTo: `${siteUrl}/?flow=reset-password`,
          data: { full_name: target.full_name },
        })

        if (inviteError) {
          if (isEmailRateLimitError(inviteError)) {
            return jsonResponse({ error: "Limit email Supabase tercapai. Tunggu beberapa menit atau aktifkan SMTP custom sebelum kirim link buat password lagi." }, 429)
          }

          throw inviteError
        }
        targetAuthUserId = inviteData.user?.id || null

        if (targetAuthUserId) {
          const { error: linkError } = await adminClient
            .from("app_users")
            .update({ auth_user_id: targetAuthUserId })
            .eq("id", target.id)

          if (linkError) throw linkError
        }

        const timestampColumn = passwordActionType === "setup" ? "password_setup_sent_at" : "password_reset_sent_at"
        const { error: timestampError } = await adminClient
          .from("app_users")
          .update({ [timestampColumn]: new Date().toISOString() })
          .eq("id", target.id)

        if (timestampError) throw timestampError

        await adminClient.from("audit_logs").insert({
          actor_user_id: actor.id,
          actor_name: actor.full_name,
          action: `App user ${action}`,
          target_table: "app_users",
          target_id: target.id,
          status: "success",
          metadata: { email: target.email, source: "edge-function", flow: "invite" },
        })

        return jsonResponse({ ok: true, id: target.id })
      } else if (!target.auth_user_id) {
        const { error: linkError } = await adminClient
          .from("app_users")
          .update({ auth_user_id: targetAuthUserId })
          .eq("id", target.id)

        if (linkError) throw linkError
      }

      if (targetAuthUserId) {
        const { error: resetError } = await adminClient.auth.resetPasswordForEmail(target.email, {
          redirectTo: `${siteUrl}/?flow=reset-password`,
        })

        if (resetError) {
          if (isEmailRateLimitError(resetError)) {
            return jsonResponse({ error: "Limit email Supabase tercapai. Tunggu beberapa menit atau aktifkan SMTP custom sebelum kirim reset password lagi." }, 429)
          }

          throw resetError
        }
      }

      const timestampColumn = passwordActionType === "setup" ? "password_setup_sent_at" : "password_reset_sent_at"
      const { error: timestampError } = await adminClient
        .from("app_users")
        .update({ [timestampColumn]: new Date().toISOString() })
        .eq("id", target.id)

      if (timestampError) throw timestampError
    }

    if (action === "set_password") {
      assertPayload(target.id !== actor.id, "Password akun sendiri tidak bisa diubah dari halaman user.")
      assertStrongEnoughPassword(payload.password)

      let targetAuthUserId = target.auth_user_id || await findAuthUserIdByEmail(adminClient, target.email)

      if (targetAuthUserId) {
        const { error: updatePasswordError } = await adminClient.auth.admin.updateUserById(targetAuthUserId, {
          password: payload.password,
          email_confirm: true,
          user_metadata: { full_name: target.full_name, user_code: target.user_code, dms_manual_password: true },
        })

        if (updatePasswordError) throw updatePasswordError
      } else {
        const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
          email: target.email,
          password: payload.password,
          email_confirm: true,
          user_metadata: { full_name: target.full_name, user_code: target.user_code, dms_manual_password: true },
        })

        if (createAuthError) throw createAuthError
        targetAuthUserId = createdAuth.user?.id || null
      }

      assertPayload(targetAuthUserId, "Auth user gagal dibuat.")

      const { error: profileError } = await adminClient
        .from("app_users")
        .update({
          auth_user_id: targetAuthUserId,
          status: target.status === "locked" ? "locked" : "active",
          email_verified_at: null,
          password_manual_set_at: new Date().toISOString(),
          force_password_change: true,
        })
        .eq("id", target.id)

      if (profileError) throw profileError
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
