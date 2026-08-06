-- Lock Pengguna & Akses writes to the Edge Function path.
-- The app-users function uses the service role and bypasses RLS after checking session + permissions.

drop policy if exists "Production users create profiles" on public.app_users;
drop policy if exists "Production users update profiles" on public.app_users;
drop policy if exists "Production users delete profiles" on public.app_users;

drop policy if exists "Production users insert profiles via function only" on public.app_users;
create policy "Production users insert profiles via function only"
on public.app_users for insert
to authenticated
with check (false);

drop policy if exists "Production users update profiles via function only" on public.app_users;
create policy "Production users update profiles via function only"
on public.app_users for update
to authenticated
using (false)
with check (false);

drop policy if exists "Production users delete profiles via function only" on public.app_users;
create policy "Production users delete profiles via function only"
on public.app_users for delete
to authenticated
using (false);

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  ('System', 'Lock app user writes to Edge Function', 'app_users', '20260806000600', 'success', '{"source":"migration","reason":"function-only-crud"}'::jsonb);
