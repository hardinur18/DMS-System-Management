-- Biofinger AT-301 staging to attendance conversion.
-- Converts mapped raw events into payroll-ready attendance_logs without duplicating rows.

create or replace function public.convert_biofinger_attendance_events(
  target_device_id uuid default null,
  target_limit integer default 1000
)
returns table (
  events_selected integer,
  events_converted integer,
  events_ignored integer,
  events_error integer,
  attendance_logs_upserted integer,
  employees_refreshed integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit integer := least(greatest(coalesce(target_limit, 1000), 1), 5000);
  refreshed_count integer := 0;
  existing_biofinger_ignored_count integer := 0;
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  employee_record record;
begin
  if actor_role = 'authenticated'
     and not (
       public.has_app_permission('biofinger.manage')
       or public.has_app_permission('attendance.review')
       or public.has_app_permission('employees.manage')
     ) then
    raise exception 'Tidak punya izin untuk memproses absensi Biofinger.'
      using errcode = '42501';
  end if;

  drop table if exists pg_temp.tmp_biofinger_candidates;
  drop table if exists pg_temp.tmp_biofinger_upserted;

  create temp table tmp_biofinger_candidates on commit drop as
  with limited_events as (
    select
      events.*,
      devices.work_location_id as device_work_location_id,
      devices.name as device_name,
      devices.device_code,
      row_number() over (
        partition by events.employee_id, events.attendance_date, events.normalized_event_type
        order by
          case when events.normalized_event_type = 'check_in' then events.device_event_at end asc nulls last,
          case when events.normalized_event_type = 'check_out' then events.device_event_at end desc nulls last,
          events.created_at asc
      ) as pick_rank
    from public.biofinger_attendance_events as events
    join public.attendance_devices as devices
      on devices.id = events.attendance_device_id
    where events.import_status = 'mapped'
      and events.converted_attendance_log_id is null
      and events.employee_id is not null
      and events.normalized_event_type in ('check_in', 'check_out')
      and (target_device_id is null or events.attendance_device_id = target_device_id)
    order by events.device_event_at asc
    limit safe_limit
  )
  select *
  from limited_events;

  select count(*)::integer
  into events_selected
  from tmp_biofinger_candidates
  where pick_rank = 1;

  update public.biofinger_attendance_events as events
  set import_status = 'ignored',
      notes = concat_ws(E'\n', nullif(events.notes, ''), 'SYSTEM: Duplicate Biofinger event tidak dikonversi; DMS memakai check-in paling awal dan check-out paling akhir per hari.'),
      updated_at = now()
  from tmp_biofinger_candidates as candidates
  where events.id = candidates.id
    and candidates.pick_rank > 1;

  get diagnostics events_ignored = row_count;

  create temp table tmp_biofinger_upserted on commit drop as
  with selected_events as (
    select
      candidates.*,
      employees.work_location_id as employee_work_location_id
    from tmp_biofinger_candidates as candidates
    join public.employees as employees
      on employees.id = candidates.employee_id
    where candidates.pick_rank = 1
      and employees.deleted_at is null
      and employees.status = 'active'
  ),
  upserted_logs as (
    insert into public.attendance_logs (
      employee_id,
      app_user_id,
      work_location_id,
      attendance_date,
      event_type,
      event_at,
      latitude,
      longitude,
      distance_m,
      radius_m,
      gps_status,
      face_status,
      face_score,
      status,
      workday_counted,
      source,
      attendance_media,
      attendance_device_id,
      biofinger_event_id,
      notes
    )
    select
      selected_events.employee_id,
      null,
      coalesce(selected_events.device_work_location_id, selected_events.employee_work_location_id),
      selected_events.attendance_date,
      selected_events.normalized_event_type,
      selected_events.device_event_at,
      null,
      null,
      null,
      null,
      'missing',
      'not_required',
      null,
      'valid',
      false,
      'biofinger',
      'fingerprint',
      selected_events.attendance_device_id,
      selected_events.id,
      concat(
        'Biofinger ',
        coalesce(selected_events.device_name, selected_events.device_code, 'AT-301'),
        ' User ID ',
        selected_events.external_user_id,
        ' punch ',
        coalesce(selected_events.punch::text, '-'),
        '.'
      )
    from selected_events
    on conflict (employee_id, attendance_date, event_type) do update set
      work_location_id = coalesce(excluded.work_location_id, public.attendance_logs.work_location_id),
      event_at = excluded.event_at,
      gps_status = excluded.gps_status,
      face_status = excluded.face_status,
      face_score = excluded.face_score,
      status = excluded.status,
      source = excluded.source,
      attendance_media = excluded.attendance_media,
      attendance_device_id = excluded.attendance_device_id,
      biofinger_event_id = excluded.biofinger_event_id,
      notes = excluded.notes,
      updated_at = now()
    where public.attendance_logs.source = 'biofinger'
      and (
        public.attendance_logs.biofinger_event_id is null
        or (excluded.event_type = 'check_in' and excluded.event_at < public.attendance_logs.event_at)
        or (excluded.event_type = 'check_out' and excluded.event_at > public.attendance_logs.event_at)
      )
    returning
      public.attendance_logs.id,
      public.attendance_logs.employee_id,
      public.attendance_logs.attendance_date,
      public.attendance_logs.event_type,
      public.attendance_logs.biofinger_event_id
  )
  select *
  from upserted_logs;

  select count(*)::integer
  into attendance_logs_upserted
  from tmp_biofinger_upserted;

  update public.biofinger_attendance_events as stale_events
  set import_status = 'ignored',
      converted_attendance_log_id = null,
      notes = concat_ws(E'\n', nullif(stale_events.notes, ''), 'SYSTEM: Digantikan oleh event Biofinger yang lebih representatif untuk tanggal/event yang sama.'),
      updated_at = now()
  from tmp_biofinger_upserted as upserted
  where stale_events.converted_attendance_log_id = upserted.id
    and stale_events.id <> upserted.biofinger_event_id;

  update public.biofinger_attendance_events as events
  set import_status = 'converted',
      converted_attendance_log_id = upserted.id,
      updated_at = now()
  from tmp_biofinger_upserted as upserted
  where events.id = upserted.biofinger_event_id;

  get diagnostics events_converted = row_count;

  update public.biofinger_attendance_events as events
  set import_status = 'ignored',
      notes = concat_ws(E'\n', nullif(events.notes, ''), 'SYSTEM: Tidak dikonversi karena attendance log Biofinger untuk karyawan/tanggal/event ini sudah ada dan lebih representatif.'),
      updated_at = now()
  from tmp_biofinger_candidates as candidates
  join public.attendance_logs as existing_logs
    on existing_logs.employee_id = candidates.employee_id
   and existing_logs.attendance_date = candidates.attendance_date
   and existing_logs.event_type = candidates.normalized_event_type
   and existing_logs.source = 'biofinger'
  left join tmp_biofinger_upserted as upserted
    on upserted.biofinger_event_id = candidates.id
  where events.id = candidates.id
    and candidates.pick_rank = 1
    and upserted.id is null;

  get diagnostics existing_biofinger_ignored_count = row_count;
  events_ignored := coalesce(events_ignored, 0) + existing_biofinger_ignored_count;

  update public.biofinger_attendance_events as events
  set import_status = 'error',
      notes = concat_ws(E'\n', nullif(events.notes, ''), 'SYSTEM: Tidak dikonversi karena attendance log untuk karyawan/tanggal/event ini sudah ada dari sumber lain atau karyawan tidak aktif.'),
      updated_at = now()
  from tmp_biofinger_candidates as candidates
  left join tmp_biofinger_upserted as upserted
    on upserted.biofinger_event_id = candidates.id
  where events.id = candidates.id
    and candidates.pick_rank = 1
    and upserted.id is null
    and not exists (
      select 1
      from public.attendance_logs as existing_logs
      where existing_logs.employee_id = candidates.employee_id
        and existing_logs.attendance_date = candidates.attendance_date
        and existing_logs.event_type = candidates.normalized_event_type
        and existing_logs.source = 'biofinger'
    );

  get diagnostics events_error = row_count;

  with affected_days as (
    select distinct employee_id, attendance_date
    from tmp_biofinger_upserted
  )
  update public.attendance_logs as check_ins
  set workday_counted = exists (
        select 1
        from public.attendance_logs as check_outs
        where check_outs.employee_id = check_ins.employee_id
          and check_outs.attendance_date = check_ins.attendance_date
          and check_outs.event_type = 'check_out'
          and check_outs.status = 'valid'
      ),
      updated_at = now()
  from affected_days
  where check_ins.employee_id = affected_days.employee_id
    and check_ins.attendance_date = affected_days.attendance_date
    and check_ins.event_type = 'check_in'
    and check_ins.status = 'valid';

  for employee_record in
    select distinct employee_id
    from tmp_biofinger_upserted
  loop
    perform public.refresh_employee_payroll_cycles(employee_record.employee_id);
    refreshed_count := refreshed_count + 1;
  end loop;

  employees_refreshed := refreshed_count;
  return next;
end;
$$;

revoke all on function public.convert_biofinger_attendance_events(uuid, integer) from public;
grant execute on function public.convert_biofinger_attendance_events(uuid, integer) to authenticated;
grant execute on function public.convert_biofinger_attendance_events(uuid, integer) to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create Biofinger attendance conversion function', 'biofinger_attendance_events', '20260825000100', 'success', '{"source":"migration","module":"biofinger","conversion":"attendance_logs"}'::jsonb);
