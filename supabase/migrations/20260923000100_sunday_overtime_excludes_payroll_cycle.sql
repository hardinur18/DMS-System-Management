-- Sunday attendance is off-day overtime evidence, not a payroll-cycle workday.
-- Valid Sunday check-ins/check-outs stay visible in attendance and can generate overtime,
-- but they must not increment the 26-day salary cycle.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.refresh_attendance_daily_summary(uuid, date)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    '  if check_in_record.id is not null then
    next_workday_counted := (
      check_in_record.status = ''valid''
      and check_in_record.face_status <> ''failed''
      and coalesce(check_in_record.gps_status, ''valid'') <> ''out_of_radius''
      and next_settlement_status <> ''failed''
    );
  end if;',
    '  if check_in_record.id is not null then
    next_workday_counted := (
      check_in_record.status = ''valid''
      and check_in_record.face_status <> ''failed''
      and coalesce(check_in_record.gps_status, ''valid'') <> ''out_of_radius''
      and next_settlement_status <> ''failed''
      and extract(isodow from target_attendance_date) <> 7
    );
  end if;'
  );

  function_definition := replace(
    function_definition,
    '  if check_in_record.id is not null then
    next_workday_counted := (
      check_out_record.id is not null
      and next_attendance_status = ''valid''
    );
  end if;',
    '  if check_in_record.id is not null then
    next_workday_counted := (
      check_out_record.id is not null
      and next_attendance_status = ''valid''
      and extract(isodow from target_attendance_date) <> 7
    );
  end if;'
  );

  function_definition := replace(
    function_definition,
    '    settlement_status = excluded.settlement_status,
    workday_counted = excluded.workday_counted,
    leave_request_id = excluded.leave_request_id,',
    '    settlement_status = excluded.settlement_status,
    workday_counted = excluded.workday_counted,
    payroll_cycle_id = case
      when excluded.workday_counted then public.attendance_daily_summaries.payroll_cycle_id
      else null
    end,
    leave_request_id = excluded.leave_request_id,'
  );

  function_definition := replace(
    function_definition,
    '    settlement_status = excluded.settlement_status,
    workday_counted = excluded.workday_counted,
    notes = excluded.notes,',
    '    settlement_status = excluded.settlement_status,
    workday_counted = excluded.workday_counted,
    payroll_cycle_id = case
      when excluded.workday_counted then public.attendance_daily_summaries.payroll_cycle_id
      else null
    end,
    notes = excluded.notes,'
  );

  if function_definition not like '%extract(isodow from target_attendance_date) <> 7%' then
    raise exception 'Gagal memasang rule Minggu tidak masuk workday_counted.';
  end if;

  if function_definition not like '%payroll_cycle_id = case%when excluded.workday_counted%' then
    raise exception 'Gagal memasang cleanup payroll_cycle_id di summary.';
  end if;

  execute function_definition;
end;
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.detect_employee_overtime(uuid)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    '      and summaries.workday_counted = true',
    '      and (
        summaries.workday_counted = true
        or extract(isodow from summaries.attendance_date) = 7
      )'
  );

  if function_definition not like '%or extract(isodow from summaries.attendance_date) = 7%' then
    raise exception 'Gagal memasang rule deteksi lembur Minggu non-cycle.';
  end if;

  execute function_definition;
end;
$$;

do $$
declare
  attendance_record record;
  employee_record record;
begin
  for attendance_record in
    select distinct employee_id, attendance_date
    from (
      select employee_id, attendance_date
      from public.attendance_daily_summaries
      where extract(isodow from attendance_date) = 7
      union
      select employee_id, attendance_date
      from public.attendance_logs
      where extract(isodow from attendance_date) = 7
    ) sunday_attendance
    where employee_id is not null
      and attendance_date is not null
  loop
    perform public.refresh_attendance_daily_summary(attendance_record.employee_id, attendance_record.attendance_date);
  end loop;

  update public.attendance_logs
  set workday_counted = false,
      payroll_cycle_id = null,
      updated_at = now()
  where extract(isodow from attendance_date) = 7
    and (
      workday_counted is distinct from false
      or payroll_cycle_id is not null
    )
    and (
      payroll_cycle_id is null
      or exists (
        select 1
        from public.payroll_cycles
        where payroll_cycles.id = attendance_logs.payroll_cycle_id
          and payroll_cycles.status not in ('locked', 'paid', 'void')
      )
    );

  update public.attendance_daily_summaries
  set workday_counted = false,
      payroll_cycle_id = null,
      updated_at = now()
  where extract(isodow from attendance_date) = 7
    and (
      workday_counted is distinct from false
      or payroll_cycle_id is not null
    )
    and (
      payroll_cycle_id is null
      or exists (
        select 1
        from public.payroll_cycles
        where payroll_cycles.id = attendance_daily_summaries.payroll_cycle_id
          and payroll_cycles.status not in ('locked', 'paid', 'void')
      )
    );

  for employee_record in
    select distinct employee_id as id
    from (
      select employee_id
      from public.attendance_daily_summaries
      where extract(isodow from attendance_date) = 7
      union
      select employee_id
      from public.attendance_logs
      where extract(isodow from attendance_date) = 7
    ) sunday_employees
    where employee_id is not null
  loop
    perform public.detect_employee_overtime(employee_record.id);
    perform public.refresh_employee_payroll_cycles(employee_record.id);
  end loop;
end;
$$;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Exclude Sunday attendance from payroll cycle',
    'attendance_daily_summaries',
    '20260923000100',
    'success',
    '{"source":"migration","module":"attendance-payroll","policy":"sunday-overtime-not-cycle"}'::jsonb
  );

notify pgrst, 'reload schema';
