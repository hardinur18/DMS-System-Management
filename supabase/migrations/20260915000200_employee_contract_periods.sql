alter table public.employees
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_contract_period_check') then
    alter table public.employees
      add constraint employees_contract_period_check
      check (
        contract_start_date is null
        or contract_end_date is null
        or contract_start_date <= contract_end_date
      );
  end if;
end;
$$;

create index if not exists idx_employees_contract_end_date
on public.employees(contract_end_date)
where contract_end_date is not null;

create table if not exists public.employee_contract_extensions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  previous_start_date date,
  previous_end_date date,
  new_start_date date not null,
  new_end_date date not null,
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_contract_extensions_period_check
    check (new_start_date <= new_end_date)
);

create index if not exists idx_employee_contract_extensions_employee
on public.employee_contract_extensions(employee_id, created_at desc);

create index if not exists idx_employee_contract_extensions_end_date
on public.employee_contract_extensions(new_end_date desc);

alter table public.employee_contract_extensions enable row level security;

drop policy if exists "Production read employee contract extensions" on public.employee_contract_extensions;
create policy "Production read employee contract extensions"
on public.employee_contract_extensions for select
to authenticated
using (
  public.has_app_permission('employees.view')
  or public.has_app_permission('payroll.view')
);

drop policy if exists "Production manage employee contract extensions" on public.employee_contract_extensions;
create policy "Production manage employee contract extensions"
on public.employee_contract_extensions for all
to authenticated
using (public.has_app_permission('employees.manage'))
with check (public.has_app_permission('employees.manage'));

grant select, insert, update, delete on public.employee_contract_extensions to authenticated;
grant select, insert, update, delete on public.employee_contract_extensions to service_role;

create or replace function public.clear_permanent_employee_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employment_code text;
begin
  select code
  into employment_code
  from public.employee_employment_types
  where id = new.employment_type_id;

  if coalesce(employment_code, 'EMPSTAT-TETAP') = 'EMPSTAT-TETAP' then
    new.contract_start_date = null;
    new.contract_end_date = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_employees_clear_permanent_contract on public.employees;
create trigger trg_employees_clear_permanent_contract
before insert or update of employment_type_id, contract_start_date, contract_end_date
on public.employees
for each row execute function public.clear_permanent_employee_contract();

create or replace function public.extend_employee_contract(
  target_employee_id uuid,
  new_contract_start_date date,
  new_contract_end_date date,
  extension_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_record record;
  actor_user_id uuid;
  actor_name text;
  extension_id uuid;
begin
  if not public.has_app_permission('employees.manage') then
    raise exception 'Tidak punya akses untuk memperpanjang kontrak karyawan.' using errcode = '42501';
  end if;

  if target_employee_id is null then
    raise exception 'Karyawan wajib dipilih.';
  end if;

  if new_contract_start_date is null or new_contract_end_date is null then
    raise exception 'Tanggal awal dan akhir kontrak wajib diisi.';
  end if;

  if new_contract_start_date > new_contract_end_date then
    raise exception 'Tanggal awal kontrak tidak boleh melewati tanggal akhir kontrak.';
  end if;

  select
    employees.id,
    employees.employee_code,
    employees.full_name,
    employees.contract_start_date,
    employees.contract_end_date,
    employment_types.code as employment_type_code
  into employee_record
  from public.employees
  left join public.employee_employment_types employment_types
    on employment_types.id = employees.employment_type_id
  where employees.id = target_employee_id
  for update;

  if not found then
    raise exception 'Karyawan tidak ditemukan.';
  end if;

  if coalesce(employee_record.employment_type_code, 'EMPSTAT-TETAP') = 'EMPSTAT-TETAP' then
    raise exception 'Karyawan tetap tidak memakai periode kontrak.';
  end if;

  select app_users.id, app_users.full_name
  into actor_user_id, actor_name
  from public.app_users
  where app_users.auth_user_id = auth.uid()
     or app_users.id = auth.uid()
  limit 1;

  update public.employees
  set contract_start_date = new_contract_start_date,
      contract_end_date = new_contract_end_date
  where id = target_employee_id;

  insert into public.employee_contract_extensions (
    employee_id,
    previous_start_date,
    previous_end_date,
    new_start_date,
    new_end_date,
    notes,
    created_by
  )
  values (
    target_employee_id,
    employee_record.contract_start_date,
    employee_record.contract_end_date,
    new_contract_start_date,
    new_contract_end_date,
    nullif(trim(coalesce(extension_notes, '')), ''),
    actor_user_id
  )
  returning id into extension_id;

  insert into public.audit_logs (actor_user_id, actor_name, action, target_table, target_id, status, metadata)
  values (
    actor_user_id,
    coalesce(actor_name, 'System'),
    'Extend employee contract',
    'employees',
    target_employee_id::text,
    'success',
    jsonb_build_object(
      'employee_code', employee_record.employee_code,
      'full_name', employee_record.full_name,
      'previous_start_date', employee_record.contract_start_date,
      'previous_end_date', employee_record.contract_end_date,
      'new_start_date', new_contract_start_date,
      'new_end_date', new_contract_end_date,
      'extension_id', extension_id
    )
  );

  return extension_id;
end;
$$;

revoke all on function public.extend_employee_contract(uuid, date, date, text) from public;
grant execute on function public.extend_employee_contract(uuid, date, date, text) to authenticated;
grant execute on function public.extend_employee_contract(uuid, date, date, text) to service_role;

notify pgrst, 'reload schema';

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Enable employee contract periods', 'employees', '20260915000200', 'success', '{"source":"migration","module":"employees","summary":"contract-periods-and-extension-history"}'::jsonb);
