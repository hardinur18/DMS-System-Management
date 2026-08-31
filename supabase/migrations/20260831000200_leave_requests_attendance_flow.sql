-- Leave/absence requests become the operational source for izin, sakit, cuti,
-- tugas luar, alpha, and off-day monitoring.

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  request_type text not null check (request_type in ('permit', 'sick', 'leave', 'field_assignment', 'alpha', 'off')),
  start_date date not null,
  end_date date not null,
  pay_policy text not null default 'unpaid' check (pay_policy in ('paid', 'unpaid', 'not_counted')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason text not null default '',
  attachment_url text,
  requested_by uuid references public.app_users(id) on delete set null,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  payroll_cycle_id uuid references public.payroll_cycles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_date_order check (start_date <= end_date)
);

create index if not exists idx_leave_requests_employee_date
on public.leave_requests(employee_id, start_date desc, end_date desc);

create index if not exists idx_leave_requests_status_date
on public.leave_requests(status, start_date desc);

create index if not exists idx_leave_requests_type_status
on public.leave_requests(request_type, status);

drop trigger if exists trg_leave_requests_updated_at on public.leave_requests;
create trigger trg_leave_requests_updated_at
before update on public.leave_requests
for each row execute function public.set_updated_at();

alter table public.leave_requests enable row level security;

drop policy if exists "Production read leave requests" on public.leave_requests;
create policy "Production read leave requests"
on public.leave_requests for select
to authenticated
using (
  public.has_app_permission('attendance.view')
  or public.has_app_permission('attendance.review')
  or public.has_app_permission('payroll.view')
  or public.has_app_permission('payroll.process')
);

drop policy if exists "Production manage leave requests" on public.leave_requests;
create policy "Production manage leave requests"
on public.leave_requests for all
to authenticated
using (
  public.has_app_permission('attendance.review')
  or public.has_app_permission('payroll.process')
)
with check (
  public.has_app_permission('attendance.review')
  or public.has_app_permission('payroll.process')
);

alter table public.attendance_daily_summaries
  add column if not exists leave_request_id uuid references public.leave_requests(id) on delete set null,
  add column if not exists leave_type text,
  add column if not exists leave_status text,
  add column if not exists leave_pay_policy text,
  add column if not exists leave_reason text,
  add column if not exists payroll_cycle_id uuid references public.payroll_cycles(id) on delete set null;

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.attendance_daily_summaries'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%settlement_status%';

  if constraint_name is not null then
    execute format('alter table public.attendance_daily_summaries drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.attendance_daily_summaries
  add constraint attendance_daily_summaries_settlement_status_check
  check (
    settlement_status in (
      'ready',
      'running',
      'short',
      'missing_checkout',
      'missing_checkin',
      'review',
      'failed',
      'no_shift',
      'excused_paid',
      'excused_unpaid',
      'field_assignment',
      'alpha',
      'off_day'
    )
  );

create index if not exists idx_attendance_daily_summaries_leave_request
on public.attendance_daily_summaries(leave_request_id)
where leave_request_id is not null;

create index if not exists idx_attendance_daily_summaries_payroll_cycle
on public.attendance_daily_summaries(payroll_cycle_id)
where payroll_cycle_id is not null;

create or replace function public.get_leave_default_pay_policy(target_request_type text)
returns text
language sql
immutable
as $$
  select case
    when target_request_type in ('sick', 'leave', 'field_assignment') then 'paid'
    when target_request_type = 'off' then 'not_counted'
    else 'unpaid'
  end;
$$;

create or replace function public.assert_leave_request_not_final(target_request public.leave_requests)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_request.id is null then
    raise exception 'Request tidak ditemukan.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.payroll_cycles
    where payroll_cycles.employee_id = target_request.employee_id
      and payroll_cycles.status in ('locked', 'paid', 'void')
      and payroll_cycles.period_started_at <= target_request.end_date
      and coalesce(payroll_cycles.period_closed_at, target_request.start_date) >= target_request.start_date
  ) then
    raise exception 'Payroll cycle sudah final. Request izin/cuti tidak bisa diubah.'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.refresh_leave_request_related_days(target_request public.leave_requests)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  day_key date;
begin
  for day_key in
    select generate_series(target_request.start_date, target_request.end_date, interval '1 day')::date
  loop
    perform public.refresh_attendance_daily_summary(target_request.employee_id, day_key);
  end loop;

  perform public.refresh_employee_payroll_cycles(target_request.employee_id);
end;
$$;

create or replace function public.refresh_attendance_daily_summary(
  target_employee_id uuid,
  target_attendance_date date
)
returns public.attendance_daily_summaries
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  employee_record record;
  check_in_record record;
  check_out_record record;
  leave_record record;
  schedule_start_local timestamp;
  schedule_end_local timestamp;
  schedule_start_at timestamptz;
  schedule_end_at timestamptz;
  expected_minutes integer;
  actual_minutes integer;
  late_tolerance integer := 0;
  early_leave_tolerance integer := 0;
  raw_late_value integer := 0;
  raw_early_value integer := 0;
  late_value integer := 0;
  early_value integer := 0;
  shortage_value integer := 0;
  overtime_value integer := 0;
  next_attendance_status text := 'missing';
  next_settlement_status text := 'missing_checkin';
  next_workday_counted boolean := false;
  summary_note text;
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

  select *
  into employee_record
  from public.resolve_employee_shift_for_date(target_employee_id, target_attendance_date);

  if not found then
    delete from public.attendance_daily_summaries
    where employee_id = target_employee_id
      and attendance_date = target_attendance_date;

    return null;
  end if;

  select *
  into leave_record
  from public.leave_requests
  where employee_id = target_employee_id
    and target_attendance_date between start_date and end_date
    and status = 'approved'
  order by
    case request_type
      when 'field_assignment' then 0
      when 'sick' then 1
      when 'leave' then 2
      when 'permit' then 3
      when 'off' then 4
      else 5
    end,
    updated_at desc
  limit 1;

  late_tolerance := greatest(0, coalesce(employee_record.late_tolerance_minutes, 0));
  early_leave_tolerance := greatest(0, coalesce(employee_record.early_leave_tolerance_minutes, 0));

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
    raw_late_value := greatest(0, floor(extract(epoch from (check_in_record.event_at - schedule_start_at)) / 60)::integer);
    late_value := greatest(0, raw_late_value - late_tolerance);
  end if;

  if schedule_end_at is not null and check_out_record.id is not null then
    raw_early_value := greatest(0, floor(extract(epoch from (schedule_end_at - check_out_record.event_at)) / 60)::integer);
    early_value := greatest(0, raw_early_value - early_leave_tolerance);
    overtime_value := greatest(0, floor(extract(epoch from (check_out_record.event_at - schedule_end_at)) / 60)::integer);
  end if;

  if expected_minutes is not null and actual_minutes is not null then
    shortage_value := greatest(0, expected_minutes - actual_minutes);
  end if;

  if check_in_record.id is null and leave_record.id is not null then
    if leave_record.request_type = 'field_assignment' then
      next_attendance_status := 'valid';
      next_settlement_status := 'field_assignment';
      next_workday_counted := leave_record.pay_policy = 'paid';
    elsif leave_record.request_type = 'alpha' then
      next_attendance_status := 'failed';
      next_settlement_status := 'alpha';
      next_workday_counted := false;
    elsif leave_record.request_type = 'off' then
      next_attendance_status := 'missing';
      next_settlement_status := 'off_day';
      next_workday_counted := false;
    elsif leave_record.pay_policy = 'paid' then
      next_attendance_status := 'valid';
      next_settlement_status := 'excused_paid';
      next_workday_counted := true;
    else
      next_attendance_status := 'missing';
      next_settlement_status := 'excused_unpaid';
      next_workday_counted := false;
    end if;
  elsif check_in_record.id is null then
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

  if check_in_record.id is not null then
    next_workday_counted := (
      check_out_record.id is not null
      and next_attendance_status = 'valid'
    );
  end if;

  summary_note := case
    when leave_record.id is not null and check_in_record.id is null then
      trim(both ' ' from concat_ws(' - ',
        case leave_record.request_type
          when 'permit' then 'Izin disetujui'
          when 'sick' then 'Sakit disetujui'
          when 'leave' then 'Cuti disetujui'
          when 'field_assignment' then 'Tugas luar disetujui'
          when 'alpha' then 'Alpha tercatat'
          when 'off' then 'Hari libur/off'
          else 'Ketidakhadiran disetujui'
        end,
        nullif(leave_record.reason, '')
      ))
    when next_settlement_status = 'short' then 'Jam aktual kurang dari kewajiban shift. Perlu policy potongan/approval payroll.'
    when next_settlement_status = 'missing_checkout' then 'Check-in ada, check-out belum ada.'
    when next_settlement_status = 'no_shift' then 'Shift karyawan belum lengkap.'
    else null
  end;

  insert into public.attendance_daily_summaries (
    employee_id,
    attendance_date,
    work_location_id,
    shift_id,
    shift_name,
    shift_start_time,
    shift_end_time,
    shift_late_tolerance_minutes,
    shift_early_leave_tolerance_minutes,
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
    leave_request_id,
    leave_type,
    leave_status,
    leave_pay_policy,
    leave_reason,
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
    late_tolerance,
    early_leave_tolerance,
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
    case when check_in_record.id is null then leave_record.id else null end,
    case when check_in_record.id is null then leave_record.request_type else null end,
    case when check_in_record.id is null then leave_record.status else null end,
    case when check_in_record.id is null then leave_record.pay_policy else null end,
    case when check_in_record.id is null then leave_record.reason else null end,
    summary_note,
    now()
  )
  on conflict (employee_id, attendance_date) do update set
    work_location_id = excluded.work_location_id,
    shift_id = excluded.shift_id,
    shift_name = excluded.shift_name,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    shift_late_tolerance_minutes = excluded.shift_late_tolerance_minutes,
    shift_early_leave_tolerance_minutes = excluded.shift_early_leave_tolerance_minutes,
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
    leave_request_id = excluded.leave_request_id,
    leave_type = excluded.leave_type,
    leave_status = excluded.leave_status,
    leave_pay_policy = excluded.leave_pay_policy,
    leave_reason = excluded.leave_reason,
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
$function$;

revoke all on function public.refresh_attendance_daily_summary(uuid, date) from public;
grant execute on function public.refresh_attendance_daily_summary(uuid, date) to authenticated;
grant execute on function public.refresh_attendance_daily_summary(uuid, date) to service_role;

create or replace function public.request_leave(
  target_employee_id uuid,
  target_request_type text,
  target_start_date date,
  target_end_date date,
  target_pay_policy text default null,
  request_reason text default '',
  request_attachment_url text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  actor_user_id uuid;
  normalized_type text := lower(coalesce(target_request_type, ''));
  normalized_policy text := lower(coalesce(target_pay_policy, ''));
  existing_request public.leave_requests;
  inserted_request public.leave_requests;
  old_start_date date;
  old_end_date date;
  refresh_date date;
begin
  if actor_role = 'authenticated'
     and not (
       public.has_app_permission('attendance.review')
       or public.has_app_permission('payroll.process')
     ) then
    raise exception 'Tidak punya izin membuat request izin/cuti.'
      using errcode = '42501';
  end if;

  if target_employee_id is null then
    raise exception 'Karyawan wajib dipilih.'
      using errcode = '22023';
  end if;

  if normalized_type not in ('permit', 'sick', 'leave', 'field_assignment', 'alpha', 'off') then
    raise exception 'Jenis request tidak valid.'
      using errcode = '22023';
  end if;

  if target_start_date is null or target_end_date is null or target_start_date > target_end_date then
    raise exception 'Periode request tidak valid.'
      using errcode = '22023';
  end if;

  if normalized_policy = '' then
    normalized_policy := public.get_leave_default_pay_policy(normalized_type);
  end if;

  if normalized_policy not in ('paid', 'unpaid', 'not_counted') then
    raise exception 'Policy pembayaran tidak valid.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.employees where id = target_employee_id and deleted_at is null) then
    raise exception 'Karyawan tidak ditemukan.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.payroll_cycles
    where payroll_cycles.employee_id = target_employee_id
      and payroll_cycles.status in ('locked', 'paid', 'void')
      and payroll_cycles.period_started_at <= target_end_date
      and coalesce(payroll_cycles.period_closed_at, target_start_date) >= target_start_date
  ) then
    raise exception 'Payroll cycle periode ini sudah final. Request izin/cuti tidak bisa dibuat.'
      using errcode = '55000';
  end if;

  select *
  into existing_request
  from public.leave_requests
  where employee_id = target_employee_id
    and status in ('pending', 'approved')
    and daterange(start_date, end_date, '[]') && daterange(target_start_date, target_end_date, '[]')
  order by updated_at desc
  limit 1;

  if existing_request.id is not null then
    perform public.assert_leave_request_not_final(existing_request);
    old_start_date := existing_request.start_date;
    old_end_date := existing_request.end_date;

    update public.leave_requests
    set
      request_type = normalized_type,
      start_date = target_start_date,
      end_date = target_end_date,
      pay_policy = normalized_policy,
      reason = coalesce(request_reason, ''),
      attachment_url = nullif(request_attachment_url, ''),
      status = case when status = 'approved' then 'pending' else status end,
      reviewed_by = null,
      reviewed_at = null,
      review_notes = null,
      payroll_cycle_id = null,
      updated_at = now()
    where id = existing_request.id
    returning * into inserted_request;

    refresh_date := old_start_date;
    while refresh_date <= old_end_date loop
      perform public.refresh_attendance_daily_summary(target_employee_id, refresh_date);
      refresh_date := refresh_date + 1;
    end loop;
  else
    select id
    into actor_user_id
    from public.app_users
    where auth_user_id = auth.uid()
    limit 1;

    insert into public.leave_requests (
      employee_id,
      request_type,
      start_date,
      end_date,
      pay_policy,
      reason,
      attachment_url,
      requested_by
    )
    values (
      target_employee_id,
      normalized_type,
      target_start_date,
      target_end_date,
      normalized_policy,
      coalesce(request_reason, ''),
      nullif(request_attachment_url, ''),
      actor_user_id
    )
    returning * into inserted_request;
  end if;

  perform public.refresh_leave_request_related_days(inserted_request);

  return inserted_request;
end;
$$;

revoke all on function public.request_leave(uuid, text, date, date, text, text, text) from public;
grant execute on function public.request_leave(uuid, text, date, date, text, text, text) to authenticated;
grant execute on function public.request_leave(uuid, text, date, date, text, text, text) to service_role;

create or replace function public.review_leave_request(
  target_request_id uuid,
  review_decision text,
  review_note text default ''
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  actor_user_id uuid;
  target_request public.leave_requests;
  reviewed_request public.leave_requests;
  normalized_decision text := lower(coalesce(review_decision, ''));
begin
  if actor_role = 'authenticated'
     and not (
       public.has_app_permission('attendance.review')
       or public.has_app_permission('payroll.process')
     ) then
    raise exception 'Tidak punya izin review izin/cuti.'
      using errcode = '42501';
  end if;

  if normalized_decision not in ('approve', 'reject', 'cancel') then
    raise exception 'Action review tidak valid.'
      using errcode = '22023';
  end if;

  select *
  into target_request
  from public.leave_requests
  where id = target_request_id;

  perform public.assert_leave_request_not_final(target_request);

  select id
  into actor_user_id
  from public.app_users
  where auth_user_id = auth.uid()
  limit 1;

  update public.leave_requests
  set
    status = case normalized_decision
      when 'approve' then 'approved'
      when 'reject' then 'rejected'
      else 'cancelled'
    end,
    reviewed_by = actor_user_id,
    reviewed_at = now(),
    review_notes = coalesce(review_note, ''),
    payroll_cycle_id = case when normalized_decision = 'approve' then payroll_cycle_id else null end,
    updated_at = now()
  where id = target_request.id
  returning * into reviewed_request;

  perform public.refresh_leave_request_related_days(reviewed_request);

  return reviewed_request;
end;
$$;

revoke all on function public.review_leave_request(uuid, text, text) from public;
grant execute on function public.review_leave_request(uuid, text, text) to authenticated;
grant execute on function public.review_leave_request(uuid, text, text) to service_role;

create or replace function public.delete_leave_request(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  target_request public.leave_requests;
begin
  if actor_role = 'authenticated'
     and not (
       public.has_app_permission('attendance.review')
       or public.has_app_permission('payroll.process')
     ) then
    raise exception 'Tidak punya izin hapus izin/cuti.'
      using errcode = '42501';
  end if;

  select *
  into target_request
  from public.leave_requests
  where id = target_request_id;

  perform public.assert_leave_request_not_final(target_request);

  if target_request.status = 'approved' then
    raise exception 'Request approved harus dibatalkan dulu, tidak langsung dihapus.'
      using errcode = '55000';
  end if;

  delete from public.leave_requests
  where id = target_request.id;

  perform public.refresh_leave_request_related_days(target_request);
end;
$$;

revoke all on function public.delete_leave_request(uuid) from public;
grant execute on function public.delete_leave_request(uuid) to authenticated;
grant execute on function public.delete_leave_request(uuid) to service_role;

create or replace function public.refresh_employee_payroll_cycles(target_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with employee_settings as (
    select
      employees.id as employee_id,
      case
        when employees.payroll_method = 'attendance_cycle'
          then least(greatest(coalesce(employees.payroll_cycle_days, 0), 0), 26)
        else 0
      end as opening_days,
      case
        when employees.payroll_method = 'attendance_cycle'
          then coalesce(employees.payroll_cycle_opening_date, employees.join_date)
        else employees.join_date
      end as opening_date
    from public.employees
    where employees.id = target_employee_id
  ),
  final_cycle_bounds as (
    select
      payroll_cycles.employee_id,
      payroll_cycles.cycle_number,
      coalesce(
        payroll_cycles.period_closed_at,
        (
          select max(attendance_daily_summaries.attendance_date)
          from public.attendance_daily_summaries
          where attendance_daily_summaries.payroll_cycle_id = payroll_cycles.id
        ),
        (
          select max(attendance_logs.attendance_date)
          from public.attendance_logs
          where attendance_logs.payroll_cycle_id = payroll_cycles.id
        ),
        payroll_cycles.period_started_at
      ) as boundary_date
    from public.payroll_cycles
    where payroll_cycles.employee_id = target_employee_id
      and payroll_cycles.status in ('locked', 'paid', 'void')
  ),
  latest_final_cycle as (
    select
      final_cycle_bounds.employee_id,
      coalesce(max(final_cycle_bounds.cycle_number), 0) as base_cycle_number,
      max(final_cycle_bounds.boundary_date) as boundary_date
    from final_cycle_bounds
    group by final_cycle_bounds.employee_id
  ),
  counted_days as (
    select
      attendance_daily_summaries.employee_id,
      attendance_daily_summaries.attendance_date,
      coalesce(latest_final_cycle.base_cycle_number, 0) as base_cycle_number,
      case
        when coalesce(latest_final_cycle.base_cycle_number, 0) = 0 then employee_settings.opening_days
        else 0
      end as opening_days,
      employee_settings.opening_date,
      row_number() over (
        partition by attendance_daily_summaries.employee_id
        order by attendance_daily_summaries.attendance_date asc
      ) as attendance_index
    from public.attendance_daily_summaries
    join employee_settings on employee_settings.employee_id = attendance_daily_summaries.employee_id
    left join latest_final_cycle on latest_final_cycle.employee_id = attendance_daily_summaries.employee_id
    where attendance_daily_summaries.employee_id = target_employee_id
      and attendance_daily_summaries.workday_counted = true
      and (
        latest_final_cycle.boundary_date is null
        or attendance_daily_summaries.attendance_date > latest_final_cycle.boundary_date
        or (
          attendance_daily_summaries.attendance_date = latest_final_cycle.boundary_date
          and not exists (
            select 1
            from public.attendance_daily_summaries finalized_summaries
            join public.payroll_cycles finalized_cycles
              on finalized_cycles.id = finalized_summaries.payroll_cycle_id
             and finalized_cycles.status in ('locked', 'paid', 'void')
            where finalized_summaries.employee_id = attendance_daily_summaries.employee_id
              and finalized_summaries.attendance_date = attendance_daily_summaries.attendance_date
          )
        )
      )
  ),
  grouped_days as (
    select
      counted_days.*,
      (counted_days.opening_days + counted_days.attendance_index)::integer as running_workday_number,
      (
        counted_days.base_cycle_number
        + (((counted_days.opening_days + counted_days.attendance_index - 1) / 26) + 1)::integer
      ) as cycle_number,
      (((counted_days.opening_days + counted_days.attendance_index - 1) % 26) + 1)::integer as cycle_day_number
    from counted_days
  ),
  cycle_source as (
    select
      grouped_days.employee_id,
      grouped_days.cycle_number,
      case
        when grouped_days.base_cycle_number = 0
          and grouped_days.cycle_number = 1
          and max(grouped_days.opening_days) > 0
          then coalesce(min(grouped_days.opening_date), min(grouped_days.attendance_date))
        else min(grouped_days.attendance_date)
      end as period_started_at,
      case when max(grouped_days.cycle_day_number) >= 26 then max(grouped_days.attendance_date) else null end as period_closed_at,
      least(max(grouped_days.cycle_day_number)::integer, 26) as work_days_count
    from grouped_days
    group by grouped_days.employee_id, grouped_days.cycle_number, grouped_days.base_cycle_number
  ),
  upserted_cycles as (
    insert into public.payroll_cycles (
      employee_id,
      cycle_number,
      period_started_at,
      period_closed_at,
      work_days_count,
      salary_type,
      daily_salary,
      monthly_salary,
      payroll_method,
      gross_amount,
      overtime_amount,
      net_amount,
      status,
      ready_at
    )
    select
      cycle_source.employee_id,
      cycle_source.cycle_number,
      cycle_source.period_started_at,
      cycle_source.period_closed_at,
      cycle_source.work_days_count,
      employees.salary_type,
      employees.daily_salary,
      employees.monthly_salary,
      employees.payroll_method,
      case
        when employees.salary_type = 'monthly' and employees.prorate_enabled = false then employees.monthly_salary
        when employees.salary_type = 'monthly' then round((employees.monthly_salary / 26) * cycle_source.work_days_count, 2)
        else round(employees.daily_salary * cycle_source.work_days_count, 2)
      end as gross_amount,
      0 as overtime_amount,
      case
        when employees.salary_type = 'monthly' and employees.prorate_enabled = false then employees.monthly_salary
        when employees.salary_type = 'monthly' then round((employees.monthly_salary / 26) * cycle_source.work_days_count, 2)
        else round(employees.daily_salary * cycle_source.work_days_count, 2)
      end as net_amount,
      case when cycle_source.work_days_count >= 26 then 'ready' else 'active' end as status,
      case when cycle_source.work_days_count >= 26 then now() else null end as ready_at
    from cycle_source
    join public.employees on employees.id = cycle_source.employee_id
    on conflict (employee_id, cycle_number) do update set
      period_started_at = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.period_started_at
        else excluded.period_started_at
      end,
      period_closed_at = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.period_closed_at
        else excluded.period_closed_at
      end,
      work_days_count = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.work_days_count
        else excluded.work_days_count
      end,
      salary_type = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.salary_type
        else excluded.salary_type
      end,
      daily_salary = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.daily_salary
        else excluded.daily_salary
      end,
      monthly_salary = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.monthly_salary
        else excluded.monthly_salary
      end,
      payroll_method = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.payroll_method
        else excluded.payroll_method
      end,
      gross_amount = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.gross_amount
        else excluded.gross_amount
      end,
      net_amount = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.net_amount
        else excluded.net_amount
      end,
      status = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.status
        else excluded.status
      end,
      ready_at = case
        when public.payroll_cycles.status in ('locked', 'paid', 'void') then public.payroll_cycles.ready_at
        else excluded.ready_at
      end,
      updated_at = now()
    returning id, employee_id, cycle_number, period_started_at, period_closed_at
  )
  update public.attendance_daily_summaries
  set payroll_cycle_id = upserted_cycles.id,
      updated_at = now()
  from grouped_days
  join upserted_cycles
    on upserted_cycles.employee_id = grouped_days.employee_id
   and upserted_cycles.cycle_number = grouped_days.cycle_number
  where attendance_daily_summaries.employee_id = grouped_days.employee_id
    and attendance_daily_summaries.attendance_date = grouped_days.attendance_date;

  update public.attendance_logs
  set payroll_cycle_id = attendance_daily_summaries.payroll_cycle_id,
      updated_at = now()
  from public.attendance_daily_summaries
  where attendance_logs.id in (attendance_daily_summaries.check_in_log_id, attendance_daily_summaries.check_out_log_id)
    and attendance_daily_summaries.payroll_cycle_id is not null;

  update public.leave_requests
  set payroll_cycle_id = payroll_cycles.id,
      updated_at = now()
  from public.payroll_cycles
  where leave_requests.employee_id = target_employee_id
    and leave_requests.employee_id = payroll_cycles.employee_id
    and leave_requests.status = 'approved'
    and leave_requests.pay_policy = 'paid'
    and payroll_cycles.status not in ('locked', 'paid', 'void')
    and leave_requests.start_date <= coalesce(payroll_cycles.period_closed_at, leave_requests.start_date)
    and leave_requests.end_date >= payroll_cycles.period_started_at;

  update public.overtime_requests
  set payroll_cycle_id = payroll_cycles.id,
      updated_at = now()
  from public.payroll_cycles
  where overtime_requests.employee_id = target_employee_id
    and payroll_cycles.employee_id = target_employee_id
    and overtime_requests.overtime_date >= payroll_cycles.period_started_at
    and (
      payroll_cycles.period_closed_at is null
      or overtime_requests.overtime_date <= payroll_cycles.period_closed_at
    )
    and overtime_requests.status <> 'rejected'
    and payroll_cycles.status not in ('locked', 'paid', 'void');

  update public.payroll_cycles
  set overtime_amount = coalesce((
        select sum(overtime_requests.total_amount)
        from public.overtime_requests
        where overtime_requests.payroll_cycle_id = payroll_cycles.id
          and overtime_requests.status = 'approved'
      ), 0),
      updated_at = now()
  where payroll_cycles.employee_id = target_employee_id
    and payroll_cycles.status not in ('locked', 'paid', 'void');

  update public.payroll_cycles
  set net_amount = greatest(coalesce(gross_amount, 0) + coalesce(overtime_amount, 0), 0),
      updated_at = now()
  where payroll_cycles.employee_id = target_employee_id
    and payroll_cycles.status not in ('locked', 'paid', 'void');

  delete from public.payroll_cycles
  where employee_id = target_employee_id
    and status not in ('locked', 'paid', 'void')
    and not exists (
      select 1
      from public.attendance_daily_summaries
      where attendance_daily_summaries.payroll_cycle_id = payroll_cycles.id
    );
end;
$$;

grant execute on function public.refresh_employee_payroll_cycles(uuid) to authenticated;
grant execute on function public.refresh_employee_payroll_cycles(uuid) to service_role;

select public.refresh_attendance_daily_summaries((current_date - interval '90 days')::date, (current_date + interval '1 day')::date);
select public.refresh_all_employee_payroll_cycles();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create leave request attendance flow', 'leave_requests', '20260831000200', 'success', '{"source":"migration","module":"attendance","summary":"leave-requests-payroll"}'::jsonb);

notify pgrst, 'reload schema';
