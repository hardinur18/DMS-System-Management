-- Employee payroll settings, soft delete, and database-side code generator.

alter table public.employees
add column if not exists salary_type text not null default 'daily',
add column if not exists monthly_salary numeric(14, 2) not null default 0,
add column if not exists payroll_method text not null default 'attendance_cycle',
add column if not exists prorate_enabled boolean not null default true,
add column if not exists deleted_at timestamptz;

update public.employees
set
  salary_type = coalesce(nullif(salary_type, ''), 'daily'),
  monthly_salary = coalesce(monthly_salary, 0),
  payroll_method = coalesce(nullif(payroll_method, ''), 'attendance_cycle'),
  prorate_enabled = coalesce(prorate_enabled, true);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employees_salary_type_check'
  ) then
    alter table public.employees
      add constraint employees_salary_type_check
      check (salary_type in ('daily', 'monthly'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employees_monthly_salary_check'
  ) then
    alter table public.employees
      add constraint employees_monthly_salary_check
      check (monthly_salary >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employees_payroll_method_check'
  ) then
    alter table public.employees
      add constraint employees_payroll_method_check
      check (payroll_method in ('attendance_cycle', 'calendar_month', 'custom'));
  end if;
end $$;

create index if not exists idx_employees_deleted_at on public.employees(deleted_at);
create index if not exists idx_employees_salary_type on public.employees(salary_type);
create index if not exists idx_employees_payroll_method on public.employees(payroll_method);

create or replace function public.get_next_employee_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  select coalesce(max((substring(employee_code from '^EMP-([0-9]+)$'))::integer), 0) + 1
  into next_number
  from public.employees;

  return 'EMP-' || lpad(next_number::text, 3, '0');
end;
$$;

grant execute on function public.get_next_employee_code() to authenticated;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Add employee payroll settings and soft delete', 'employees', '20260807000500', 'success', '{"source":"migration","module":"employees"}'::jsonb);
