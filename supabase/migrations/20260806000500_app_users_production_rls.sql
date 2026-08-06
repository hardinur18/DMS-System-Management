-- Production RLS hardening for Pengguna & Akses.
-- Apply after the app-users Edge Function is deployed and APP_SITE_URL/SERVICE_ROLE env is set.

create or replace function public.has_app_permission(permission_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users app_user
    join public.role_permissions role_permission
      on role_permission.role_id = app_user.role_id
    where app_user.auth_user_id = auth.uid()
      and app_user.status = 'active'
      and role_permission.permission_key = has_app_permission.permission_key
      and role_permission.enabled = true
  );
$$;

revoke all on function public.has_app_permission(text) from public;
grant execute on function public.has_app_permission(text) to authenticated;

drop policy if exists "Dev anon manage app users" on public.app_users;
drop policy if exists "Dev anon manage audit logs" on public.audit_logs;

drop policy if exists "Production users read profiles" on public.app_users;
create policy "Production users read profiles"
on public.app_users for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.has_app_permission('users.view')
);

drop policy if exists "Production users create profiles" on public.app_users;
create policy "Production users create profiles"
on public.app_users for insert
to authenticated
with check (public.has_app_permission('users.create'));

drop policy if exists "Production users update profiles" on public.app_users;
create policy "Production users update profiles"
on public.app_users for update
to authenticated
using (
  public.has_app_permission('users.edit')
  or public.has_app_permission('users.lock')
)
with check (
  public.has_app_permission('users.edit')
  or public.has_app_permission('users.lock')
);

drop policy if exists "Production users delete profiles" on public.app_users;
create policy "Production users delete profiles"
on public.app_users for delete
to authenticated
using (public.has_app_permission('users.edit'));

drop policy if exists "Production audit logs read" on public.audit_logs;
create policy "Production audit logs read"
on public.audit_logs for select
to authenticated
using (public.has_app_permission('audit_logs.view'));

drop policy if exists "Production audit logs insert" on public.audit_logs;
create policy "Production audit logs insert"
on public.audit_logs for insert
to authenticated
with check (
  actor_user_id in (
    select id from public.app_users
    where auth_user_id = auth.uid()
      and status = 'active'
  )
);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create production RLS policies for app users', 'app_users', '20260806000500', 'success', '{"source":"migration","apply_when":"edge_function_ready"}'::jsonb);
