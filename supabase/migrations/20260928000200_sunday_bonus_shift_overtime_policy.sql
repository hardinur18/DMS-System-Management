-- Sunday remains excluded from the 26-day payroll cycle, but scheduled bonus
-- shifts on Sunday are regular shift attendance for overtime and weekly bonus.

create or replace function public.is_weekly_bonus_shift(target_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.weekly_bonus_policy_shifts policy_shift
    join public.weekly_bonus_policies policy
      on policy.id = policy_shift.policy_id
     and policy.is_active = true
     and policy.status = 'active'
    where policy_shift.shift_id = target_shift_id
      and policy_shift.is_active = true
  );
$$;

grant execute on function public.is_weekly_bonus_shift(uuid) to authenticated, service_role;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.detect_employee_overtime(uuid)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    '        when extract(isodow from summaries.attendance_date) = 7 then ''sunday''',
    '        when extract(isodow from summaries.attendance_date) = 7
          and not public.is_weekly_bonus_shift(summaries.shift_id) then ''sunday'''
  );

  if function_definition not like '%not public.is_weekly_bonus_shift(summaries.shift_id)%' then
    raise exception 'Gagal memasang pengecualian lembur Minggu untuk shift bonus.';
  end if;

  execute function_definition;
end;
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.refresh_weekly_shift_bonus_cycles(date, date)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    E'\n      and coalesce(summary.workday_counted, true) = true',
    ''
  );

  if function_definition like '%coalesce(summary.workday_counted, true) = true%' then
    raise exception 'Gagal melepas ketergantungan bonus mingguan dari workday_counted.';
  end if;

  execute function_definition;
end;
$$;

do $$
declare
  affected_start date;
  affected_end date;
  employee_record record;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select min(attendance_date), max(attendance_date)
  into affected_start, affected_end
  from public.attendance_daily_summaries
  where extract(isodow from attendance_date) = 7
    and public.is_weekly_bonus_shift(shift_id)
    and actual_check_in_at is not null
    and coalesce(attendance_status, 'valid') <> 'failed'
    and coalesce(settlement_status, '') not in ('alpha', 'off_day', 'failed', 'missing_checkin');

  if affected_start is null then
    return;
  end if;

  for employee_record in
    select distinct employee_id
    from public.attendance_daily_summaries
    where attendance_date between affected_start and affected_end
      and extract(isodow from attendance_date) = 7
      and public.is_weekly_bonus_shift(shift_id)
      and actual_check_in_at is not null
  loop
    perform public.detect_employee_overtime(employee_record.employee_id);
    perform public.refresh_employee_payroll_cycles(employee_record.employee_id);
  end loop;

  perform public.refresh_weekly_shift_bonus_cycles(affected_start, affected_end);
end;
$$;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Treat scheduled Sunday bonus shifts as shift attendance',
    'attendance_daily_summaries',
    '20260928000200',
    'success',
    '{"source":"migration","module":"attendance-payroll","policy":"sunday-bonus-shift-not-full-overtime"}'::jsonb
  );

notify pgrst, 'reload schema';
