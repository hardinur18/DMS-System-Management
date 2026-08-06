import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0"

type RolePermissionAction = "save_matrix" | "reset_defaults"

interface PermissionPayload {
  permissionKey?: string
  enabled?: boolean
}

interface RolePermissionPayload {
  roleId?: string
  permissions?: PermissionPayload[]
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const defaultRolePermissions: Record<string, string[]> = {
  "ROLE-OWNER": [
    "dashboard.view",
    "users.view",
    "users.create",
    "users.edit",
    "users.lock",
    "master_data.view",
    "master_data.manage",
    "employees.view",
    "employees.manage",
    "attendance.view",
    "attendance.review",
    "payroll.view",
    "payroll.process",
    "cash_advance.manage",
    "role_permissions.manage",
    "audit_logs.view",
  ],
  "ROLE-HR": [
    "dashboard.view",
    "users.view",
    "users.create",
    "users.edit",
    "master_data.view",
    "master_data.manage",
    "employees.view",
    "employees.manage",
    "attendance.view",
    "attendance.review",
    "payroll.view",
    "cash_advance.manage",
    "audit_logs.view",
  ],
  "ROLE-FIN": ["dashboard.view", "master_data.view", "employees.view", "payroll.view", "payroll.process", "cash_advance.manage", "audit_logs.view"],
  "ROLE-SPV": ["dashboard.view", "users.view", "employees.view", "attendance.view", "attendance.review", "master_data.view"],
  "ROLE-ADMIN": ["dashboard.view", "users.view", "users.create", "master_data.view", "master_data.manage", "employees.view", "employees.manage", "attendance.view", "audit_logs.view"],
  "ROLE-VIEWER": ["dashboard.view", "users.view", "master_data.view", "employees.view", "attendance.view", "payroll.view"],
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
    const body = await request.json() as { action?: RolePermissionAction; payload?: RolePermissionPayload }
    const action = body.action
    const payload = body.payload || {}

    assertPayload(action === "save_matrix" || action === "reset_defaults", "Action tidak valid.")
    assertPayload(payload.roleId, "Role wajib dipilih.")

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

    const { data: actorPermission, error: actorPermissionError } = await adminClient
      .from("role_permissions")
      .select("permission_key")
      .eq("role_id", actor.role_id)
      .eq("permission_key", "role_permissions.manage")
      .eq("enabled", true)
      .maybeSingle()

    if (actorPermissionError) throw actorPermissionError
    if (!actorPermission) return jsonResponse({ error: "Role tidak punya permission untuk mengubah Role & Permission." }, 403)

    const { data: role, error: roleError } = await adminClient
      .from("roles")
      .select("id, code, name, is_active")
      .eq("id", payload.roleId)
      .single()

    if (roleError) throw roleError
    if (!role.is_active) return jsonResponse({ error: "Role nonaktif tidak bisa diubah permission-nya." }, 422)

    const { data: permissionRows, error: permissionsError } = await adminClient
      .from("permissions")
      .select("key")

    if (permissionsError) throw permissionsError
    const knownPermissions = new Set((permissionRows || []).map((permission) => String(permission.key)))
    const nextPermissions = new Map<string, boolean>()

    knownPermissions.forEach((permissionKey) => nextPermissions.set(permissionKey, false))

    if (action === "reset_defaults") {
      const defaultKeys = new Set(defaultRolePermissions[String(role.code)] || ["dashboard.view"])
      knownPermissions.forEach((permissionKey) => nextPermissions.set(permissionKey, defaultKeys.has(permissionKey)))
    } else {
      assertPayload(Array.isArray(payload.permissions), "Daftar permission wajib ada.")
      payload.permissions?.forEach((item) => {
        const permissionKey = String(item.permissionKey || "")
        assertPayload(knownPermissions.has(permissionKey), `Permission ${permissionKey} tidak valid.`)
        nextPermissions.set(permissionKey, item.enabled === true)
      })
    }

    if (role.code === "ROLE-OWNER") {
      knownPermissions.forEach((permissionKey) => nextPermissions.set(permissionKey, true))
    }

    if (actor.role_id === role.id) {
      assertPayload(nextPermissions.get("role_permissions.manage"), "Permission role_permissions.manage akun sendiri tidak boleh dimatikan.")
      assertPayload(nextPermissions.get("dashboard.view"), "Permission dashboard.view akun sendiri tidak boleh dimatikan.")
    }

    const { count: targetActiveUserCount, error: targetUserCountError } = await adminClient
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("role_id", role.id)
      .eq("status", "active")

    if (targetUserCountError) throw targetUserCountError
    if ((targetActiveUserCount || 0) > 0) {
      assertPayload(nextPermissions.get("dashboard.view"), "Dashboard wajib aktif untuk role yang punya user aktif.")
    }

    if (!nextPermissions.get("role_permissions.manage")) {
      const { data: managerRoleRows, error: managerRoleRowsError } = await adminClient
        .from("role_permissions")
        .select("role_id")
        .eq("permission_key", "role_permissions.manage")
        .eq("enabled", true)
        .neq("role_id", role.id)

      if (managerRoleRowsError) throw managerRoleRowsError
      const managerRoleIds = (managerRoleRows || []).map((row) => String(row.role_id))

      if (managerRoleIds.length === 0) {
        return jsonResponse({ error: "Minimal satu user aktif harus tetap punya akses Role & Permission." }, 422)
      }

      const { data: managerRows, error: managerRowsError } = await adminClient
        .from("app_users")
        .select("id")
        .in("role_id", managerRoleIds)
        .eq("status", "active")
        .limit(1)

      if (managerRowsError) throw managerRowsError
      assertPayload((managerRows || []).length > 0, "Minimal satu user aktif harus tetap punya akses Role & Permission.")
    }

    const { data: previousRows, error: previousError } = await adminClient
      .from("role_permissions")
      .select("permission_key, enabled")
      .eq("role_id", role.id)

    if (previousError) throw previousError
    const previousPermissions = new Map((previousRows || []).map((row) => [String(row.permission_key), row.enabled === true]))
    const changedPermissions = Array.from(nextPermissions.entries())
      .filter(([permissionKey, enabled]) => previousPermissions.get(permissionKey) !== enabled)
      .map(([permissionKey, enabled]) => ({ permissionKey, enabled }))

    const upsertRows = Array.from(nextPermissions.entries()).map(([permissionKey, enabled]) => ({
      role_id: role.id,
      permission_key: permissionKey,
      enabled,
    }))

    const { error: upsertError } = await adminClient
      .from("role_permissions")
      .upsert(upsertRows, { onConflict: "role_id,permission_key" })

    if (upsertError) throw upsertError

    await adminClient.from("audit_logs").insert({
      actor_user_id: actor.id,
      actor_name: actor.full_name,
      action: action === "reset_defaults" ? "Reset role permission default" : "Update role permission matrix",
      target_table: "role_permissions",
      target_id: role.id,
      status: "success",
      metadata: {
        role_code: role.code,
        role_name: role.name,
        changed_count: changedPermissions.length,
        changed_permissions: changedPermissions,
        source: "edge-function",
      },
    })

    return jsonResponse({ ok: true, roleId: role.id, changedCount: changedPermissions.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Role permission gagal diproses."
    return jsonResponse({ error: message }, 400)
  }
})
