-- Configure Developer role for production technical access.
-- This keeps business ownership separate while preserving operational access.

do $$
declare
  owner_role_id uuid;
  developer_role_id uuid;
  management_division_id uuid;
  target_user_id uuid;
begin
  select id
  into owner_role_id
  from public.roles
  where code = 'ROLE-OWNER'
  limit 1;

  if owner_role_id is null then
    raise exception 'ROLE-OWNER tidak ditemukan.';
  end if;

  select id
  into developer_role_id
  from public.roles
  where code in ('ROLE-DEVELOPER', 'ROLE-DEVLOPER')
     or lower(name) = 'developer'
  order by case when code = 'ROLE-DEVELOPER' then 0 else 1 end
  limit 1;

  if developer_role_id is null then
    insert into public.roles (code, name, description, level, is_system, is_active)
    values (
      'ROLE-DEVELOPER',
      'Developer',
      'Akses teknis untuk maintenance, audit, dan deployment aplikasi.',
      5,
      false,
      true
    )
    returning id into developer_role_id;
  else
    update public.roles
    set code = 'ROLE-DEVELOPER',
        name = 'Developer',
        description = 'Akses teknis untuk maintenance, audit, dan deployment aplikasi.',
        level = 5,
        is_active = true,
        updated_at = now()
    where id = developer_role_id;
  end if;

  insert into public.role_permissions (role_id, permission_key, enabled)
  select developer_role_id, role_permissions.permission_key, role_permissions.enabled
  from public.role_permissions
  where role_permissions.role_id = owner_role_id
  on conflict (role_id, permission_key) do update set
    enabled = excluded.enabled,
    updated_at = now();

  select id
  into management_division_id
  from public.divisions
  where code = 'DIV-MGT'
     or lower(name) = 'management'
  order by case when code = 'DIV-MGT' then 0 else 1 end
  limit 1;

  select id
  into target_user_id
  from public.app_users
  where lower(email) = 'hardinurahman@gmail.com'
     or lower(full_name) = 'hardinur rahman'
  order by case when lower(email) = 'hardinurahman@gmail.com' then 0 else 1 end
  limit 1;

  if target_user_id is null then
    raise exception 'User Hardinur Rahman tidak ditemukan.';
  end if;

  update public.app_users
  set role_id = developer_role_id,
      division_id = coalesce(division_id, management_division_id),
      app_scope = 'management',
      updated_at = now()
  where id = target_user_id;

  insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
  values (
    'System',
    'Assign Hardinur Rahman as Developer',
    'app_users',
    target_user_id::text,
    'success',
    jsonb_build_object(
      'source', 'migration',
      'role_code', 'ROLE-DEVELOPER',
      'reason', 'separate technical developer access from business owner role'
    )
  );
end $$;
