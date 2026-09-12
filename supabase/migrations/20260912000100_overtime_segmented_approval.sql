-- Pisahkan lembur sebelum shift dan setelah shift menjadi request approval independen.

alter table public.overtime_requests
add column if not exists overtime_segment text not null default 'total';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'overtime_requests_overtime_segment_check'
  ) then
    alter table public.overtime_requests
      add constraint overtime_requests_overtime_segment_check
      check (overtime_segment in ('total', 'pre_shift', 'post_shift', 'full_duration'));
  end if;
end;
$$;

update public.overtime_requests
set overtime_segment = case
  when overtime_basis = 'full_duration' then 'full_duration'
  when coalesce(pre_shift_minutes, 0) > 0 and coalesce(post_shift_minutes, 0) <= 0 then 'pre_shift'
  when coalesce(post_shift_minutes, 0) > 0 and coalesce(pre_shift_minutes, 0) <= 0 then 'post_shift'
  else coalesce(nullif(overtime_segment, ''), 'total')
end
where status in ('draft', 'pending')
  and coalesce(overtime_segment, 'total') = 'total';

do $$
declare
  constraint_name text;
begin
  select pg_constraint.conname
  into constraint_name
  from pg_constraint
  join pg_class on pg_class.oid = pg_constraint.conrelid
  join pg_namespace on pg_namespace.oid = pg_class.relnamespace
  where pg_namespace.nspname = 'public'
    and pg_class.relname = 'overtime_requests'
    and pg_constraint.contype = 'u'
    and (
      select array_agg(pg_attribute.attname order by key_order.ordinality)
      from unnest(pg_constraint.conkey) with ordinality as key_order(attnum, ordinality)
      join pg_attribute
        on pg_attribute.attrelid = pg_constraint.conrelid
       and pg_attribute.attnum = key_order.attnum
    ) = array['employee_id', 'overtime_date']
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.overtime_requests drop constraint %I', constraint_name);
  end if;
end;
$$;

create unique index if not exists idx_overtime_requests_employee_date_segment_unique
on public.overtime_requests(employee_id, overtime_date, overtime_segment);

create index if not exists idx_overtime_requests_segment_status
on public.overtime_requests(overtime_segment, status);

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
          greatest(0, floor(extract(epoch from (summaries.scheduled_start_at - summaries.actual_check_in_at)) / 60))::integer
        else 0
      end as pre_shift_minutes,
      case
        when summaries.scheduled_end_at is not null and summaries.actual_check_out_at is not null then
          greatest(0, floor(extract(epoch from (summaries.actual_check_out_at - summaries.scheduled_end_at)) / 60))::integer
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
  ),
  allocated as (
    select
      eligible.*,
      case
        when eligible.overtime_basis = 'full_duration' or eligible.outside_shift_minutes <= 0 then 0
        when eligible.payable_overtime_minutes >= eligible.outside_shift_minutes then eligible.pre_shift_minutes
        else least(
          eligible.pre_shift_minutes,
          greatest(0, round((eligible.payable_overtime_minutes::numeric * eligible.pre_shift_minutes::numeric) / eligible.outside_shift_minutes::numeric)::integer)
        )
      end as payable_pre_shift_minutes
    from eligible
  ),
  eligible_segments as (
    select
      allocated.employee_id,
      allocated.check_out_log_id,
      allocated.payroll_component_id,
      allocated.attendance_date,
      allocated.shift_start_time,
      allocated.shift_end_time,
      allocated.actual_check_in_at,
      allocated.actual_check_out_at,
      'full_duration'::text as overtime_segment,
      0::integer as pre_shift_minutes,
      0::integer as post_shift_minutes,
      allocated.payable_overtime_minutes::integer as overtime_minutes,
      allocated.rate_amount,
      allocated.detected_day_type,
      allocated.overtime_basis,
      allocated.expected_work_minutes,
      allocated.actual_work_minutes,
      allocated.outside_shift_minutes
    from allocated
    where allocated.overtime_basis = 'full_duration'
      and allocated.payable_overtime_minutes > 0

    union all

    select
      allocated.employee_id,
      allocated.check_out_log_id,
      allocated.payroll_component_id,
      allocated.attendance_date,
      allocated.shift_start_time,
      allocated.shift_end_time,
      allocated.actual_check_in_at,
      allocated.actual_check_out_at,
      'pre_shift'::text as overtime_segment,
      allocated.payable_pre_shift_minutes::integer as pre_shift_minutes,
      0::integer as post_shift_minutes,
      allocated.payable_pre_shift_minutes::integer as overtime_minutes,
      allocated.rate_amount,
      allocated.detected_day_type,
      allocated.overtime_basis,
      allocated.expected_work_minutes,
      allocated.actual_work_minutes,
      allocated.outside_shift_minutes
    from allocated
    where allocated.overtime_basis <> 'full_duration'
      and allocated.payable_pre_shift_minutes > 0

    union all

    select
      allocated.employee_id,
      allocated.check_out_log_id,
      allocated.payroll_component_id,
      allocated.attendance_date,
      allocated.shift_start_time,
      allocated.shift_end_time,
      allocated.actual_check_in_at,
      allocated.actual_check_out_at,
      'post_shift'::text as overtime_segment,
      0::integer as pre_shift_minutes,
      least(
        allocated.post_shift_minutes,
        greatest(0, allocated.payable_overtime_minutes - allocated.payable_pre_shift_minutes)
      )::integer as post_shift_minutes,
      least(
        allocated.post_shift_minutes,
        greatest(0, allocated.payable_overtime_minutes - allocated.payable_pre_shift_minutes)
      )::integer as overtime_minutes,
      allocated.rate_amount,
      allocated.detected_day_type,
      allocated.overtime_basis,
      allocated.expected_work_minutes,
      allocated.actual_work_minutes,
      allocated.outside_shift_minutes
    from allocated
    where allocated.overtime_basis <> 'full_duration'
      and least(allocated.post_shift_minutes, greatest(0, allocated.payable_overtime_minutes - allocated.payable_pre_shift_minutes)) > 0
  )
  delete from public.overtime_requests requests
  where requests.employee_id = target_employee_id
    and requests.status in ('draft', 'pending')
    and coalesce(requests.request_source, 'auto') <> 'planned'
    and coalesce(requests.overtime_payment_status, 'unpaid') <> 'paid'
    and not exists (
      select 1
      from eligible_segments
      where eligible_segments.employee_id = requests.employee_id
        and eligible_segments.attendance_date = requests.overtime_date
        and eligible_segments.overtime_segment = requests.overtime_segment
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
          greatest(0, floor(extract(epoch from (summaries.scheduled_start_at - summaries.actual_check_in_at)) / 60))::integer
        else 0
      end as pre_shift_minutes,
      case
        when summaries.scheduled_end_at is not null and summaries.actual_check_out_at is not null then
          greatest(0, floor(extract(epoch from (summaries.actual_check_out_at - summaries.scheduled_end_at)) / 60))::integer
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
  ),
  allocated as (
    select
      eligible.*,
      case
        when eligible.overtime_basis = 'full_duration' or eligible.outside_shift_minutes <= 0 then 0
        when eligible.payable_overtime_minutes >= eligible.outside_shift_minutes then eligible.pre_shift_minutes
        else least(
          eligible.pre_shift_minutes,
          greatest(0, round((eligible.payable_overtime_minutes::numeric * eligible.pre_shift_minutes::numeric) / eligible.outside_shift_minutes::numeric)::integer)
        )
      end as payable_pre_shift_minutes
    from eligible
  ),
  eligible_segments as (
    select
      allocated.employee_id,
      allocated.check_out_log_id,
      allocated.payroll_component_id,
      allocated.attendance_date,
      allocated.shift_start_time,
      allocated.shift_end_time,
      allocated.actual_check_in_at,
      allocated.actual_check_out_at,
      'full_duration'::text as overtime_segment,
      0::integer as pre_shift_minutes,
      0::integer as post_shift_minutes,
      allocated.payable_overtime_minutes::integer as overtime_minutes,
      allocated.rate_amount,
      allocated.detected_day_type,
      allocated.overtime_basis,
      allocated.expected_work_minutes,
      allocated.actual_work_minutes,
      allocated.outside_shift_minutes
    from allocated
    where allocated.overtime_basis = 'full_duration'
      and allocated.payable_overtime_minutes > 0

    union all

    select
      allocated.employee_id,
      allocated.check_out_log_id,
      allocated.payroll_component_id,
      allocated.attendance_date,
      allocated.shift_start_time,
      allocated.shift_end_time,
      allocated.actual_check_in_at,
      allocated.actual_check_out_at,
      'pre_shift'::text as overtime_segment,
      allocated.payable_pre_shift_minutes::integer as pre_shift_minutes,
      0::integer as post_shift_minutes,
      allocated.payable_pre_shift_minutes::integer as overtime_minutes,
      allocated.rate_amount,
      allocated.detected_day_type,
      allocated.overtime_basis,
      allocated.expected_work_minutes,
      allocated.actual_work_minutes,
      allocated.outside_shift_minutes
    from allocated
    where allocated.overtime_basis <> 'full_duration'
      and allocated.payable_pre_shift_minutes > 0

    union all

    select
      allocated.employee_id,
      allocated.check_out_log_id,
      allocated.payroll_component_id,
      allocated.attendance_date,
      allocated.shift_start_time,
      allocated.shift_end_time,
      allocated.actual_check_in_at,
      allocated.actual_check_out_at,
      'post_shift'::text as overtime_segment,
      0::integer as pre_shift_minutes,
      least(
        allocated.post_shift_minutes,
        greatest(0, allocated.payable_overtime_minutes - allocated.payable_pre_shift_minutes)
      )::integer as post_shift_minutes,
      least(
        allocated.post_shift_minutes,
        greatest(0, allocated.payable_overtime_minutes - allocated.payable_pre_shift_minutes)
      )::integer as overtime_minutes,
      allocated.rate_amount,
      allocated.detected_day_type,
      allocated.overtime_basis,
      allocated.expected_work_minutes,
      allocated.actual_work_minutes,
      allocated.outside_shift_minutes
    from allocated
    where allocated.overtime_basis <> 'full_duration'
      and least(allocated.post_shift_minutes, greatest(0, allocated.payable_overtime_minutes - allocated.payable_pre_shift_minutes)) > 0
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
    overtime_segment,
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
    eligible_segments.employee_id,
    eligible_segments.check_out_log_id,
    eligible_segments.payroll_component_id,
    eligible_segments.attendance_date,
    eligible_segments.shift_start_time,
    eligible_segments.shift_end_time,
    eligible_segments.actual_check_in_at,
    eligible_segments.actual_check_out_at,
    eligible_segments.overtime_segment,
    eligible_segments.pre_shift_minutes,
    eligible_segments.post_shift_minutes,
    eligible_segments.overtime_minutes,
    0,
    eligible_segments.rate_amount,
    0,
    eligible_segments.detected_day_type,
    eligible_segments.overtime_basis,
    'pending',
    'auto',
    true,
    format(
      'Auto-detected per segment. Segment %s. Basis %s. Wajib %s menit, aktual %s menit, total luar shift %s menit, lembur payable segment %s menit.',
      eligible_segments.overtime_segment,
      eligible_segments.overtime_basis,
      eligible_segments.expected_work_minutes,
      eligible_segments.actual_work_minutes,
      eligible_segments.outside_shift_minutes,
      eligible_segments.overtime_minutes
    )
  from eligible_segments
  on conflict (employee_id, overtime_date, overtime_segment) do update set
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

create or replace function public.request_overtime(
  target_employee_id uuid,
  target_overtime_date date,
  planned_start_time time,
  planned_end_time time,
  request_reason text,
  target_payment_policy text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_record record;
  employee_record record;
  component_record record;
  existing_record record;
  target_cycle_id uuid;
  target_cycle_status text;
  target_cycle_number integer;
  cleaned_reason text := nullif(trim(coalesce(request_reason, '')), '');
  normalized_payment_policy text := case when target_payment_policy = 'salary_cycle' then 'salary_cycle' else 'separate' end;
  detected_day_type text;
  planned_start_local timestamp;
  planned_end_local timestamp;
  planned_duration_minutes integer;
  result_id uuid;
begin
  if not (
    public.has_app_permission('overtime.review')
    or public.has_app_permission('payroll.process')
    or public.has_app_permission('attendance.review')
  ) then
    raise exception 'Role tidak punya akses membuat request lembur.';
  end if;

  if target_employee_id is null then
    raise exception 'Karyawan wajib dipilih.';
  end if;

  if target_overtime_date is null then
    raise exception 'Tanggal lembur wajib diisi.';
  end if;

  if planned_start_time is null or planned_end_time is null then
    raise exception 'Jam rencana lembur wajib lengkap.';
  end if;

  if cleaned_reason is null then
    raise exception 'Alasan lembur wajib diisi.';
  end if;

  select app_users.id, app_users.full_name
  into actor_record
  from public.app_users
  where app_users.auth_user_id = auth.uid()
    and app_users.status = 'active'
  limit 1;

  if actor_record.id is null then
    raise exception 'User aplikasi tidak aktif.';
  end if;

  select
    employees.id,
    employees.full_name,
    shifts.start_time as shift_start_time,
    shifts.end_time as shift_end_time
  into employee_record
  from public.employees
  left join public.shifts on shifts.id = employees.shift_id
  where employees.id = target_employee_id
    and employees.deleted_at is null
    and employees.status <> 'inactive'
  limit 1;

  if employee_record.id is null then
    raise exception 'Karyawan tidak ditemukan atau tidak aktif.';
  end if;

  select
    overtime_requests.id,
    overtime_requests.status,
    overtime_requests.overtime_payment_policy,
    overtime_requests.payroll_cycle_id,
    payroll_cycles.status as payroll_status
  into existing_record
  from public.overtime_requests
  left join public.payroll_cycles on payroll_cycles.id = overtime_requests.payroll_cycle_id
  where overtime_requests.employee_id = target_employee_id
    and overtime_requests.overtime_date = target_overtime_date
    and overtime_requests.overtime_segment = 'total'
  limit 1;

  if normalized_payment_policy = 'salary_cycle' then
    select
      payroll_cycles.id,
      payroll_cycles.status,
      payroll_cycles.cycle_number
    into target_cycle_id, target_cycle_status, target_cycle_number
    from public.payroll_cycles
    where payroll_cycles.employee_id = target_employee_id
      and target_overtime_date >= payroll_cycles.period_started_at
      and (
        payroll_cycles.period_closed_at is null
        or target_overtime_date <= payroll_cycles.period_closed_at
      )
    order by payroll_cycles.cycle_number desc, payroll_cycles.period_started_at desc
    limit 1;
  end if;

  if existing_record.status = 'approved' then
    raise exception 'Lembur tanggal ini sudah approved dan tidak bisa diganti lewat request baru.';
  end if;

  if normalized_payment_policy = 'salary_cycle'
     and coalesce(existing_record.payroll_status, target_cycle_status) in ('locked', 'paid', 'void') then
    raise exception 'Gaji 26 hari sudah final. Lembur ikut gaji tidak bisa diubah dari form request.';
  end if;

  planned_start_local := target_overtime_date::timestamp + planned_start_time;
  planned_end_local := target_overtime_date::timestamp + planned_end_time;

  if planned_end_time <= planned_start_time then
    planned_end_local := planned_end_local + interval '1 day';
  end if;

  planned_duration_minutes := greatest(0, floor(extract(epoch from (planned_end_local - planned_start_local)) / 60))::integer;

  if planned_duration_minutes <= 0 then
    raise exception 'Durasi rencana lembur tidak valid.';
  end if;

  detected_day_type := case
    when extract(isodow from target_overtime_date) = 7 then 'sunday'
    else 'weekday'
  end;

  select id, rate_amount, overtime_basis
  into component_record
  from public.payroll_components
  where component_type = 'earning'
    and calculation_unit = 'hour'
    and auto_detect_overtime = true
    and is_active = true
    and day_type in (detected_day_type, 'all')
  order by case when day_type = detected_day_type then 0 else 1 end, sort_order asc, code asc
  limit 1;

  if component_record.id is null then
    raise exception 'Komponen lembur aktif belum disiapkan di Master Data.';
  end if;

  insert into public.overtime_requests (
    employee_id,
    payroll_component_id,
    payroll_cycle_id,
    overtime_date,
    overtime_segment,
    shift_start_time,
    shift_end_time,
    overtime_minutes,
    approved_minutes,
    rate_amount,
    total_amount,
    day_type,
    overtime_basis,
    status,
    request_source,
    overtime_payment_policy,
    planned_start_at,
    planned_end_at,
    planned_minutes,
    request_reason,
    requested_by,
    requested_at,
    matched_attendance,
    notes
  )
  values (
    target_employee_id,
    component_record.id,
    case when normalized_payment_policy = 'salary_cycle' then target_cycle_id else null end,
    target_overtime_date,
    'total',
    employee_record.shift_start_time,
    employee_record.shift_end_time,
    0,
    0,
    component_record.rate_amount,
    0,
    detected_day_type,
    component_record.overtime_basis,
    'draft',
    'planned',
    normalized_payment_policy,
    planned_start_local at time zone 'Asia/Jakarta',
    planned_end_local at time zone 'Asia/Jakarta',
    planned_duration_minutes,
    cleaned_reason,
    actor_record.id,
    now(),
    false,
    format('Request lembur oleh %s. Rencana %s - %s (%s menit). Pembayaran: %s. Alasan: %s', actor_record.full_name, planned_start_time, planned_end_time, planned_duration_minutes, normalized_payment_policy, cleaned_reason)
  )
  on conflict (employee_id, overtime_date, overtime_segment) do update set
    payroll_component_id = excluded.payroll_component_id,
    payroll_cycle_id = case
      when excluded.overtime_payment_policy = 'salary_cycle' then excluded.payroll_cycle_id
      else public.overtime_requests.payroll_cycle_id
    end,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    rate_amount = excluded.rate_amount,
    day_type = excluded.day_type,
    overtime_basis = excluded.overtime_basis,
    request_source = 'planned',
    overtime_payment_policy = excluded.overtime_payment_policy,
    planned_start_at = excluded.planned_start_at,
    planned_end_at = excluded.planned_end_at,
    planned_minutes = excluded.planned_minutes,
    request_reason = excluded.request_reason,
    requested_by = excluded.requested_by,
    requested_at = excluded.requested_at,
    status = case
      when public.overtime_requests.actual_check_out_at is not null and public.overtime_requests.overtime_minutes > 0 then 'pending'
      else 'draft'
    end,
    notes = trim(both E'\n' from concat_ws(E'\n', nullif(public.overtime_requests.notes, ''), excluded.notes)),
    updated_at = now()
  returning id into result_id;

  insert into public.audit_logs (actor_user_id, actor_name, action, target_table, target_id, status, metadata)
  values (
    actor_record.id,
    actor_record.full_name,
    case when existing_record.id is null then 'Request overtime' else 'Update overtime request' end,
    'overtime_requests',
    result_id::text,
    'success',
    jsonb_build_object(
      'employee_id', target_employee_id,
      'overtime_date', target_overtime_date,
      'overtime_segment', 'total',
      'planned_minutes', planned_duration_minutes,
      'overtime_basis', component_record.overtime_basis,
      'overtime_payment_policy', normalized_payment_policy,
      'previous_status', existing_record.status,
      'payroll_cycle_id', coalesce(target_cycle_id, existing_record.payroll_cycle_id),
      'payroll_cycle_number', target_cycle_number,
      'payroll_status', coalesce(existing_record.payroll_status, target_cycle_status),
      'source', 'rpc'
    )
  );

  perform public.refresh_employee_payroll_cycles(target_employee_id);

  return result_id;
end;
$$;

create or replace function public.request_overtime(
  target_employee_id uuid,
  target_overtime_date date,
  planned_start_time time,
  planned_end_time time,
  request_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.request_overtime(
    target_employee_id,
    target_overtime_date,
    planned_start_time,
    planned_end_time,
    request_reason,
    'separate'
  );
end;
$$;

revoke all on function public.request_overtime(uuid, date, time, time, text) from public;
grant execute on function public.request_overtime(uuid, date, time, time, text) to authenticated;
grant execute on function public.request_overtime(uuid, date, time, time, text) to service_role;

revoke all on function public.request_overtime(uuid, date, time, time, text, text) from public;
grant execute on function public.request_overtime(uuid, date, time, time, text, text) to authenticated;
grant execute on function public.request_overtime(uuid, date, time, time, text, text) to service_role;

revoke all on function public.detect_employee_overtime(uuid) from public;
grant execute on function public.detect_employee_overtime(uuid) to authenticated;
grant execute on function public.detect_employee_overtime(uuid) to service_role;

select public.detect_all_overtime_requests();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Enable segmented overtime approval', 'overtime_requests', '20260912000100', 'success', '{"source":"migration","module":"overtime-payroll","policy":"pre-post-independent-approval"}'::jsonb);

notify pgrst, 'reload schema';
