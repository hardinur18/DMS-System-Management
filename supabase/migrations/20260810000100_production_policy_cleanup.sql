-- Final production cleanup before VPS deployment.
-- Keep active-user read paths intact, but remove legacy dev/over-broad policies.

drop policy if exists "Dev anon manage roles" on public.roles;
drop policy if exists "Dev anon manage permissions" on public.permissions;
drop policy if exists "Dev anon manage role permissions" on public.role_permissions;
drop policy if exists "Dev anon manage divisions" on public.divisions;
drop policy if exists "Dev anon manage positions" on public.positions;
drop policy if exists "Dev anon manage work locations" on public.work_locations;
drop policy if exists "Dev anon manage shifts" on public.shifts;
drop policy if exists "Dev anon manage payroll components" on public.payroll_components;
drop policy if exists "Dev anon manage app users" on public.app_users;
drop policy if exists "Dev anon manage audit logs" on public.audit_logs;

drop policy if exists "Authenticated can read audit logs" on public.audit_logs;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Cleanup development policies before VPS readiness', 'security_policies', '20260810000100', 'success', '{"source":"migration","scope":"production-readiness"}'::jsonb);
