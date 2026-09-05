-- Deteksi lembur di luar jam shift: sebelum shift dimulai dan setelah shift selesai.

alter table public.overtime_requests
add column if not exists actual_check_in_at timestamptz,
add column if not exists pre_shift_minutes integer not null default 0,
add column if not exists post_shift_minutes integer not null default 0;

update public.overtime_requests
set
  pre_shift_minutes = coalesce(pre_shift_minutes, 0),
  post_shift_minutes = coalesce(post_shift_minutes, 0)
where pre_shift_minutes is null
   or post_shift_minutes is null;

alter table public.overtime_requests
alter column pre_shift_minutes set default 0,
alter column pre_shift_minutes set not null,
alter column post_shift_minutes set default 0,
alter column post_shift_minutes set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'overtime_requests_pre_shift_minutes_check'
  ) then
    alter table public.overtime_requests
      add constraint overtime_requests_pre_shift_minutes_check
      check (pre_shift_minutes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'overtime_requests_post_shift_minutes_check'
  ) then
    alter table public.overtime_requests
      add constraint overtime_requests_post_shift_minutes_check
      check (post_shift_minutes >= 0);
  end if;
end;
$$;

create index if not exists idx_overtime_requests_pre_shift
on public.overtime_requests(pre_shift_minutes)
where pre_shift_minutes > 0;

create index if not exists idx_overtime_requests_post_shift
on public.overtime_requests(post_shift_minutes)
where post_shift_minutes > 0;

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
      summaries.actual_check_in_at,
      summaries.actual_check_out_at,
      coalesce(summaries.expected_work_minutes, 0) as expected_work_minutes,
      coalesce(summaries.actual_work_minutes, 0) as actual_work_minutes,
      case
        when summaries.scheduled_start_at is not null and summaries.actual_check_in_at is not null then
          greatest(
            0,
            floor(extract(epoch from (summaries.scheduled_start_at - summaries.actual_check_in_at)) / 60)
          )::integer
        else 0
      end as pre_shift_minutes,
      case
        when summaries.scheduled_end_at is not null and summaries.actual_check_out_at is not null then
          greatest(
            0,
            floor(extract(epoch from (summaries.actual_check_out_at - summaries.scheduled_end_at)) / 60)
          )::integer
        else coalesce(summaries.overtime_minutes, 0)
      end as post_shift_minutes,
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
  eligible_candidates as (
    select
      summary_candidates.*,
      (summary_candidates.pre_shift_minutes + summary_candidates.post_shift_minutes)::integer as outside_shift_minutes,
      case
        when payroll_components.overtime_basis = 'full_duration' then summary_candidates.actual_work_minutes
        else least(
          summary_candidates.pre_shift_minutes + summary_candidates.post_shift_minutes,
          summary_candidates.extra_work_minutes
        )
      end::integer as payable_overtime_minutes,
      payroll_components.id as payroll_component_id,
      payroll_components.rate_amount,
      payroll_components.overtime_basis
    from summary_candidates
    join lateral (
      select id, rate_amount, overtime_basis
      from public.payroll_components
      where component_type = 'earning'
        and calculation_unit = 'hour'
        and auto_detect_overtime = true
        and is_active = true
        and day_type in (summary_candidates.detected_day_type, 'all')
      order by case when day_type = summary_candidates.detected_day_type then 0 else 1 end, sort_order asc, code asc
      limit 1
    ) as payroll_components on true
  ),
  eligible as (
    select *
    from eligible_candidates
    where payable_overtime_minutes > 0
  )
  update public.overtime_requests requests
  set
    status = 'draft',
    actual_check_in_at = null,
    actual_check_out_at = null,
    pre_shift_minutes = 0,
    post_shift_minutes = 0,
    overtime_minutes = 0,
    approved_minutes = 0,
    total_amount = 0,
    matched_attendance = requests.actual_check_out_at is not null,
    notes = trim(both E'\n' from concat_ws(
      E'\n',
      nullif(requests.notes, ''),
      'Auto reset: tidak ada menit lembur payable setelah policy lembur di luar shift dihitung ulang.'
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
      summaries.actual_check_in_at,
      summaries.actual_check_out_at,
      coalesce(summaries.expected_work_minutes, 0) as expected_work_minutes,
      coalesce(summaries.actual_work_minutes, 0) as actual_work_minutes,
      case
        when summaries.scheduled_start_at is not null and summaries.actual_check_in_at is not null then
          greatest(
            0,
            floor(extract(epoch from (summaries.scheduled_start_at - summaries.actual_check_in_at)) / 60)
          )::integer
        else 0
      end as pre_shift_minutes,
      case
        when summaries.scheduled_end_at is not null and summaries.actual_check_out_at is not null then
          greatest(
            0,
            floor(extract(epoch from (summaries.actual_check_out_at - summaries.scheduled_end_at)) / 60)
          )::integer
        else coalesce(summaries.overtime_minutes, 0)
      end as post_shift_minutes,
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
  eligible_candidates as (
    select
      summary_candidates.*,
      (summary_candidates.pre_shift_minutes + summary_candidates.post_shift_minutes)::integer as outside_shift_minutes,
      case
        when payroll_components.overtime_basis = 'full_duration' then summary_candidates.actual_work_minutes
        else least(
          summary_candidates.pre_shift_minutes + summary_candidates.post_shift_minutes,
          summary_candidates.extra_work_minutes
        )
      end::integer as payable_overtime_minutes,
      payroll_components.id as payroll_component_id,
      payroll_components.rate_amount,
      payroll_components.overtime_basis
    from summary_candidates
    join lateral (
      select id, rate_amount, overtime_basis
      from public.payroll_components
      where component_type = 'earning'
        and calculation_unit = 'hour'
        and auto_detect_overtime = true
        and is_active = true
        and day_type in (summary_candidates.detected_day_type, 'all')
      order by case when day_type = summary_candidates.detected_day_type then 0 else 1 end, sort_order asc, code asc
      limit 1
    ) as payroll_components on true
  ),
  eligible as (
    select *
    from eligible_candidates
    where payable_overtime_minutes > 0
  )
  insert into public.overtime_requests (
    employee_id,
    attendance_log_id,
    payroll_component_id,
    overtime_date,
    shift_start_time,
    shift_end_time,
    actual_check_in_at,
    actual_check_out_at,
    pre_shift_minutes,
    post_shift_minutes,
    overtime_minutes,
    approved_minutes,
    rate_amount,
    total_amount,
    day_type,
    overtime_basis,
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
    eligible.actual_check_in_at,
    eligible.actual_check_out_at,
    eligible.pre_shift_minutes,
    eligible.post_shift_minutes,
    eligible.payable_overtime_minutes,
    0,
    eligible.rate_amount,
    0,
    eligible.detected_day_type,
    eligible.overtime_basis,
    'pending',
    'auto',
    true,
    format(
      'Auto-detected dari settlement harian. Basis %s. Wajib %s menit, aktual %s menit, sebelum shift %s menit, setelah shift %s menit, total luar shift %s menit, lembur payable %s menit.',
      eligible.overtime_basis,
      eligible.expected_work_minutes,
      eligible.actual_work_minutes,
      eligible.pre_shift_minutes,
      eligible.post_shift_minutes,
      eligible.outside_shift_minutes,
      eligible.payable_overtime_minutes
    )
  from eligible
  on conflict (employee_id, overtime_date) do update set
    attendance_log_id = excluded.attendance_log_id,
    payroll_component_id = excluded.payroll_component_id,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    actual_check_in_at = excluded.actual_check_in_at,
    actual_check_out_at = excluded.actual_check_out_at,
    pre_shift_minutes = excluded.pre_shift_minutes,
    post_shift_minutes = excluded.post_shift_minutes,
    overtime_minutes = excluded.overtime_minutes,
    rate_amount = excluded.rate_amount,
    day_type = excluded.day_type,
    overtime_basis = excluded.overtime_basis,
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

revoke all on function public.detect_employee_overtime(uuid) from public;
grant execute on function public.detect_employee_overtime(uuid) to authenticated;
grant execute on function public.detect_employee_overtime(uuid) to service_role;

select public.detect_all_overtime_requests();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Update overtime outside shift detection', 'overtime_requests', '20260905000200', 'success', '{"source":"migration","module":"overtime-payroll","policy":"pre-and-post-shift-overtime"}'::jsonb);

notify pgrst, 'reload schema';
