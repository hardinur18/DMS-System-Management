create or replace function public.refresh_weekly_shift_bonus_cycles(
  target_start_date date default null,
  target_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  start_date date := coalesce(target_start_date, current_date - 35);
  end_date date := coalesce(target_end_date, current_date);
  refreshed_count integer := 0;
  reset_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not (
      public.has_app_permission('payroll.view')
      or public.has_app_permission('payroll.process')
      or public.has_app_permission('attendance.view')
    )
  then
    raise exception 'Tidak punya akses refresh bonus shift.';
  end if;
  drop table if exists pg_temp.selected_weekly_bonus_cycles;

  create temporary table selected_weekly_bonus_cycles on commit drop as
  with eligible_rows as (
    select
      policy.id as policy_id,
      policy.code as policy_code,
      policy.name as policy_name,
      policy.target_days,
      policy.full_amount,
      policy.week_start_dow,
      policy.payment_day_dow,
      summary.employee_id,
      min(coalesce(employee.employee_code, '')) as employee_code,
      min(coalesce(employee.full_name, 'Karyawan')) as employee_name,
      min(coalesce(division.name, '')) as division_name,
      (
        summary.attendance_date
        - (((extract(dow from summary.attendance_date)::integer - policy.week_start_dow + 7) % 7) * interval '1 day')
      )::date as period_started_at,
      count(*)::integer as eligible_days
    from public.attendance_daily_summaries summary
    join public.employees employee on employee.id = summary.employee_id
    join public.weekly_bonus_policy_shifts policy_shift on policy_shift.shift_id = summary.shift_id and policy_shift.is_active = true
    join public.weekly_bonus_policies policy on policy.id = policy_shift.policy_id and policy.is_active = true and policy.status = 'active'
    left join public.divisions division on division.id = employee.division_id
    where summary.attendance_date between start_date and end_date
      and employee.deleted_at is null
      and coalesce(employee.status, 'active') = 'active'
      and summary.actual_check_in_at is not null
      and coalesce(summary.attendance_status, 'valid') <> 'failed'
      and coalesce(summary.settlement_status, '') not in ('alpha', 'off_day', 'failed', 'missing_checkin')
      and coalesce(summary.workday_counted, true) = true
    group by
      policy.id,
      policy.code,
      policy.name,
      policy.target_days,
      policy.full_amount,
      policy.week_start_dow,
      policy.payment_day_dow,
      summary.employee_id,
      (
        summary.attendance_date
        - (((extract(dow from summary.attendance_date)::integer - policy.week_start_dow + 7) % 7) * interval '1 day')
      )::date
  )
  select
    policy_id,
    policy_code,
    policy_name,
    employee_id,
    employee_code,
    employee_name,
    division_name,
    period_started_at,
    (period_started_at + interval '6 days')::date as period_closed_at,
    (
      period_started_at
      + (((payment_day_dow - week_start_dow + 7) % 7) * interval '1 day')
    )::date as payment_due_date,
    eligible_days,
    target_days,
    full_amount,
    round((full_amount / greatest(target_days, 1)) * least(eligible_days, target_days), 2) as bonus_amount
  from eligible_rows;

  insert into public.weekly_shift_bonus_cycles (
    policy_id,
    policy_code,
    policy_name,
    employee_id,
    employee_code,
    employee_name,
    division_name,
    period_started_at,
    period_closed_at,
    payment_due_date,
    eligible_days,
    target_days,
    full_amount,
    bonus_amount,
    status,
    calculated_at,
    updated_at
  )
  select
    policy_id,
    policy_code,
    policy_name,
    employee_id,
    employee_code,
    employee_name,
    division_name,
    period_started_at,
    period_closed_at,
    payment_due_date,
    eligible_days,
    target_days,
    full_amount,
    bonus_amount,
    case when eligible_days > 0 and bonus_amount > 0 then 'ready' else 'draft' end,
    now(),
    now()
  from selected_weekly_bonus_cycles
  on conflict (policy_id, employee_id, period_started_at) do update set
    policy_code = excluded.policy_code,
    policy_name = excluded.policy_name,
    employee_code = excluded.employee_code,
    employee_name = excluded.employee_name,
    division_name = excluded.division_name,
    period_closed_at = excluded.period_closed_at,
    payment_due_date = excluded.payment_due_date,
    eligible_days = excluded.eligible_days,
    target_days = excluded.target_days,
    full_amount = excluded.full_amount,
    bonus_amount = excluded.bonus_amount,
    status = case
      when public.weekly_shift_bonus_cycles.status = 'paid' or public.weekly_shift_bonus_cycles.payment_id is not null then public.weekly_shift_bonus_cycles.status
      when excluded.eligible_days > 0 and excluded.bonus_amount > 0 then 'ready'
      else 'draft'
    end,
    calculated_at = now(),
    updated_at = now();

  get diagnostics refreshed_count = row_count;

  update public.weekly_shift_bonus_cycles cycle
  set
    eligible_days = 0,
    bonus_amount = 0,
    status = 'draft',
    calculated_at = now(),
    updated_at = now()
  where cycle.period_started_at <= end_date
    and cycle.period_closed_at >= start_date
    and cycle.status <> 'paid'
    and cycle.payment_id is null
    and not exists (
      select 1
      from selected_weekly_bonus_cycles selected
      where selected.policy_id = cycle.policy_id
        and selected.employee_id = cycle.employee_id
        and selected.period_started_at = cycle.period_started_at
    );

  get diagnostics reset_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'refreshed', refreshed_count,
    'reset', reset_count,
    'start_date', start_date,
    'end_date', end_date
  );
end;
$$;

create or replace function public.mark_weekly_shift_bonus_paid(
  target_bonus_cycle_ids uuid[],
  actor_user_id uuid,
  actor_name text,
  target_payment_method text default 'bank_transfer',
  target_payment_reference text default null,
  target_paid_at timestamptz default now(),
  target_paid_amount numeric default null,
  note_text text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_count integer := 0;
  employee_count integer := 0;
  payment_row public.weekly_shift_bonus_payments%rowtype;
  first_employee_id uuid;
  first_employee_code text;
  first_employee_name text;
  first_period_start date;
  last_period_close date;
  total_eligible integer := 0;
  target_day_total integer := 0;
  total_bonus numeric := 0;
  final_paid_amount numeric := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Pembayaran bonus shift hanya boleh diproses service role.';
  end if;

  if target_bonus_cycle_ids is null or cardinality(target_bonus_cycle_ids) = 0 then
    raise exception 'Minimal satu bonus shift wajib dipilih.';
  end if;
  drop table if exists pg_temp.selected_bonus_cycles;

  create temporary table selected_bonus_cycles on commit drop as
  select *
  from public.weekly_shift_bonus_cycles
  where id = any(target_bonus_cycle_ids)
  for update;

  select count(*) into selected_count from selected_bonus_cycles;
  if selected_count <> cardinality(target_bonus_cycle_ids) then
    raise exception 'Sebagian bonus shift tidak ditemukan.';
  end if;

  select count(distinct employee_id) into employee_count from selected_bonus_cycles;
  if employee_count <> 1 then
    raise exception 'Pembayaran bonus hanya bisa untuk satu karyawan per transaksi.';
  end if;

  if exists (
    select 1 from selected_bonus_cycles
    where status <> 'ready'
      or payment_id is not null
      or eligible_days <= 0
      or bonus_amount <= 0
  ) then
    raise exception 'Bonus shift belum siap dibayar atau sudah punya transaksi.';
  end if;

  select
    employee_id,
    employee_code,
    employee_name
  into
    first_employee_id,
    first_employee_code,
    first_employee_name
  from selected_bonus_cycles
  order by period_started_at, id
  limit 1;

  select
    min(period_started_at),
    max(period_closed_at),
    sum(eligible_days)::integer,
    sum(target_days)::integer,
    sum(bonus_amount)
  into
    first_period_start,
    last_period_close,
    total_eligible,
    target_day_total,
    total_bonus
  from selected_bonus_cycles;

  final_paid_amount := coalesce(target_paid_amount, total_bonus);
  if final_paid_amount <= 0 then
    raise exception 'Nominal pembayaran bonus wajib lebih dari 0.';
  end if;

  insert into public.weekly_shift_bonus_payments (
    payment_no,
    employee_id,
    employee_code,
    employee_name,
    period_started_at,
    period_closed_at,
    cycle_count,
    eligible_days,
    target_days,
    bonus_amount,
    paid_amount,
    payment_method,
    payment_reference,
    paid_at,
    paid_by,
    paid_by_name,
    status,
    notes
  )
  values (
    'BNS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    first_employee_id,
    first_employee_code,
    first_employee_name,
    first_period_start,
    last_period_close,
    selected_count,
    total_eligible,
    target_day_total,
    total_bonus,
    final_paid_amount,
    coalesce(nullif(target_payment_method, ''), 'bank_transfer'),
    coalesce(target_payment_reference, ''),
    coalesce(target_paid_at, now()),
    actor_user_id,
    coalesce(actor_name, 'Finance'),
    'paid',
    coalesce(note_text, '')
  )
  returning * into payment_row;

  insert into public.weekly_shift_bonus_payment_items (
    payment_id,
    bonus_cycle_id,
    employee_id,
    period_started_at,
    period_closed_at,
    eligible_days,
    target_days,
    bonus_amount
  )
  select
    payment_row.id,
    id,
    employee_id,
    period_started_at,
    period_closed_at,
    eligible_days,
    target_days,
    bonus_amount
  from selected_bonus_cycles;

  update public.weekly_shift_bonus_cycles cycle
  set
    status = 'paid',
    payment_id = payment_row.id,
    paid_at = payment_row.paid_at,
    paid_by = actor_user_id,
    paid_by_name = coalesce(actor_name, 'Finance'),
    payment_note = coalesce(note_text, ''),
    updated_at = now()
  where cycle.id = any(target_bonus_cycle_ids);

  insert into public.audit_logs (
    actor_user_id,
    actor_name,
    action,
    target_table,
    target_id,
    status,
    metadata
  )
  values (
    actor_user_id,
    actor_name,
    'Bayar bonus shift mingguan',
    'weekly_shift_bonus_payments',
    payment_row.id,
    'success',
    jsonb_build_object(
      'employee_id', first_employee_id,
      'employee_code', first_employee_code,
      'employee_name', first_employee_name,
      'cycle_count', selected_count,
      'eligible_days', total_eligible,
      'target_days', target_day_total,
      'bonus_amount', total_bonus,
      'paid_amount', final_paid_amount,
      'source', 'edge-function'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', payment_row.id,
    'payment_no', payment_row.payment_no,
    'paid_amount', payment_row.paid_amount
  );
end;
$$;

grant execute on function public.refresh_weekly_shift_bonus_cycles(date, date) to authenticated, service_role;
grant execute on function public.mark_weekly_shift_bonus_paid(uuid[], uuid, text, text, text, timestamptz, numeric, text) to service_role;
