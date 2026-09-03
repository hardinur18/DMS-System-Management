-- Restore payroll cycle counting on valid check-in and scope payroll refresh log updates.
-- A valid check-in must count immediately, even while checkout is pending.

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
      check_out_record.id is not null
      and next_attendance_status = ''valid''
    );
  end if;',
    '  if check_in_record.id is not null then
    next_workday_counted := (
      check_in_record.status = ''valid''
      and check_in_record.face_status <> ''failed''
      and coalesce(check_in_record.gps_status, ''valid'') <> ''out_of_radius''
      and next_settlement_status <> ''failed''
    );
  end if;'
  );

  if function_definition not like '%check_in_record.status = ''valid''%'
     or function_definition like '%check_out_record.id is not null%and next_attendance_status = ''valid''%' then
    raise exception 'Gagal memperbarui refresh_attendance_daily_summary: rule check-in counted tidak terpasang.';
  end if;

  execute function_definition;
end;
$$;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.refresh_employee_payroll_cycles(uuid)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    '  update public.attendance_logs
  set payroll_cycle_id = attendance_daily_summaries.payroll_cycle_id,
      updated_at = now()
  from public.attendance_daily_summaries
  where attendance_logs.id in (attendance_daily_summaries.check_in_log_id, attendance_daily_summaries.check_out_log_id)
    and attendance_daily_summaries.payroll_cycle_id is not null;',
    '  update public.attendance_logs
  set payroll_cycle_id = attendance_daily_summaries.payroll_cycle_id,
      updated_at = now()
  from public.attendance_daily_summaries
  where attendance_logs.employee_id = target_employee_id
    and attendance_daily_summaries.employee_id = target_employee_id
    and attendance_logs.id in (attendance_daily_summaries.check_in_log_id, attendance_daily_summaries.check_out_log_id)
    and attendance_daily_summaries.payroll_cycle_id is not null
    and attendance_logs.payroll_cycle_id is distinct from attendance_daily_summaries.payroll_cycle_id;'
  );

  if function_definition not like '%attendance_logs.employee_id = target_employee_id%'
     or function_definition not like '%attendance_logs.payroll_cycle_id is distinct from attendance_daily_summaries.payroll_cycle_id%' then
    raise exception 'Gagal memperbarui refresh_employee_payroll_cycles: scoped log update tidak terpasang.';
  end if;

  execute function_definition;
end;
$$;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Restore cycle count on valid check-in and scope payroll refresh',
    'payroll_cycles',
    '20260903000400',
    'success',
    '{"source":"migration","module":"payroll","policy":"cycle-count-on-checkin-scoped-refresh"}'::jsonb
  );
