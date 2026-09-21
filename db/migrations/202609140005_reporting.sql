create function public.contract_balances() returns table(contract_id uuid,total_remaining integer,future_used integer,confirmed_upcoming bigint) language sql stable security definer set search_path=public as $$
 select c.id,contract_remaining(c.id),-coalesce((select sum(quantity)::int from session_ledger l where l.contract_id=c.id and l.session_source='advance'),0),(select count(*) from bookings b where b.contract_id=c.id and b.status in ('Confirmed','Urgent Shoot','Reschedule Requested') and b.start_at>=now()) from contracts c where can_access(c.organization_id)
$$;
revoke execute on function public.contract_balances() from public,anon;
grant execute on function public.contract_balances() to authenticated,service_role;

-- Enforce complete required booking fields in PostgreSQL as well as Zod.
alter table public.bookings add constraint production_text_lengths check(length(trim(location)) between 2 and 500 and length(trim(subject)) between 2 and 300 and length(trim(topics)) between 3 and 5000 and length(additional_notes)<=5000 and length(equipment_requirements)<=2000 and expected_reels<=500 and end_at-start_at>=interval '30 minutes');
