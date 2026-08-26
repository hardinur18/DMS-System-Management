-- Attendance shift settlement foundation.
-- Produces one daily summary per employee/date from attendance_logs + employee shift.

create table if not exists public.attendance_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  work_location_id uuid references public.work_locations(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  shift_name text,
  shift_start_time time,
  shift_end_time time,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  check_in_log_id uuid references public.attendance_logs(id) on delete set null,
  check_out_log_id uuid references public.attendance_logs(id) on delete set null,
  actual_check_in_at timestamptz,
  actual_check_out_at timestamptz,
  expected_work_minutes integer,
  actual_work_minutes integer,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  early_leave_minutes integer not null default 0 check (early_leave_minutes >= 0),
  shortage_minutes integer not null default 0 check (shortage_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  attendance_status text not null default 'missing' check (attendance_status in ('valid', 'pending', 'failed', 'missing')),
  settlement_status text not null default 'missing_checkin' check (settlement_status in ('ready', 'running', 'short', 'missing_checkout', 'missing_checkin', 'review', 'failed', 'no_shift')),
  workday_counted boolean not null default false,
  notes text,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create index if not exists idx_attendance_daily_summaries_employee_date
on public.attendance_daily_summaries(employee_id, attendance_date desc);

create index if not exists idx_attendance_daily_summaries_status
on public.attendance_daily_summaries(attendance_status, settlement_status);

create index if not exists idx_attendance_daily_summaries_workday
on public.attendance_daily_summaries(workday_counted, attendance_date desc);

drop trigger if exists trg_attendance_daily_summaries_updated_at on public.attendance_daily_summaries;
create trigger trg_attendance_daily_summaries_updated_at
before update on public.attendance_daily_summaries
for each row execute function public.set_updated_at();

alter table public.attendance_daily_summaries enable row level security;

drop policy if exists "Production read attendance daily summaries" on public.attendance_daily_summaries;
create policy "Production read attendance daily summaries"
on public.attendance_daily_summaries for select
to authenticated
using (public.has_app_permission('attendance.view') or public.has_app_permission('payroll.view'));

drop policy if exists "Production manage attendance daily summaries" on public.attendance_daily_summaries;
create policy "Production manage attendance daily summaries"
on public.attendance_daily_summaries for all
to authenticated
using (public.has_app_permission('attendance.review') or public.has_app_permission('payroll.process'))
with check (public.has_app_permission('attendance.review') or public.has_app_permission('payroll.process'));

create or replace function public.refresh_attendance_daily_summary(
  target_employee_id uuid,
  target_attendance_date date
)
returns public.attendance_daily_summaries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  employee_record record;
  check_in_record record;
  check_out_record record;
  schedule_start_local timestamp;
  schedule_end_local timestamp;
  schedule_start_at timestamptz;
  schedule_end_at timestamptz;
  expected_minutes integer;
  actual_minutes integer;
  late_value integer := 0;
  early_value integer := 0;
  shortage_value integer := 0;
  overtime_value integer := 0;
  next_attendance_status text := 'missing';
  next_settlement_status text := 'missing_checkin';
  next_workday_counted boolean := false;
  summary_row public.attendance_daily_summaries;
begin
  if actor_role = 'authenticated'
     and not (
       public.has_app_permission('attendance.view')
       or public.has_app_permission('attendance.review')
       or public.has_app_permission('payroll.view')
       or public.has_app_permission('payroll.process')
     ) then
    raise exception 'Tidak punya izin untuk refresh settlement absensi.'
      using errcode = '42501';
  end if;

  select
    employees.id,
    employees.work_location_id,
    employees.shift_id,
    shifts.name as shift_name,
    shifts.start_time,
    shifts.end_time
  into employee_record
  from public.employees
  left join public.shifts on shifts.id = employees.shift_id
  where employees.id = target_employee_id
    and employees.deleted_at is null;

  if not found then
    delete from public.attendance_daily_summaries
    where employee_id = target_employee_id
      and attendance_date = target_attendance_date;

    return null;
  end if;

  select *
  into check_in_record
  from public.attendance_logs
  where employee_id = target_employee_id
    and attendance_date = target_attendance_date
    and event_type = 'check_in'
  order by event_at asc
  limit 1;

  if employee_record.start_time is not null and employee_record.end_time is not null then
    schedule_start_local := target_attendance_date + employee_record.start_time;
    schedule_end_local := target_attendance_date + employee_record.end_time;

    if employee_record.end_time <= employee_record.start_time then
      schedule_end_local := schedule_end_local + interval '1 day';
    end if;

    schedule_start_at := schedule_start_local at time zone 'Asia/Jakarta';
    schedule_end_at := schedule_end_local at time zone 'Asia/Jakarta';
    expected_minutes := floor(extract(epoch from (schedule_end_local - schedule_start_local)) / 60)::integer;
  end if;

  if check_in_record.id is not null then
    select *
    into check_out_record
    from public.attendance_logs
    where employee_id = target_employee_id
      and event_type = 'check_out'
      and (
        attendance_date = target_attendance_date
        or (
          employee_record.start_time is not null
          and employee_record.end_time is not null
          and employee_record.end_time <= employee_record.start_time
          and attendance_date = target_attendance_date + 1
        )
      )
      and event_at > check_in_record.event_at
    order by event_at desc
    limit 1;
  else
    select *
    into check_out_record
    from public.attendance_logs
    where employee_id = target_employee_id
      and attendance_date = target_attendance_date
      and event_type = 'check_out'
    order by event_at desc
    limit 1;
  end if;

  if check_in_record.id is not null and check_out_record.id is not null then
    actual_minutes := greatest(0, floor(extract(epoch from (check_out_record.event_at - check_in_record.event_at)) / 60)::integer);
  end if;

  if schedule_start_at is not null and check_in_record.id is not null then
    late_value := greatest(0, floor(extract(epoch from (check_in_record.event_at - schedule_start_at)) / 60)::integer);
  end if;

  if schedule_end_at is not null and check_out_record.id is not null then
    early_value := greatest(0, floor(extract(epoch from (schedule_end_at - check_out_record.event_at)) / 60)::integer);
    overtime_value := greatest(0, floor(extract(epoch from (check_out_record.event_at - schedule_end_at)) / 60)::integer);
  end if;

  if expected_minutes is not null and actual_minutes is not null then
    shortage_value := greatest(0, expected_minutes - actual_minutes);
  end if;

  if check_in_record.id is null then
    next_attendance_status := 'missing';
    next_settlement_status := 'missing_checkin';
  elsif check_in_record.status = 'rejected'
        or coalesce(check_out_record.status, 'valid') = 'rejected'
        or check_in_record.face_status = 'failed'
        or coalesce(check_out_record.face_status, 'not_required') = 'failed' then
    next_attendance_status := 'failed';
    next_settlement_status := 'failed';
  elsif check_out_record.id is null then
    next_attendance_status := 'pending';
    next_settlement_status := 'missing_checkout';
  elsif employee_record.start_time is null or employee_record.end_time is null then
    next_attendance_status := 'pending';
    next_settlement_status := 'no_shift';
  elsif check_in_record.status = 'review'
        or check_out_record.status = 'review'
        or check_in_record.gps_status = 'out_of_radius'
        or check_out_record.gps_status = 'out_of_radius'
        or check_in_record.face_status = 'review'
        or check_out_record.face_status = 'review' then
    next_attendance_status := 'pending';
    next_settlement_status := 'review';
  elsif shortage_value > 0 then
    next_attendance_status := 'valid';
    next_settlement_status := 'short';
  else
    next_attendance_status := 'valid';
    next_settlement_status := 'ready';
  end if;

  next_workday_counted := (
    check_in_record.id is not null
    and check_out_record.id is not null
    and next_attendance_status = 'valid'
  );

  insert into public.attendance_daily_summaries (
    employee_id,
    attendance_date,
    work_location_id,
    shift_id,
    shift_name,
    shift_start_time,
    shift_end_time,
    scheduled_start_at,
    scheduled_end_at,
    check_in_log_id,
    check_out_log_id,
    actual_check_in_at,
    actual_check_out_at,
    expected_work_minutes,
    actual_work_minutes,
    late_minutes,
    early_leave_minutes,
    shortage_minutes,
    overtime_minutes,
    attendance_status,
    settlement_status,
    workday_counted,
    notes,
    calculated_at
  )
  values (
    target_employee_id,
    target_attendance_date,
    coalesce(check_in_record.work_location_id, check_out_record.work_location_id, employee_record.work_location_id),
    employee_record.shift_id,
    employee_record.shift_name,
    employee_record.start_time,
    employee_record.end_time,
    schedule_start_at,
    schedule_end_at,
    check_in_record.id,
    check_out_record.id,
    check_in_record.event_at,
    check_out_record.event_at,
    expected_minutes,
    actual_minutes,
    late_value,
    early_value,
    shortage_value,
    overtime_value,
    next_attendance_status,
    next_settlement_status,
    next_workday_counted,
    case
      when next_settlement_status = 'short' then 'Jam aktual kurang dari kewajiban shift. Perlu policy potongan/approval payroll.'
      when next_settlement_status = 'missing_checkout' then 'Check-in ada, check-out belum ada.'
      when next_settlement_status = 'no_shift' then 'Shift karyawan belum lengkap.'
      else null
    end,
    now()
  )
  on conflict (employee_id, attendance_date) do update set
    work_location_id = excluded.work_location_id,
    shift_id = excluded.shift_id,
    shift_name = excluded.shift_name,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    scheduled_start_at = excluded.scheduled_start_at,
    scheduled_end_at = excluded.scheduled_end_at,
    check_in_log_id = excluded.check_in_log_id,
    check_out_log_id = excluded.check_out_log_id,
    actual_check_in_at = excluded.actual_check_in_at,
    actual_check_out_at = excluded.actual_check_out_at,
    expected_work_minutes = excluded.expected_work_minutes,
    actual_work_minutes = excluded.actual_work_minutes,
    late_minutes = excluded.late_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    shortage_minutes = excluded.shortage_minutes,
    overtime_minutes = excluded.overtime_minutes,
    attendance_status = excluded.attendance_status,
    settlement_status = excluded.settlement_status,
    workday_counted = excluded.workday_counted,
    notes = excluded.notes,
    calculated_at = now(),
    updated_at = now()
  returning * into summary_row;

  if check_in_record.id is not null then
    update public.attendance_logs
    set workday_counted = next_workday_counted,
        updated_at = now()
    where id = check_in_record.id
      and workday_counted is distinct from next_workday_counted;
  end if;

  return summary_row;
end;
$$;

create or replace function public.refresh_attendance_daily_summaries(
  target_start_date date default current_date,
  target_end_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  refreshed_count integer := 0;
  work_date date;
  employee_record record;
begin
  if actor_role = 'authenticated'
     and not (
       public.has_app_permission('attendance.view')
       or public.has_app_permission('attendance.review')
       or public.has_app_permission('payroll.view')
       or public.has_app_permission('payroll.process')
     ) then
    raise exception 'Tidak punya izin untuk refresh settlement absensi.'
      using errcode = '42501';
  end if;

  for work_date in
    select generate_series(least(target_start_date, target_end_date), greatest(target_start_date, target_end_date), interval '1 day')::date
  loop
    for employee_record in
      select id from public.employees where deleted_at is null and status <> 'inactive'
    loop
      perform public.refresh_attendance_daily_summary(employee_record.id, work_date);
      refreshed_count := refreshed_count + 1;
    end loop;
  end loop;

  return refreshed_count;
end;
$$;

create or replace function public.refresh_attendance_settlement_from_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_attendance_daily_summary(new.employee_id, new.attendance_date);
    perform public.refresh_attendance_daily_summary(new.employee_id, new.attendance_date - 1);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_attendance_daily_summary(old.employee_id, old.attendance_date);
    perform public.refresh_attendance_daily_summary(old.employee_id, old.attendance_date - 1);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_attendance_settlement_from_log on public.attendance_logs;
create trigger trg_refresh_attendance_settlement_from_log
after insert or update or delete on public.attendance_logs
for each row execute function public.refresh_attendance_settlement_from_log();

revoke all on function public.refresh_attendance_daily_summary(uuid, date) from public;
revoke all on function public.refresh_attendance_daily_summaries(date, date) from public;
grant execute on function public.refresh_attendance_daily_summary(uuid, date) to authenticated;
grant execute on function public.refresh_attendance_daily_summary(uuid, date) to service_role;
grant execute on function public.refresh_attendance_daily_summaries(date, date) to authenticated;
grant execute on function public.refresh_attendance_daily_summaries(date, date) to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create attendance shift settlement foundation', 'attendance_daily_summaries', '20260826000300', 'success', '{"source":"migration","module":"attendance","summary":"shift-settlement"}'::jsonb);
