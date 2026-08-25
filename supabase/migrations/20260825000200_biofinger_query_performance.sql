-- Biofinger query performance hardening.
-- Keeps the browser page responsive as raw AT-301 events grow.

create or replace function public.has_app_permission(permission_key text)
returns boolean
language sql
stable
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

create index if not exists idx_biofinger_attendance_events_event_at_desc
on public.biofinger_attendance_events(device_event_at desc);

create index if not exists idx_biofinger_attendance_events_device_user_event_at
on public.biofinger_attendance_events(attendance_device_id, external_user_id, device_event_at desc);

drop policy if exists "Production read attendance devices" on public.attendance_devices;
create policy "Production read attendance devices"
on public.attendance_devices for select
to authenticated
using (
  (select public.has_app_permission('biofinger.view'))
  or (select public.has_app_permission('attendance.view'))
  or (select public.has_app_permission('employees.view'))
);

drop policy if exists "Production manage attendance devices" on public.attendance_devices;
create policy "Production manage attendance devices"
on public.attendance_devices for all
to authenticated
using (
  (select public.has_app_permission('biofinger.manage'))
  or (select public.has_app_permission('attendance.review'))
  or (select public.has_app_permission('employees.manage'))
)
with check (
  (select public.has_app_permission('biofinger.manage'))
  or (select public.has_app_permission('attendance.review'))
  or (select public.has_app_permission('employees.manage'))
);

drop policy if exists "Production read employee attendance device links" on public.employee_attendance_device_links;
create policy "Production read employee attendance device links"
on public.employee_attendance_device_links for select
to authenticated
using (
  (select public.has_app_permission('biofinger.view'))
  or (select public.has_app_permission('attendance.view'))
  or (select public.has_app_permission('employees.view'))
);

drop policy if exists "Production manage employee attendance device links" on public.employee_attendance_device_links;
create policy "Production manage employee attendance device links"
on public.employee_attendance_device_links for all
to authenticated
using (
  (select public.has_app_permission('biofinger.manage'))
  or (select public.has_app_permission('attendance.review'))
  or (select public.has_app_permission('employees.manage'))
)
with check (
  (select public.has_app_permission('biofinger.manage'))
  or (select public.has_app_permission('attendance.review'))
  or (select public.has_app_permission('employees.manage'))
);

drop policy if exists "Production read biofinger attendance events" on public.biofinger_attendance_events;
create policy "Production read biofinger attendance events"
on public.biofinger_attendance_events for select
to authenticated
using (
  (select public.has_app_permission('biofinger.view'))
  or (select public.has_app_permission('attendance.view'))
);

drop policy if exists "Production manage biofinger attendance events" on public.biofinger_attendance_events;
create policy "Production manage biofinger attendance events"
on public.biofinger_attendance_events for all
to authenticated
using (
  (select public.has_app_permission('biofinger.manage'))
  or (select public.has_app_permission('attendance.review'))
)
with check (
  (select public.has_app_permission('biofinger.manage'))
  or (select public.has_app_permission('attendance.review'))
);

analyze public.attendance_devices;
analyze public.employee_attendance_device_links;
analyze public.biofinger_attendance_events;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Harden Biofinger query performance', 'biofinger_attendance_events', '20260825000200', 'success', '{"source":"migration","module":"biofinger","performance":"rls-initplan-indexes"}'::jsonb);
