-- Overtime payable policy: overtime for payroll is the eligible extra work
-- after the employee has fulfilled the expected shift duration.

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
    notes = trim(both E'\n' from concat_ws(
      E'\n',
      nullif(requests.notes, ''),
      'Auto reset: tidak ada menit lembur payable setelah kewajiban shift dihitung ulang.'
    )),
    updated_at = now()
  where requests.employee_id = target_employee_id
    and requests.status in ('draft', 'pending')
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

create or replace function public.detect_all_overtime_requests()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_record record;
begin
  for employee_record in
    select id from public.employees where deleted_at is null and status <> 'inactive'
  loop
    perform public.detect_employee_overtime(employee_record.id);
  end loop;
end;
$$;

revoke all on function public.detect_employee_overtime(uuid) from public;
revoke all on function public.detect_all_overtime_requests() from public;
grant execute on function public.detect_employee_overtime(uuid) to authenticated;
grant execute on function public.detect_employee_overtime(uuid) to service_role;
grant execute on function public.detect_all_overtime_requests() to authenticated;
grant execute on function public.detect_all_overtime_requests() to service_role;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Update overtime payable policy', 'overtime_requests', '20260827000100', 'success', '{"source":"migration","module":"overtime-payroll","policy":"eligible-extra-work-after-shift-obligation"}'::jsonb);
