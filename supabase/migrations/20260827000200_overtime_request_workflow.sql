-- Planned overtime request workflow.
-- A planned request authorizes/marks overtime before work happens, but payroll
-- still pays only the realized payable minutes after attendance settlement.

alter table public.overtime_requests
add column if not exists request_source text not null default 'auto',
add column if not exists planned_start_at timestamptz,
add column if not exists planned_end_at timestamptz,
add column if not exists planned_minutes integer not null default 0 check (planned_minutes >= 0),
add column if not exists request_reason text,
add column if not exists requested_by uuid references public.app_users(id) on delete set null,
add column if not exists requested_at timestamptz,
add column if not exists matched_attendance boolean not null default false;

update public.overtime_requests
set
  request_source = coalesce(nullif(request_source, ''), 'auto'),
  matched_attendance = actual_check_out_at is not null,
  requested_at = coalesce(requested_at, created_at)
where request_source is null
   or request_source = ''
   or requested_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'overtime_requests_request_source_check') then
    alter table public.overtime_requests
      add constraint overtime_requests_request_source_check
      check (request_source in ('auto', 'planned', 'manual'));
  end if;
end $$;

create index if not exists idx_overtime_requests_source_status
on public.overtime_requests(request_source, status, overtime_date desc);

create or replace function public.request_overtime(
  target_employee_id uuid,
  target_overtime_date date,
  planned_start_time time,
  planned_end_time time,
  request_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_record record;
  employee_record record;
  component_record record;
  existing_record record;
  cleaned_reason text := nullif(trim(coalesce(request_reason, '')), '');
  detected_day_type text;
  planned_start_local timestamp;
  planned_end_local timestamp;
  planned_duration_minutes integer;
  result_id uuid;
begin
  if not (
    public.has_app_permission('overtime.review')
    or public.has_app_permission('payroll.process')
    or public.has_app_permission('attendance.review')
  ) then
    raise exception 'Role tidak punya akses membuat request lembur.';
  end if;

  if target_employee_id is null then
    raise exception 'Karyawan wajib dipilih.';
  end if;

  if target_overtime_date is null then
    raise exception 'Tanggal lembur wajib diisi.';
  end if;

  if planned_start_time is null or planned_end_time is null then
    raise exception 'Jam rencana lembur wajib lengkap.';
  end if;

  if cleaned_reason is null then
    raise exception 'Alasan lembur wajib diisi.';
  end if;

  select app_users.id, app_users.full_name
  into actor_record
  from public.app_users
  where app_users.auth_user_id = auth.uid()
    and app_users.status = 'active'
  limit 1;

  if actor_record.id is null then
    raise exception 'User aplikasi tidak aktif.';
  end if;

  select
    employees.id,
    employees.full_name,
    shifts.start_time as shift_start_time,
    shifts.end_time as shift_end_time
  into employee_record
  from public.employees
  left join public.shifts on shifts.id = employees.shift_id
  where employees.id = target_employee_id
    and employees.deleted_at is null
    and employees.status <> 'inactive'
  limit 1;

  if employee_record.id is null then
    raise exception 'Karyawan tidak ditemukan atau tidak aktif.';
  end if;

  select id, status, payroll_cycle_id
  into existing_record
  from public.overtime_requests
  where employee_id = target_employee_id
    and overtime_date = target_overtime_date
  limit 1;

  if existing_record.status = 'approved' then
    raise exception 'Lembur tanggal ini sudah approved dan tidak bisa diganti lewat request baru.';
  end if;

  planned_start_local := target_overtime_date::timestamp + planned_start_time;
  planned_end_local := target_overtime_date::timestamp + planned_end_time;

  if planned_end_time <= planned_start_time then
    planned_end_local := planned_end_local + interval '1 day';
  end if;

  planned_duration_minutes := greatest(0, floor(extract(epoch from (planned_end_local - planned_start_local)) / 60))::integer;

  if planned_duration_minutes <= 0 then
    raise exception 'Durasi rencana lembur tidak valid.';
  end if;

  detected_day_type := case
    when extract(isodow from target_overtime_date) = 7 then 'sunday'
    else 'weekday'
  end;

  select id, rate_amount
  into component_record
  from public.payroll_components
  where component_type = 'earning'
    and calculation_unit = 'hour'
    and auto_detect_overtime = true
    and is_active = true
    and day_type in (detected_day_type, 'all')
  order by case when day_type = detected_day_type then 0 else 1 end, sort_order asc, code asc
  limit 1;

  if component_record.id is null then
    raise exception 'Komponen lembur aktif belum disiapkan di Master Data.';
  end if;

  insert into public.overtime_requests (
    employee_id,
    payroll_component_id,
    overtime_date,
    shift_start_time,
    shift_end_time,
    overtime_minutes,
    approved_minutes,
    rate_amount,
    total_amount,
    day_type,
    status,
    request_source,
    planned_start_at,
    planned_end_at,
    planned_minutes,
    request_reason,
    requested_by,
    requested_at,
    matched_attendance,
    notes
  )
  values (
    target_employee_id,
    component_record.id,
    target_overtime_date,
    employee_record.shift_start_time,
    employee_record.shift_end_time,
    0,
    0,
    component_record.rate_amount,
    0,
    detected_day_type,
    'draft',
    'planned',
    planned_start_local at time zone 'Asia/Jakarta',
    planned_end_local at time zone 'Asia/Jakarta',
    planned_duration_minutes,
    cleaned_reason,
    actor_record.id,
    now(),
    false,
    format('Request lembur oleh %s. Rencana %s - %s (%s menit). Alasan: %s', actor_record.full_name, planned_start_time, planned_end_time, planned_duration_minutes, cleaned_reason)
  )
  on conflict (employee_id, overtime_date) do update set
    payroll_component_id = excluded.payroll_component_id,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    rate_amount = excluded.rate_amount,
    day_type = excluded.day_type,
    request_source = 'planned',
    planned_start_at = excluded.planned_start_at,
    planned_end_at = excluded.planned_end_at,
    planned_minutes = excluded.planned_minutes,
    request_reason = excluded.request_reason,
    requested_by = excluded.requested_by,
    requested_at = excluded.requested_at,
    status = case
      when public.overtime_requests.actual_check_out_at is not null and public.overtime_requests.overtime_minutes > 0 then 'pending'
      else 'draft'
    end,
    notes = trim(both E'\n' from concat_ws(E'\n', nullif(public.overtime_requests.notes, ''), excluded.notes)),
    updated_at = now()
  returning id into result_id;

  insert into public.audit_logs (actor_user_id, actor_name, action, target_table, target_id, status, metadata)
  values (
    actor_record.id,
    actor_record.full_name,
    'Request overtime',
    'overtime_requests',
    result_id::text,
    'success',
    jsonb_build_object(
      'employee_id', target_employee_id,
      'overtime_date', target_overtime_date,
      'planned_minutes', planned_duration_minutes,
      'source', 'rpc'
    )
  );

  return result_id;
end;
$$;

create or replace function public.detect_employee_overtime(target_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with summary_candidates as (
    select
      summaries.employee_id,
      summaries.attendance_date,
      summaries.check_out_log_id,
      summaries.shift_start_time,
      summaries.shift_end_time,
      summaries.actual_check_out_at,
      coalesce(summaries.expected_work_minutes, 0) as expected_work_minutes,
      coalesce(summaries.actual_work_minutes, 0) as actual_work_minutes,
      coalesce(summaries.overtime_minutes, 0) as post_shift_minutes,
      greatest(0, coalesce(summaries.actual_work_minutes, 0) - coalesce(summaries.expected_work_minutes, 0))::integer as extra_work_minutes,
      case
        when extract(isodow from summaries.attendance_date) = 7 then 'sunday'
        else 'weekday'
      end as detected_day_type
    from public.attendance_daily_summaries summaries
    where summaries.employee_id = target_employee_id
      and summaries.check_out_log_id is not null
      and summaries.attendance_status = 'valid'
      and summaries.workday_counted = true
  ),
  eligible as (
    select
      summary_candidates.*,
      least(summary_candidates.post_shift_minutes, summary_candidates.extra_work_minutes)::integer as payable_overtime_minutes,
      payroll_components.id as payroll_component_id,
      payroll_components.rate_amount
    from summary_candidates
    join lateral (
      select id, rate_amount
      from public.payroll_components
      where component_type = 'earning'
        and calculation_unit = 'hour'
        and auto_detect_overtime = true
        and is_active = true
        and day_type in (summary_candidates.detected_day_type, 'all')
      order by case when day_type = summary_candidates.detected_day_type then 0 else 1 end, sort_order asc, code asc
      limit 1
    ) as payroll_components on true
    where least(summary_candidates.post_shift_minutes, summary_candidates.extra_work_minutes) > 0
  )
  update public.overtime_requests requests
  set
    status = 'draft',
    overtime_minutes = 0,
    approved_minutes = 0,
    total_amount = 0,
    matched_attendance = requests.actual_check_out_at is not null,
    notes = trim(both E'\n' from concat_ws(
      E'\n',
      nullif(requests.notes, ''),
      'Auto reset: tidak ada menit lembur payable setelah kewajiban shift dihitung ulang.'
    )),
    updated_at = now()
  where requests.employee_id = target_employee_id
    and requests.status in ('draft', 'pending')
    and (
      coalesce(requests.request_source, 'auto') <> 'planned'
      or requests.actual_check_out_at is not null
    )
    and not exists (
      select 1
      from eligible
      where eligible.employee_id = requests.employee_id
        and eligible.attendance_date = requests.overtime_date
    );

  with summary_candidates as (
    select
      summaries.employee_id,
      summaries.attendance_date,
      summaries.check_out_log_id,
      summaries.shift_start_time,
      summaries.shift_end_time,
      summaries.actual_check_out_at,
      coalesce(summaries.expected_work_minutes, 0) as expected_work_minutes,
      coalesce(summaries.actual_work_minutes, 0) as actual_work_minutes,
      coalesce(summaries.overtime_minutes, 0) as post_shift_minutes,
      greatest(0, coalesce(summaries.actual_work_minutes, 0) - coalesce(summaries.expected_work_minutes, 0))::integer as extra_work_minutes,
      case
        when extract(isodow from summaries.attendance_date) = 7 then 'sunday'
        else 'weekday'
      end as detected_day_type
    from public.attendance_daily_summaries summaries
    where summaries.employee_id = target_employee_id
      and summaries.check_out_log_id is not null
      and summaries.attendance_status = 'valid'
      and summaries.workday_counted = true
  ),
  eligible as (
    select
      summary_candidates.*,
      least(summary_candidates.post_shift_minutes, summary_candidates.extra_work_minutes)::integer as payable_overtime_minutes,
      payroll_components.id as payroll_component_id,
      payroll_components.rate_amount
    from summary_candidates
    join lateral (
      select id, rate_amount
      from public.payroll_components
      where component_type = 'earning'
        and calculation_unit = 'hour'
        and auto_detect_overtime = true
        and is_active = true
        and day_type in (summary_candidates.detected_day_type, 'all')
      order by case when day_type = summary_candidates.detected_day_type then 0 else 1 end, sort_order asc, code asc
      limit 1
    ) as payroll_components on true
    where least(summary_candidates.post_shift_minutes, summary_candidates.extra_work_minutes) > 0
  )
  insert into public.overtime_requests (
    employee_id,
    attendance_log_id,
    payroll_component_id,
    overtime_date,
    shift_start_time,
    shift_end_time,
    actual_check_out_at,
    overtime_minutes,
    approved_minutes,
    rate_amount,
    total_amount,
    day_type,
    status,
    request_source,
    matched_attendance,
    notes
  )
  select
    eligible.employee_id,
    eligible.check_out_log_id,
    eligible.payroll_component_id,
    eligible.attendance_date,
    eligible.shift_start_time,
    eligible.shift_end_time,
    eligible.actual_check_out_at,
    eligible.payable_overtime_minutes,
    0,
    eligible.rate_amount,
    0,
    eligible.detected_day_type,
    'pending',
    'auto',
    true,
    format(
      'Auto-detected dari settlement harian. Wajib %s menit, aktual %s menit, pulang lewat %s menit, lembur payable %s menit.',
      eligible.expected_work_minutes,
      eligible.actual_work_minutes,
      eligible.post_shift_minutes,
      eligible.payable_overtime_minutes
    )
  from eligible
  on conflict (employee_id, overtime_date) do update set
    attendance_log_id = excluded.attendance_log_id,
    payroll_component_id = excluded.payroll_component_id,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    actual_check_out_at = excluded.actual_check_out_at,
    overtime_minutes = excluded.overtime_minutes,
    rate_amount = excluded.rate_amount,
    day_type = excluded.day_type,
    request_source = case
      when public.overtime_requests.request_source = 'planned' then 'planned'
      else excluded.request_source
    end,
    matched_attendance = true,
    notes = case
      when public.overtime_requests.status in ('approved', 'rejected') then public.overtime_requests.notes
      when public.overtime_requests.notes is null or public.overtime_requests.notes = '' then excluded.notes
      else public.overtime_requests.notes
    end,
    status = case
      when public.overtime_requests.status in ('approved', 'rejected') then public.overtime_requests.status
      else 'pending'
    end,
    approved_minutes = case
      when public.overtime_requests.status = 'approved' then public.overtime_requests.approved_minutes
      else 0
    end,
    total_amount = case
      when public.overtime_requests.status = 'approved' then public.overtime_requests.total_amount
      else 0
    end,
    updated_at = now();
end;
$$;

revoke all on function public.request_overtime(uuid, date, time, time, text) from public;
grant execute on function public.request_overtime(uuid, date, time, time, text) to authenticated;
grant execute on function public.request_overtime(uuid, date, time, time, text) to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create planned overtime request workflow', 'overtime_requests', '20260827000200', 'success', '{"source":"migration","module":"overtime-request"}'::jsonb);
