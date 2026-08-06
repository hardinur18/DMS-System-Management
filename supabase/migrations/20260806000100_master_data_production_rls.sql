-- Production RLS hardening for DMS master data.
-- Apply this after Supabase Auth and app_users bootstrap are ready.
-- This removes temporary anon CRUD policies and requires app permissions.

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

drop policy if exists "Dev anon manage roles" on public.roles;
drop policy if exists "Dev anon manage permissions" on public.permissions;
drop policy if exists "Dev anon manage role permissions" on public.role_permissions;
drop policy if exists "Dev anon manage divisions" on public.divisions;
drop policy if exists "Dev anon manage positions" on public.positions;
drop policy if exists "Dev anon manage work locations" on public.work_locations;
drop policy if exists "Dev anon manage shifts" on public.shifts;
drop policy if exists "Dev anon manage payroll components" on public.payroll_components;

drop policy if exists "Production read roles" on public.roles;
create policy "Production read roles"
on public.roles for select
to authenticated
using (public.has_app_permission('master_data.view'));

drop policy if exists "Production manage roles" on public.roles;
create policy "Production manage roles"
on public.roles for all
to authenticated
using (public.has_app_permission('master_data.manage'))
with check (public.has_app_permission('master_data.manage'));

drop policy if exists "Production read divisions" on public.divisions;
create policy "Production read divisions"
on public.divisions for select
to authenticated
using (public.has_app_permission('master_data.view'));

drop policy if exists "Production manage divisions" on public.divisions;
create policy "Production manage divisions"
on public.divisions for all
to authenticated
using (public.has_app_permission('master_data.manage'))
with check (public.has_app_permission('master_data.manage'));

drop policy if exists "Production read positions" on public.positions;
create policy "Production read positions"
on public.positions for select
to authenticated
using (public.has_app_permission('master_data.view'));

drop policy if exists "Production manage positions" on public.positions;
create policy "Production manage positions"
on public.positions for all
to authenticated
using (public.has_app_permission('master_data.manage'))
with check (public.has_app_permission('master_data.manage'));

drop policy if exists "Production read work locations" on public.work_locations;
create policy "Production read work locations"
on public.work_locations for select
to authenticated
using (public.has_app_permission('master_data.view'));

drop policy if exists "Production manage work locations" on public.work_locations;
create policy "Production manage work locations"
on public.work_locations for all
to authenticated
using (public.has_app_permission('master_data.manage'))
with check (public.has_app_permission('master_data.manage'));

drop policy if exists "Production read shifts" on public.shifts;
create policy "Production read shifts"
on public.shifts for select
to authenticated
using (public.has_app_permission('master_data.view'));

drop policy if exists "Production manage shifts" on public.shifts;
create policy "Production manage shifts"
on public.shifts for all
to authenticated
using (public.has_app_permission('master_data.manage'))
with check (public.has_app_permission('master_data.manage'));

drop policy if exists "Production read payroll components" on public.payroll_components;
create policy "Production read payroll components"
on public.payroll_components for select
to authenticated
using (public.has_app_permission('master_data.view'));

drop policy if exists "Production manage payroll components" on public.payroll_components;
create policy "Production manage payroll components"
on public.payroll_components for all
to authenticated
using (public.has_app_permission('master_data.manage'))
with check (public.has_app_permission('master_data.manage'));

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create production RLS policies for master data', 'master_data', '20260806000100', 'success', '{"source":"migration","apply_when":"auth_ready"}'::jsonb);
