-- Harden Role & Permission for production.
-- Browser clients may read active-user permission data, but writes must go through the role-permissions Edge Function.

drop policy if exists "Authenticated can read permissions" on public.permissions;
drop policy if exists "Authenticated can read role permissions" on public.role_permissions;
drop policy if exists "Dev anon manage permissions" on public.permissions;
drop policy if exists "Dev anon manage role permissions" on public.role_permissions;
drop policy if exists "Production read permissions for active app users" on public.permissions;
drop policy if exists "Production read role permissions for active app users" on public.role_permissions;

create policy "Production read permissions for active app users"
on public.permissions for select
to authenticated
using (
  exists (
    select 1
    from public.app_users app_user
    where app_user.auth_user_id = auth.uid()
      and app_user.status = 'active'
  )
);

create policy "Production read role permissions for active app users"
on public.role_permissions for select
to authenticated
using (
  exists (
    select 1
    from public.app_users app_user
    where app_user.auth_user_id = auth.uid()
      and app_user.status = 'active'
      and (
        app_user.role_id = role_permissions.role_id
        or public.has_app_permission('role_permissions.manage')
      )
  )
);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create production RLS policies for role permissions', 'role_permissions', '20260806000900', 'success', '{"source":"migration","write_path":"edge-function"}'::jsonb);
