-- Align master data columns used by the Management App forms.
-- Adds safe optional fields for ordering and display without dropping existing data.

alter table public.roles
  add column if not exists sort_order integer not null default 0;

alter table public.divisions
  add column if not exists sort_order integer not null default 0;

alter table public.positions
  add column if not exists sort_order integer not null default 0;

alter table public.work_locations
  add column if not exists sort_order integer not null default 0;

alter table public.shifts
  add column if not exists sort_order integer not null default 0;

alter table public.payroll_components
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_roles_sort_order on public.roles(sort_order, level, code);
create index if not exists idx_divisions_sort_order on public.divisions(sort_order, code);
create index if not exists idx_positions_sort_order on public.positions(sort_order, code);
create index if not exists idx_work_locations_sort_order on public.work_locations(sort_order, code);
create index if not exists idx_shifts_sort_order on public.shifts(sort_order, code);
create index if not exists idx_payroll_components_sort_order on public.payroll_components(sort_order, code);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_locations_latitude_range_check'
  ) then
    alter table public.work_locations
      add constraint work_locations_latitude_range_check
      check (latitude is null or (latitude >= -90 and latitude <= 90));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_locations_longitude_range_check'
  ) then
    alter table public.work_locations
      add constraint work_locations_longitude_range_check
      check (longitude is null or (longitude >= -180 and longitude <= 180));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'roles_level_positive_check'
  ) then
    alter table public.roles
      add constraint roles_level_positive_check
      check (level > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_locations_radius_reasonable_check'
  ) then
    alter table public.work_locations
      add constraint work_locations_radius_reasonable_check
      check (radius_m > 0 and radius_m <= 10000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shifts_time_pair_check'
  ) then
    alter table public.shifts
      add constraint shifts_time_pair_check
      check (
        (start_time is null and end_time is null)
        or (start_time is not null and end_time is not null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payroll_components_component_type_check'
  ) then
    alter table public.payroll_components
      add constraint payroll_components_component_type_check
      check (component_type in ('earning', 'deduction'));
  end if;
end $$;

comment on table public.roles is 'Master role management app. Dipakai user access dan role permission.';
comment on table public.divisions is 'Master divisi. Dipakai user, karyawan, approval, dan filter operasional.';
comment on table public.positions is 'Master jabatan. Dipakai profil karyawan dan struktur organisasi.';
comment on table public.shifts is 'Master shift kerja. Dipakai jadwal, absensi, dan payroll cycle.';
comment on table public.work_locations is 'Master lokasi kerja. Dipakai validasi GPS absensi dan radius area.';
comment on table public.payroll_components is 'Master komponen gaji. Dipakai payroll, bonus, potongan, dan kasbon.';

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Align master data form columns', 'master_data', '20260805000100', 'success', '{"source":"migration"}'::jsonb);
