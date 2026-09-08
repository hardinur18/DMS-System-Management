-- Keep Biofinger conversion responsive by scoping payroll log refresh to the
-- employee currently being recalculated.

do $$
declare
  function_definition text;
  patched_definition text;
begin
  select pg_get_functiondef('public.refresh_employee_payroll_cycles(uuid)'::regprocedure)
  into function_definition;

  if function_definition is null then
    raise exception 'refresh_employee_payroll_cycles(uuid) tidak ditemukan.';
  end if;

  patched_definition := regexp_replace(
    function_definition,
    $pattern$update public[.]attendance_logs[[:space:]]+set payroll_cycle_id = attendance_daily_summaries[.]payroll_cycle_id,[[:space:]]+updated_at = now[(][)][[:space:]]+from public[.]attendance_daily_summaries[[:space:]]+where attendance_logs[.]id in [(]attendance_daily_summaries[.]check_in_log_id, attendance_daily_summaries[.]check_out_log_id[)][[:space:]]+and attendance_daily_summaries[.]payroll_cycle_id is not null;$pattern$,
    $replacement$update public.attendance_logs
  set payroll_cycle_id = attendance_daily_summaries.payroll_cycle_id,
      updated_at = now()
  from public.attendance_daily_summaries
  where attendance_logs.employee_id = target_employee_id
    and attendance_daily_summaries.employee_id = target_employee_id
    and attendance_logs.id in (attendance_daily_summaries.check_in_log_id, attendance_daily_summaries.check_out_log_id)
    and attendance_daily_summaries.payroll_cycle_id is not null
    and attendance_logs.payroll_cycle_id is distinct from attendance_daily_summaries.payroll_cycle_id;$replacement$,
    'n'
  );

  if patched_definition = function_definition
     and position('attendance_logs.employee_id = target_employee_id' in function_definition) = 0 then
    raise exception 'Gagal memasang scoped payroll log refresh: anchor update attendance_logs tidak ditemukan.';
  end if;

  execute patched_definition;
end;
$$;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Scope payroll log refresh after Biofinger conversion',
    'payroll_cycles',
    '20260908000100',
    'success',
    '{"source":"migration","module":"biofinger","performance":"scoped-payroll-log-refresh"}'::jsonb
  );
