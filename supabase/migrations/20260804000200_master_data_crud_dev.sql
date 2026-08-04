-- DMS Master Data CRUD support for development.
-- This enables the Management App UI to manage master data before full auth/permission hardening.

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  start_time time,
  end_time time,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_components (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  component_type text not null default 'earning' check (component_type in ('earning', 'deduction')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shifts_active on public.shifts(is_active);
create index if not exists idx_payroll_components_active on public.payroll_components(is_active);
create index if not exists idx_payroll_components_type on public.payroll_components(component_type);

drop trigger if exists trg_shifts_updated_at on public.shifts;
create trigger trg_shifts_updated_at
before update on public.shifts
for each row execute function public.set_updated_at();

drop trigger if exists trg_payroll_components_updated_at on public.payroll_components;
create trigger trg_payroll_components_updated_at
before update on public.payroll_components
for each row execute function public.set_updated_at();

alter table public.shifts enable row level security;
alter table public.payroll_components enable row level security;

insert into public.shifts (code, name, start_time, end_time, description, is_active)
values
  ('SFT-PAGI', 'Pagi', '08:00', '17:00', 'Shift pagi operasional.', true),
  ('SFT-MALAM', 'Malam', '20:00', '05:00', 'Shift malam draft untuk operasional tertentu.', false)
on conflict (code) do update set
  name = excluded.name,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.payroll_components (code, name, component_type, description, is_active)
values
  ('PAY-DLY', 'Gaji Harian', 'earning', 'Komponen gaji harian berdasarkan hari kerja valid.', true),
  ('PAY-KSB', 'Potongan Kasbon', 'deduction', 'Potongan kasbon yang masuk payroll.', true)
on conflict (code) do update set
  name = excluded.name,
  component_type = excluded.component_type,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

drop policy if exists "Dev anon manage roles" on public.roles;
create policy "Dev anon manage roles"
on public.roles for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Dev anon manage permissions" on public.permissions;
create policy "Dev anon manage permissions"
on public.permissions for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Dev anon manage role permissions" on public.role_permissions;
create policy "Dev anon manage role permissions"
on public.role_permissions for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Dev anon manage divisions" on public.divisions;
create policy "Dev anon manage divisions"
on public.divisions for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Dev anon manage positions" on public.positions;
create policy "Dev anon manage positions"
on public.positions for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Dev anon manage work locations" on public.work_locations;
create policy "Dev anon manage work locations"
on public.work_locations for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Dev anon manage shifts" on public.shifts;
create policy "Dev anon manage shifts"
on public.shifts for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Dev anon manage payroll components" on public.payroll_components;
create policy "Dev anon manage payroll components"
on public.payroll_components for all
to anon, authenticated
using (true)
with check (true);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Enable master data CRUD dev policies', 'master_data', '20260804000200', 'success', '{"source":"migration"}'::jsonb);
