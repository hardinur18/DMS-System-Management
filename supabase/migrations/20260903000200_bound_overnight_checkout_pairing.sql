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
      and (
        schedule_end_at is null
        or event_at <= schedule_end_at + interval '8 hours'
      )
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

select public.refresh_attendance_daily_summary((select id from public.employees where employee_code = 'EMP-047' limit 1), date '2026-09-01');
select public.refresh_attendance_daily_summary((select id from public.employees where employee_code = 'EMP-047' limit 1), date '2026-09-02');
select public.refresh_attendance_daily_summary((select id from public.employees where employee_code = 'EMP-047' limit 1), date '2026-09-03');
