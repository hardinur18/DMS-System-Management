-- Align weekly shift-machine bonus with the operational cycle:
-- Sunday through Saturday, paid on Saturday.

update public.weekly_bonus_policies
set
  week_start_dow = 0,
  payment_day_dow = 6,
  description = 'Bonus untuk shift mesin tertentu. Periode Minggu-Sabtu dan dibayar Sabtu.',
  updated_at = now()
where code = 'SHIFT-MESIN-WEEKLY'
  and (
    week_start_dow is distinct from 0
    or payment_day_dow is distinct from 6
    or description is distinct from 'Bonus untuk shift mesin tertentu. Periode Minggu-Sabtu dan dibayar Sabtu.'
  );

do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.refresh_weekly_shift_bonus_cycles(current_date - 90, current_date + 7);
end $$;
