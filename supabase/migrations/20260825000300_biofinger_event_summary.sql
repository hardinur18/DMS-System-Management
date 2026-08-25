-- Biofinger event summary.
-- Provides fast, permission-checked event totals for the management UI without relying on the latest 200-row sample.

create index if not exists idx_biofinger_attendance_events_device_import_status
on public.biofinger_attendance_events(attendance_device_id, import_status);

create or replace function public.get_biofinger_attendance_event_summary()
returns table (
  attendance_device_id uuid,
  total_events bigint,
  pending_events bigint,
  mapped_events bigint,
  converted_events bigint,
  ignored_events bigint,
  error_events bigint,
  check_in_events bigint,
  check_out_events bigint,
  unknown_events bigint,
  latest_event_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
begin
  if actor_role = 'authenticated'
     and not (
       public.has_app_permission('biofinger.view')
       or public.has_app_permission('attendance.view')
       or public.has_app_permission('biofinger.manage')
       or public.has_app_permission('attendance.review')
     ) then
    raise exception 'Tidak punya izin untuk melihat ringkasan event Biofinger.'
      using errcode = '42501';
  end if;

  return query
  select
    events.attendance_device_id,
    count(*) as total_events,
    count(*) filter (where events.import_status = 'pending') as pending_events,
    count(*) filter (where events.import_status = 'mapped') as mapped_events,
    count(*) filter (where events.import_status = 'converted') as converted_events,
    count(*) filter (where events.import_status = 'ignored') as ignored_events,
    count(*) filter (where events.import_status = 'error') as error_events,
    count(*) filter (where events.normalized_event_type = 'check_in') as check_in_events,
    count(*) filter (where events.normalized_event_type = 'check_out') as check_out_events,
    count(*) filter (where events.normalized_event_type = 'unknown') as unknown_events,
    max(events.device_event_at) as latest_event_at
  from public.biofinger_attendance_events as events
  group by events.attendance_device_id
  order by max(events.device_event_at) desc nulls last;
end;
$$;

revoke all on function public.get_biofinger_attendance_event_summary() from public;
grant execute on function public.get_biofinger_attendance_event_summary() to authenticated;
grant execute on function public.get_biofinger_attendance_event_summary() to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create Biofinger event summary function', 'biofinger_attendance_events', '20260825000300', 'success', '{"source":"migration","module":"biofinger","summary":"event-status-counts"}'::jsonb);
