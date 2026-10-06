-- Remove stale unpaid weekly-bonus draft rows from previous week-start rules.
-- Paid bonus cycles are intentionally preserved for audit/payment history.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.refresh_weekly_shift_bonus_cycles(date, date)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    E'\n      and coalesce(summary.workday_counted, true) = true',
    ''
  );

  if function_definition not like '%delete from public.weekly_shift_bonus_cycles stale_cycle%' then
    function_definition := replace(
      function_definition,
      '  return jsonb_build_object(',
      '  delete from public.weekly_shift_bonus_cycles stale_cycle
  using public.weekly_bonus_policies policy
  where stale_cycle.policy_id = policy.id
    and policy.is_active = true
    and policy.status = ''active''
    and stale_cycle.status = ''draft''
    and stale_cycle.payment_id is null
    and coalesce(stale_cycle.eligible_days, 0) = 0
    and coalesce(stale_cycle.bonus_amount, 0) = 0
    and stale_cycle.period_started_at <= end_date
    and stale_cycle.period_closed_at >= start_date
    and ((extract(dow from stale_cycle.period_started_at)::integer - policy.week_start_dow + 7) % 7) <> 0;

  return jsonb_build_object('
    );
  end if;

  if function_definition not like '%delete from public.weekly_shift_bonus_cycles stale_cycle%' then
    raise exception 'Gagal memasang cleanup draft weekly bonus stale.';
  end if;

  execute function_definition;
end;
$$;

delete from public.weekly_shift_bonus_cycles stale_cycle
using public.weekly_bonus_policies policy
where stale_cycle.policy_id = policy.id
  and policy.is_active = true
  and policy.status = 'active'
  and stale_cycle.status = 'draft'
  and stale_cycle.payment_id is null
  and coalesce(stale_cycle.eligible_days, 0) = 0
  and coalesce(stale_cycle.bonus_amount, 0) = 0
  and ((extract(dow from stale_cycle.period_started_at)::integer - policy.week_start_dow + 7) % 7) <> 0;

do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.refresh_weekly_shift_bonus_cycles(date '2026-09-01', current_date + 7);
end;
$$;

insert into public.audit_logs (actor_name, action, target_table, target_id, status, metadata)
values
  (
    'System',
    'Clean stale weekly bonus draft cycles',
    'weekly_shift_bonus_cycles',
    '20261006000200',
    'success',
    '{"source":"migration","module":"payroll-bonus","policy":"remove-unpaid-misaligned-drafts"}'::jsonb
  );

notify pgrst, 'reload schema';
