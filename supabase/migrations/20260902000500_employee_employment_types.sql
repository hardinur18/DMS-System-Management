create table if not exists public.employee_employment_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  payroll_eligible_default boolean not null default true,
  default_pay_policy text not null default 'salary',
  allowance_amount numeric(14,2) not null default 0,
  requires_attendance boolean not null default true,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_employment_types_default_pay_policy_check
    check (default_pay_policy in ('salary', 'allowance', 'unpaid', 'not_counted')),
  constraint employee_employment_types_allowance_amount_check
    check (allowance_amount >= 0)
);

drop trigger if exists trg_employee_employment_types_updated_at on public.employee_employment_types;
create trigger trg_employee_employment_types_updated_at
before update on public.employee_employment_types
for each row execute function public.set_updated_at();

alter table public.employees
  add column if not exists employment_type_id uuid references public.employee_employment_types(id) on delete set null,
  add column if not exists payroll_eligible boolean not null default true,
  add column if not exists employee_pay_policy text not null default 'salary',
  add column if not exists allowance_amount numeric(14,2) not null default 0,
  add column if not exists attendance_required boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_employee_pay_policy_check') then
    alter table public.employees
      add constraint employees_employee_pay_policy_check
      check (employee_pay_policy in ('salary', 'allowance', 'unpaid', 'not_counted'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'employees_allowance_amount_check') then
    alter table public.employees
      add constraint employees_allowance_amount_check
      check (allowance_amount >= 0);
  end if;
end;
$$;

create index if not exists idx_employee_employment_types_active on public.employee_employment_types(is_active, sort_order);
create index if not exists idx_employees_employment_type on public.employees(employment_type_id);
create index if not exists idx_employees_payroll_eligible on public.employees(payroll_eligible, employee_pay_policy);

insert into public.employee_employment_types (
  code, name, description, payroll_eligible_default, default_pay_policy, allowance_amount, requires_attendance, is_system, is_active, sort_order
) values
  ('EMPSTAT-TETAP', 'Karyawan Tetap', 'Karyawan utama DMS yang mengikuti absensi dan payroll reguler.', true, 'salary', 0, true, true, true, 10),
  ('EMPSTAT-KONTRAK', 'Kontrak', 'Karyawan kontrak yang mengikuti absensi dan payroll reguler.', true, 'salary', 0, true, true, true, 20),
  ('EMPSTAT-HARIAN', 'Harian', 'Tenaga harian yang dibayar sesuai policy payroll.', true, 'salary', 0, true, true, true, 30),
  ('EMPSTAT-PROBATION', 'Probation', 'Karyawan masa percobaan yang tetap mengikuti absensi.', true, 'salary', 0, true, true, true, 40),
  ('EMPSTAT-PKL', 'PKL / Magang', 'Peserta PKL atau magang. Bisa absen Biofinger tanpa otomatis masuk payroll.', false, 'not_counted', 0, true, true, true, 50),
  ('EMPSTAT-FREELANCE', 'Freelance', 'Tenaga freelance. Payroll bisa diaktifkan per orang bila dibayar oleh DMS.', false, 'not_counted', 0, true, true, true, 60)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  payroll_eligible_default = excluded.payroll_eligible_default,
  default_pay_policy = excluded.default_pay_policy,
  allowance_amount = excluded.allowance_amount,
  requires_attendance = excluded.requires_attendance,
  is_system = excluded.is_system,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.employees
set employment_type_id = (
    select id from public.employee_employment_types where code = 'EMPSTAT-TETAP' limit 1
  ),
  payroll_eligible = true,
  employee_pay_policy = case
    when employee_pay_policy in ('salary', 'allowance', 'unpaid', 'not_counted') then employee_pay_policy
    else 'salary'
  end,
  allowance_amount = greatest(coalesce(allowance_amount, 0), 0),
  attendance_required = true,
  updated_at = now()
where employment_type_id is null;

alter table public.employee_employment_types enable row level security;

drop policy if exists "Production read employment types" on public.employee_employment_types;
create policy "Production read employment types"
on public.employee_employment_types for select
to authenticated
using (
  public.has_app_permission('master_data.view')
  or public.has_app_permission('employees.view')
  or public.has_app_permission('attendance.view')
  or public.has_app_permission('payroll.view')
);

drop policy if exists "Production manage employment types" on public.employee_employment_types;
create policy "Production manage employment types"
on public.employee_employment_types for all
to authenticated
using (public.has_app_permission('master_data.manage'))
with check (public.has_app_permission('master_data.manage'));

grant select, insert, update, delete on public.employee_employment_types to authenticated;
grant all on public.employee_employment_types to service_role;

create or replace function public.enforce_employee_payroll_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payroll_eligible = false or new.employee_pay_policy in ('unpaid', 'not_counted') then
    update public.attendance_daily_summaries
    set payroll_cycle_id = null,
        updated_at = now()
    where employee_id = new.id
      and payroll_cycle_id in (
        select id
        from public.payroll_cycles
        where employee_id = new.id
          and status not in ('locked', 'paid', 'void')
      );

    update public.attendance_logs
    set payroll_cycle_id = null,
        updated_at = now()
    where employee_id = new.id
      and payroll_cycle_id in (
        select id
        from public.payroll_cycles
        where employee_id = new.id
          and status not in ('locked', 'paid', 'void')
      );

    update public.overtime_requests
    set payroll_cycle_id = null,
        updated_at = now()
    where employee_id = new.id
      and payroll_cycle_id in (
        select id
        from public.payroll_cycles
        where employee_id = new.id
          and status not in ('locked', 'paid', 'void')
      );

    delete from public.payroll_cycles
    where employee_id = new.id
      and status not in ('locked', 'paid', 'void');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_employees_payroll_eligibility_cleanup on public.employees;
create trigger trg_employees_payroll_eligibility_cleanup
after insert or update of payroll_eligible, employee_pay_policy
on public.employees
for each row execute function public.enforce_employee_payroll_eligibility();

create or replace function public.prevent_non_payroll_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_record record;
begin
  select payroll_eligible, employee_pay_policy
  into employee_record
  from public.employees
  where id = new.employee_id;

  if coalesce(employee_record.payroll_eligible, true) = false
     or coalesce(employee_record.employee_pay_policy, 'salary') in ('unpaid', 'not_counted') then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payroll_cycles_prevent_non_payroll on public.payroll_cycles;
create trigger trg_payroll_cycles_prevent_non_payroll
before insert or update on public.payroll_cycles
for each row execute function public.prevent_non_payroll_cycle();

select public.refresh_all_employee_payroll_cycles();

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Create employment type master data', 'employee_employment_types', '20260902000500', 'success', '{"source":"migration","module":"employees","summary":"employment-types-payroll-policy"}'::jsonb);
