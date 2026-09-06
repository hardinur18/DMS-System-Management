create table if not exists public.weekly_bonus_policies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  target_days integer not null default 6 check (target_days > 0),
  full_amount numeric(14,2) not null default 0 check (full_amount >= 0),
  week_start_dow integer not null default 1 check (week_start_dow between 0 and 6),
  payment_day_dow integer not null default 6 check (payment_day_dow between 0 and 6),
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_bonus_policy_shifts (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.weekly_bonus_policies(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_id, shift_id)
);

create table if not exists public.weekly_shift_bonus_payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  employee_id uuid not null references public.employees(id),
  employee_code text not null default '',
  employee_name text not null default '',
  period_started_at date not null,
  period_closed_at date not null,
  cycle_count integer not null default 1 check (cycle_count > 0),
  eligible_days integer not null default 0 check (eligible_days >= 0),
  target_days integer not null default 6 check (target_days > 0),
  bonus_amount numeric(14,2) not null default 0 check (bonus_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  payment_method text not null default 'bank_transfer' check (payment_method in ('cash', 'bank_transfer', 'ewallet', 'other')),
  payment_reference text not null default '',
  paid_at timestamptz not null default now(),
  paid_by uuid references public.app_users(id),
  paid_by_name text not null default '',
  status text not null default 'paid' check (status in ('paid', 'void', 'reversed')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_shift_bonus_cycles (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.weekly_bonus_policies(id),
  policy_code text not null default '',
  policy_name text not null default '',
  employee_id uuid not null references public.employees(id),
  employee_code text not null default '',
  employee_name text not null default '',
  division_name text not null default '',
  period_started_at date not null,
  period_closed_at date not null,
  payment_due_date date not null,
  eligible_days integer not null default 0 check (eligible_days >= 0),
  target_days integer not null default 6 check (target_days > 0),
  full_amount numeric(14,2) not null default 0 check (full_amount >= 0),
  bonus_amount numeric(14,2) not null default 0 check (bonus_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'ready', 'paid', 'void')),
  payment_id uuid references public.weekly_shift_bonus_payments(id),
  paid_at timestamptz,
  paid_by uuid references public.app_users(id),
  paid_by_name text not null default '',
  payment_note text not null default '',
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_id, employee_id, period_started_at)
);

create table if not exists public.weekly_shift_bonus_payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.weekly_shift_bonus_payments(id) on delete cascade,
  bonus_cycle_id uuid not null references public.weekly_shift_bonus_cycles(id),
  employee_id uuid not null references public.employees(id),
  period_started_at date not null,
  period_closed_at date not null,
  eligible_days integer not null default 0,
  target_days integer not null default 6,
  bonus_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (payment_id, bonus_cycle_id)
);

create index if not exists weekly_bonus_policy_shifts_shift_idx on public.weekly_bonus_policy_shifts(shift_id) where is_active = true;
create index if not exists weekly_shift_bonus_cycles_status_idx on public.weekly_shift_bonus_cycles(status, payment_due_date desc);
create index if not exists weekly_shift_bonus_cycles_employee_idx on public.weekly_shift_bonus_cycles(employee_id, period_started_at desc);
create index if not exists weekly_shift_bonus_payments_employee_idx on public.weekly_shift_bonus_payments(employee_id, paid_at desc);
create index if not exists weekly_shift_bonus_payment_items_cycle_idx on public.weekly_shift_bonus_payment_items(bonus_cycle_id);

drop trigger if exists set_weekly_bonus_policies_updated_at on public.weekly_bonus_policies;
create trigger set_weekly_bonus_policies_updated_at
before update on public.weekly_bonus_policies
for each row execute function public.set_updated_at();

drop trigger if exists set_weekly_bonus_policy_shifts_updated_at on public.weekly_bonus_policy_shifts;
create trigger set_weekly_bonus_policy_shifts_updated_at
before update on public.weekly_bonus_policy_shifts
for each row execute function public.set_updated_at();

drop trigger if exists set_weekly_shift_bonus_cycles_updated_at on public.weekly_shift_bonus_cycles;
create trigger set_weekly_shift_bonus_cycles_updated_at
before update on public.weekly_shift_bonus_cycles
for each row execute function public.set_updated_at();

drop trigger if exists set_weekly_shift_bonus_payments_updated_at on public.weekly_shift_bonus_payments;
create trigger set_weekly_shift_bonus_payments_updated_at
before update on public.weekly_shift_bonus_payments
for each row execute function public.set_updated_at();

alter table public.weekly_bonus_policies enable row level security;
alter table public.weekly_bonus_policy_shifts enable row level security;
alter table public.weekly_shift_bonus_cycles enable row level security;
alter table public.weekly_shift_bonus_payments enable row level security;
alter table public.weekly_shift_bonus_payment_items enable row level security;

drop policy if exists weekly_bonus_policies_select on public.weekly_bonus_policies;
create policy weekly_bonus_policies_select on public.weekly_bonus_policies
for select to authenticated
using (
  public.has_app_permission('payroll.view')
  or public.has_app_permission('payroll.process')
  or public.has_app_permission('attendance.view')
);

drop policy if exists weekly_bonus_policies_manage on public.weekly_bonus_policies;
create policy weekly_bonus_policies_manage on public.weekly_bonus_policies
for all to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

drop policy if exists weekly_bonus_policy_shifts_select on public.weekly_bonus_policy_shifts;
create policy weekly_bonus_policy_shifts_select on public.weekly_bonus_policy_shifts
for select to authenticated
using (
  public.has_app_permission('payroll.view')
  or public.has_app_permission('payroll.process')
  or public.has_app_permission('attendance.view')
);

drop policy if exists weekly_bonus_policy_shifts_manage on public.weekly_bonus_policy_shifts;
create policy weekly_bonus_policy_shifts_manage on public.weekly_bonus_policy_shifts
for all to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

drop policy if exists weekly_shift_bonus_cycles_select on public.weekly_shift_bonus_cycles;
create policy weekly_shift_bonus_cycles_select on public.weekly_shift_bonus_cycles
for select to authenticated
using (
  public.has_app_permission('payroll.view')
  or public.has_app_permission('payroll.process')
  or public.has_app_permission('attendance.view')
);

drop policy if exists weekly_shift_bonus_cycles_manage on public.weekly_shift_bonus_cycles;
create policy weekly_shift_bonus_cycles_manage on public.weekly_shift_bonus_cycles
for all to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

drop policy if exists weekly_shift_bonus_payments_select on public.weekly_shift_bonus_payments;
create policy weekly_shift_bonus_payments_select on public.weekly_shift_bonus_payments
for select to authenticated
using (public.has_app_permission('payroll.view') or public.has_app_permission('payroll.process'));

drop policy if exists weekly_shift_bonus_payments_manage on public.weekly_shift_bonus_payments;
create policy weekly_shift_bonus_payments_manage on public.weekly_shift_bonus_payments
for all to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

drop policy if exists weekly_shift_bonus_payment_items_select on public.weekly_shift_bonus_payment_items;
create policy weekly_shift_bonus_payment_items_select on public.weekly_shift_bonus_payment_items
for select to authenticated
using (public.has_app_permission('payroll.view') or public.has_app_permission('payroll.process'));

drop policy if exists weekly_shift_bonus_payment_items_manage on public.weekly_shift_bonus_payment_items;
create policy weekly_shift_bonus_payment_items_manage on public.weekly_shift_bonus_payment_items
for all to authenticated
using (public.has_app_permission('payroll.process'))
with check (public.has_app_permission('payroll.process'));

insert into public.weekly_bonus_policies (code, name, description, target_days, full_amount, week_start_dow, payment_day_dow, status, is_active)
values (
  'SHIFT-MESIN-WEEKLY',
  'Bonus Shift Mesin Mingguan',
  'Bonus untuk shift mesin tertentu. Dibayar terpisah dari gaji dan lembur.',
  6,
  50000,
  1,
  6,
  'active',
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  target_days = excluded.target_days,
  full_amount = excluded.full_amount,
  week_start_dow = excluded.week_start_dow,
  payment_day_dow = excluded.payment_day_dow,
  status = excluded.status,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.weekly_bonus_policy_shifts (policy_id, shift_id, is_active)
select policy.id, shift_row.id, true
from public.weekly_bonus_policies policy
join public.shifts shift_row on (
  coalesce(shift_row.is_active, true)
  and (
    lower(coalesce(shift_row.name, '')) like '%siang%'
    or lower(coalesce(shift_row.code, '')) like '%siang%'
    or lower(coalesce(shift_row.name, '')) like '%malam%'
    or lower(coalesce(shift_row.code, '')) like '%malam%'
  )
  and (
    lower(coalesce(shift_row.name, '')) like '%mesin%'
    or lower(coalesce(shift_row.code, '')) like '%mesin%'
  )
)
where policy.code = 'SHIFT-MESIN-WEEKLY'
on conflict (policy_id, shift_id) do update set
  is_active = true,
  updated_at = now();

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

create or replace function public.void_weekly_bonus_payment(
  target_payment_id uuid,
  actor_user_id uuid,
  actor_name text,
  note_text text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.weekly_shift_bonus_payments%rowtype;
  restored_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Pembatalan bonus shift hanya boleh diproses service role.';
  end if;

  select *
  into payment_row
  from public.weekly_shift_bonus_payments
  where id = target_payment_id
  for update;

  if payment_row.id is null then
    raise exception 'Pembayaran bonus tidak ditemukan.';
  end if;

  if payment_row.status <> 'paid' then
    raise exception 'Hanya pembayaran bonus aktif yang bisa dibatalkan.';
  end if;

  update public.weekly_shift_bonus_payments
  set
    status = 'void',
    notes = trim(both from concat_ws(E'\n', nullif(notes, ''), nullif(note_text, ''))),
    updated_at = now()
  where id = payment_row.id;

  update public.weekly_shift_bonus_cycles
  set
    status = 'ready',
    payment_id = null,
    paid_at = null,
    paid_by = null,
    paid_by_name = '',
    payment_note = '',
    updated_at = now()
  where payment_id = payment_row.id;

  get diagnostics restored_count = row_count;

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
    'Batalkan pembayaran bonus shift',
    'weekly_shift_bonus_payments',
    payment_row.id,
    'success',
    jsonb_build_object(
      'employee_id', payment_row.employee_id,
      'employee_code', payment_row.employee_code,
      'employee_name', payment_row.employee_name,
      'restored_cycles', restored_count,
      'paid_amount', payment_row.paid_amount,
      'source', 'edge-function'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', payment_row.id,
    'restored_cycles', restored_count
  );
end;
$$;

grant execute on function public.refresh_weekly_shift_bonus_cycles(date, date) to authenticated, service_role;
grant execute on function public.mark_weekly_shift_bonus_paid(uuid[], uuid, text, text, text, timestamptz, numeric, text) to service_role;
grant execute on function public.void_weekly_bonus_payment(uuid, uuid, text, text) to service_role;
