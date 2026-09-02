-- Biofinger overnight shift conversion.
-- For overnight shifts, classify fingerprint events by the employee shift window:
-- evening events at/after shift start are check-in for that work date,
-- morning events before noon are check-out for the previous work date.

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
      employees.work_location_id as employee_work_location_id,
      (events.device_event_at at time zone 'Asia/Jakarta')::date as local_event_date,
      (events.device_event_at at time zone 'Asia/Jakarta')::time as local_event_time,
      same_shift.work_location_id as same_work_location_id,
      same_shift.start_time as same_start_time,
      same_shift.end_time as same_end_time,
      previous_shift.work_location_id as previous_work_location_id,
      previous_shift.start_time as previous_start_time,
      previous_shift.end_time as previous_end_time
    from public.biofinger_attendance_events as events
    join public.attendance_devices as devices
      on devices.id = events.attendance_device_id
    join public.employees as employees
      on employees.id = events.employee_id
    left join lateral public.resolve_employee_shift_for_date(
      events.employee_id,
      (events.device_event_at at time zone 'Asia/Jakarta')::date
    ) as same_shift on true
    left join lateral public.resolve_employee_shift_for_date(
      events.employee_id,
      ((events.device_event_at at time zone 'Asia/Jakarta')::date - 1)
    ) as previous_shift on true
    where events.import_status = 'mapped'
      and events.converted_attendance_log_id is null
      and events.employee_id is not null
      and events.normalized_event_type in ('check_in', 'check_out')
      and employees.deleted_at is null
      and employees.status = 'active'
      and (target_device_id is null or events.attendance_device_id = target_device_id)
    order by events.device_event_at asc
    limit safe_limit
  ),
  classified_events as (
    select
      limited_events.*,
      case
        when limited_events.previous_start_time is not null
         and limited_events.previous_end_time is not null
         and limited_events.previous_end_time <= limited_events.previous_start_time
         and limited_events.local_event_time < time '12:00'
          then limited_events.local_event_date - 1
        when limited_events.same_start_time is not null
         and limited_events.same_end_time is not null
         and limited_events.same_end_time <= limited_events.same_start_time
         and limited_events.local_event_time >= limited_events.same_start_time
          then limited_events.local_event_date
        when limited_events.same_start_time is not null
         and limited_events.same_end_time is not null
         and limited_events.same_end_time <= limited_events.same_start_time
         and limited_events.local_event_time < time '12:00'
          then limited_events.local_event_date - 1
        else limited_events.attendance_date
      end as effective_attendance_date,
      case
        when limited_events.previous_start_time is not null
         and limited_events.previous_end_time is not null
         and limited_events.previous_end_time <= limited_events.previous_start_time
         and limited_events.local_event_time < time '12:00'
          then 'check_out'
        when limited_events.same_start_time is not null
         and limited_events.same_end_time is not null
         and limited_events.same_end_time <= limited_events.same_start_time
         and limited_events.local_event_time >= limited_events.same_start_time
          then 'check_in'
        when limited_events.same_start_time is not null
         and limited_events.same_end_time is not null
         and limited_events.same_end_time <= limited_events.same_start_time
         and limited_events.local_event_time < time '12:00'
          then 'check_out'
        else limited_events.normalized_event_type
      end as effective_event_type
    from limited_events
  )
  select
    classified_events.*,
    row_number() over (
      partition by classified_events.employee_id, classified_events.effective_attendance_date, classified_events.effective_event_type
      order by
        case when classified_events.effective_event_type = 'check_in' then classified_events.device_event_at end asc nulls last,
        case when classified_events.effective_event_type = 'check_out' then classified_events.device_event_at end desc nulls last,
        classified_events.created_at asc
    ) as pick_rank
  from classified_events;

  select count(*)::integer
  into events_selected
  from tmp_biofinger_candidates
  where pick_rank = 1;

  update public.biofinger_attendance_events as events
  set import_status = 'ignored',
      notes = concat_ws(E'\n', nullif(events.notes, ''), 'SYSTEM: Duplicate Biofinger event tidak dikonversi; DMS memakai check-in paling awal dan check-out paling akhir per tanggal kerja.'),
      updated_at = now()
  from tmp_biofinger_candidates as candidates
  where events.id = candidates.id
    and candidates.pick_rank > 1;

  get diagnostics events_ignored = row_count;

  create temp table tmp_biofinger_upserted on commit drop as
  with selected_events as (
    select *
    from tmp_biofinger_candidates as candidates
    where candidates.pick_rank = 1
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
      coalesce(selected_events.device_work_location_id, selected_events.same_work_location_id, selected_events.previous_work_location_id, selected_events.employee_work_location_id),
      selected_events.effective_attendance_date,
      selected_events.effective_event_type,
      selected_events.device_event_at,
      null,
      null,
      null,
      null,
      'missing',
      'not_required',
      null,
      'valid',
      selected_events.effective_event_type = 'check_in',
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
      notes = concat_ws(E'\n', nullif(stale_events.notes, ''), 'SYSTEM: Digantikan oleh event Biofinger yang lebih representatif untuk tanggal kerja/event yang sama.'),
      updated_at = now()
  from tmp_biofinger_upserted as upserted
  where stale_events.converted_attendance_log_id = upserted.id
    and stale_events.id <> upserted.biofinger_event_id;

  update public.biofinger_attendance_events as events
  set import_status = 'converted',
      attendance_date = upserted.attendance_date,
      normalized_event_type = upserted.event_type,
      converted_attendance_log_id = upserted.id,
      updated_at = now()
  from tmp_biofinger_upserted as upserted
  where events.id = upserted.biofinger_event_id;

  get diagnostics events_converted = row_count;

  update public.biofinger_attendance_events as events
  set import_status = 'ignored',
      notes = concat_ws(E'\n', nullif(events.notes, ''), 'SYSTEM: Tidak dikonversi karena attendance log Biofinger untuk karyawan/tanggal kerja/event ini sudah ada dan lebih representatif.'),
      updated_at = now()
  from tmp_biofinger_candidates as candidates
  join public.attendance_logs as existing_logs
    on existing_logs.employee_id = candidates.employee_id
   and existing_logs.attendance_date = candidates.effective_attendance_date
   and existing_logs.event_type = candidates.effective_event_type
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
      notes = concat_ws(E'\n', nullif(events.notes, ''), 'SYSTEM: Tidak dikonversi karena attendance log untuk karyawan/tanggal kerja/event ini sudah ada dari sumber lain atau karyawan tidak aktif.'),
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
        and existing_logs.attendance_date = candidates.effective_attendance_date
        and existing_logs.event_type = candidates.effective_event_type
        and existing_logs.source = 'biofinger'
    );

  get diagnostics events_error = row_count;

  with affected_days as (
    select distinct employee_id, attendance_date
    from tmp_biofinger_upserted
  )
  update public.attendance_logs as check_ins
  set workday_counted = true,
      updated_at = now()
  from affected_days
  where check_ins.employee_id = affected_days.employee_id
    and check_ins.attendance_date = affected_days.attendance_date
    and check_ins.event_type = 'check_in'
    and check_ins.status = 'valid';

  perform public.refresh_attendance_daily_summaries(
    (select min(attendance_date) from tmp_biofinger_upserted),
    (select max(attendance_date) from tmp_biofinger_upserted)
  );

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

-- Reopen already converted overnight-shift Biofinger events from the affected launch window.
update public.biofinger_attendance_events as events
set import_status = 'mapped',
    converted_attendance_log_id = null,
    notes = concat_ws(E'\n', nullif(events.notes, ''), 'SYSTEM: Dibuka ulang untuk konversi shift malam berbasis jam kerja.'),
    updated_at = now()
from (
  select biofinger_events.id
  from public.biofinger_attendance_events as biofinger_events
  join public.employees
    on employees.id = biofinger_events.employee_id
  left join lateral public.resolve_employee_shift_for_date(
    biofinger_events.employee_id,
    (biofinger_events.device_event_at at time zone 'Asia/Jakarta')::date
  ) as same_shift on true
  left join lateral public.resolve_employee_shift_for_date(
    biofinger_events.employee_id,
    ((biofinger_events.device_event_at at time zone 'Asia/Jakarta')::date - 1)
  ) as previous_shift on true
  where (
      same_shift.end_time <= same_shift.start_time
      or previous_shift.end_time <= previous_shift.start_time
    )
    and biofinger_events.import_status = 'converted'
    and biofinger_events.device_event_at >= timestamp with time zone '2026-09-01 00:00:00+07'
    and biofinger_events.device_event_at < timestamp with time zone '2026-09-04 00:00:00+07'
) as eligible_events
where events.id = eligible_events.id;

delete from public.attendance_logs as logs
using (
  select attendance_logs.id
  from public.attendance_logs
  join public.employees
    on employees.id = attendance_logs.employee_id
  join lateral public.resolve_employee_shift_for_date(
    attendance_logs.employee_id,
    attendance_logs.attendance_date
  ) as work_shift on true
  where work_shift.end_time <= work_shift.start_time
    and attendance_logs.source = 'biofinger'
    and attendance_logs.event_at >= timestamp with time zone '2026-09-01 00:00:00+07'
    and attendance_logs.event_at < timestamp with time zone '2026-09-04 00:00:00+07'
) as eligible_logs
where logs.id = eligible_logs.id
  and logs.source = 'biofinger'
  and logs.event_at >= timestamp with time zone '2026-09-01 00:00:00+07'
  and logs.event_at < timestamp with time zone '2026-09-04 00:00:00+07';

select public.convert_biofinger_attendance_events(null, 5000);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Fix Biofinger overnight shift conversion',
    'biofinger_attendance_events',
    '20260902000200',
    'success',
    '{"source":"migration","module":"biofinger","policy":"overnight-shift-work-date"}'::jsonb
  );
