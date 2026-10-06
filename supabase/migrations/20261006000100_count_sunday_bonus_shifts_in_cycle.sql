-- Scheduled Sunday machine/weekly-bonus shifts are regular shift attendance.
-- Ordinary Sunday attendance stays off-cycle overtime.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.refresh_attendance_daily_summary(uuid, date)'::regprocedure)
  into function_definition;

  if function_definition like '%extract(isodow from target_attendance_date) <> 7%'
     and function_definition not like '%public.is_weekly_bonus_shift(employee_record.shift_id)%' then
    function_definition := replace(
      function_definition,
      'and extract(isodow from target_attendance_date) <> 7',
      'and (
        extract(isodow from target_attendance_date) <> 7
        or public.is_weekly_bonus_shift(employee_record.shift_id)
      )'
    );
  end if;

  if function_definition not like '%public.is_weekly_bonus_shift(employee_record.shift_id)%' then
    raise exception 'Gagal memasang pengecualian cycle Minggu untuk shift bonus/mesin.';
  end if;

  execute function_definition;
end;
$$;

do $$
declare
  affected_start date;
  affected_end date;
  employee_record record;
  summary_record record;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select min(attendance_date), max(attendance_date)
  into affected_start, affected_end
  from public.attendance_daily_summaries
  where extract(isodow from attendance_date) = 7
    and public.is_weekly_bonus_shift(shift_id)
    and actual_check_in_at is not null
    and actual_check_out_at is not null
    and coalesce(attendance_status, 'valid') = 'valid'
    and coalesce(settlement_status, '') not in ('alpha', 'off_day', 'failed', 'missing_checkin', 'missing_checkout', 'no_shift', 'review');

  if affected_start is not null then
    for summary_record in
      select distinct employee_id, attendance_date
      from public.attendance_daily_summaries
      where attendance_date between affected_start and affected_end
        and extract(isodow from attendance_date) = 7
        and public.is_weekly_bonus_shift(shift_id)
        and actual_check_in_at is not null
        and actual_check_out_at is not null
        and coalesce(attendance_status, 'valid') = 'valid'
        and coalesce(settlement_status, '') not in ('alpha', 'off_day', 'failed', 'missing_checkin', 'missing_checkout', 'no_shift', 'review')
    loop
      perform public.refresh_attendance_daily_summary(summary_record.employee_id, summary_record.attendance_date);
    end loop;

    for employee_record in
      select distinct employee_id
      from public.attendance_daily_summaries
      where attendance_date between affected_start and affected_end
        and extract(isodow from attendance_date) = 7
        and public.is_weekly_bonus_shift(shift_id)
        and workday_counted = true
    loop
      perform public.detect_employee_overtime(employee_record.employee_id);
      perform public.refresh_employee_payroll_cycles(employee_record.employee_id);
    end loop;

    perform public.refresh_weekly_shift_bonus_cycles(affected_start, affected_end);
  end if;
end;
$$;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Count scheduled Sunday bonus shifts in payroll cycle',
    'attendance_daily_summaries',
    '20261006000100',
    'success',
    '{"source":"migration","module":"attendance-payroll","policy":"sunday-bonus-shift-counts-cycle"}'::jsonb
  );

notify pgrst, 'reload schema';
