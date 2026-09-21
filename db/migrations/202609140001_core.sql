create extension if not exists btree_gist;
create type public.app_role as enum ('client','admin','super_admin');
create type public.booking_status as enum ('Draft','Pending Approval','Confirmed','Rejected','Reschedule Requested','Cancelled On Time','Late Cancellation','Completed','No Show','Urgent Shoot');
create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, status text not null default 'active' check(status in ('active','inactive')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.profiles (id uuid primary key references auth.users(id), organization_id uuid references public.organizations(id), role public.app_role not null default 'client', name text not null, email text not null, phone text, status text not null default 'active' check(status in ('active','inactive')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(role <> 'client' or organization_id is not null));
create function public.app_current_role() returns public.app_role language sql stable security definer set search_path = public as $$ select role from profiles where id=auth.uid() and status='active' $$;
create function public.current_org() returns uuid language sql stable security definer set search_path = public as $$ select organization_id from profiles where id=auth.uid() and status='active' $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select coalesce(app_current_role() in ('admin','super_admin'),false) $$;
create function public.can_access(org uuid) returns boolean language sql stable security definer set search_path = public as $$ select coalesce(is_admin() or org=current_org(),false) $$;
create table public.system_settings (key text primary key, value jsonb not null, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now());
insert into public.system_settings values ('booking_rules','{"timezone":"Asia/Riyadh","working_days":[0,1,2,3,4],"lead_time_days":4,"cancellation_window_hours":24,"pending_blocks":false,"day_start":8,"day_end":20,"allow_future_usage":true,"allow_carry_forward":true,"max_advance_sessions":2,"advance_policy":"numeric","carry_forward_expiry_months":1}',null,now());
create table public.contracts (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), start_date date not null, end_date date not null, monthly_allowance integer not null check(monthly_allowance>0), total_entitlement integer not null check(total_entitlement>0), lead_time_days integer check(lead_time_days between 0 and 90), cancellation_window_hours integer check(cancellation_window_hours between 0 and 720), allow_future_usage boolean not null default false, max_advance_sessions integer check(max_advance_sessions>=0), advance_policy text not null default 'numeric' check(advance_policy in ('numeric','unlimited','approval')), allow_carry_forward boolean not null default false, carry_forward_expiry_months integer not null default 1 check(carry_forward_expiry_months between 1 and 24), status text not null default 'active' check(status in ('active','inactive')), created_at timestamptz not null default now(), check(end_date>=start_date), unique(id,organization_id));
create table public.contract_month_allocations (id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.contracts(id), month date not null check(extract(day from month)=1), original_allocation integer not null check(original_allocation>=0), created_at timestamptz not null default now(), unique(contract_id,month));
create table public.resources (id uuid primary key default gen_random_uuid(), name text not null, kind text not null check(kind in ('crew','photographer','equipment','studio')), active boolean not null default true);
create table public.bookings (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), contract_id uuid not null, created_by uuid not null references public.profiles(id), status public.booking_status not null default 'Pending Approval', start_at timestamptz not null, end_at timestamptz not null, location text not null, subject text not null, expected_reels integer not null check(expected_reels>0), topics text not null, script_ready boolean not null default false, content_plan_ready boolean not null default false, equipment_requirements text not null default '', additional_notes text not null default '', shoot_type text not null default 'Content shoot', resource_id uuid references public.resources(id), urgent boolean not null default false, cancellation_deadline timestamptz, allocation_month date, session_source text check(session_source in ('current','advance','carry','exception')), carry_id uuid, proposed_start timestamptz, proposed_end timestamptz, change_reason text, late_change boolean not null default false, slot_locked boolean not null default false, approved_at timestamptz, shooting_log_id uuid, idempotency_key uuid not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), foreign key(contract_id,organization_id) references public.contracts(id,organization_id), check(end_at>start_at), check(end_at-start_at<=interval '12 hours'));
create index bookings_org_time on public.bookings(organization_id,start_at);
create index bookings_status on public.bookings(status);
alter table public.bookings add constraint no_resource_overlap exclude using gist ((coalesce(resource_id,'00000000-0000-0000-0000-000000000000'::uuid)) with =, tstzrange(start_at,end_at,'[)') with &&) where (slot_locked);
create table public.calendar_blocks (id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id), start_at timestamptz not null, end_at timestamptz not null, block_type text not null, reason text not null, notes text not null default '', resource_id uuid references public.resources(id), created_at timestamptz not null default now(), check(end_at>start_at));
create table public.carry_forward (id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.contracts(id), source_month date not null, target_month date not null, original_amount integer not null, amount integer not null check(amount>0), used integer not null default 0 check(used>=0 and used<=amount), expires_at date not null, created_at timestamptz not null default now(), unique(contract_id,source_month), check(target_month>source_month), foreign key(contract_id,source_month) references public.contract_month_allocations(contract_id,month));
alter table public.bookings add foreign key(carry_id) references public.carry_forward(id);
create table public.session_ledger (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), contract_id uuid not null references public.contracts(id), booking_id uuid references public.bookings(id), allocation_month date not null, session_source text not null, transaction_type text not null check(transaction_type in ('Reservation','Usage','Late Cancellation','No Show','Restoration','Carry Forward','Advance Usage','Admin Adjustment','Contract Allocation')), quantity integer not null, balance_before integer not null, balance_after integer not null check(balance_after>=0), reason text not null, created_by uuid references public.profiles(id), created_at timestamptz not null default now());
create index ledger_contract_month on public.session_ledger(contract_id,allocation_month);
create index ledger_booking on public.session_ledger(booking_id);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), booking_id uuid references public.bookings(id), actor_user_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id uuid, old_values jsonb, new_values jsonb, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create index audit_booking on public.audit_logs(booking_id,created_at);
create table public.booking_files (id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id), file_name text not null, storage_path text not null unique, file_type text not null, category text not null check(category in ('script','content_plan','mood_board','reference','supporting')), uploaded_by uuid not null references public.profiles(id), uploaded_at timestamptz not null default now());
create table public.notification_templates (id uuid primary key default gen_random_uuid(), event_type text not null, channel text not null check(channel in ('system','email','whatsapp')), subject text not null, body text not null, enabled boolean not null default true, updated_at timestamptz not null default now(), unique(event_type,channel));
create table public.notifications (id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), booking_id uuid references public.bookings(id), recipient_user_id uuid references public.profiles(id), channel text not null check(channel in ('system','email','whatsapp')), event_type text not null, status text not null default 'queued' check(status in ('queued','processing','sent','failed','read')), provider_message_id text, payload jsonb not null, sent_at timestamptz, failure_reason text, attempts integer not null default 0, locked_at timestamptz, created_at timestamptz not null default now());
create index notices_queue on public.notifications(status,created_at);
create table public.shooting_logs (id uuid primary key default gen_random_uuid(), booking_id uuid not null unique references public.bookings(id), organization_id uuid not null references public.organizations(id), payload jsonb not null, actual_start timestamptz, actual_end timestamptz, production_notes text not null default '', post_shoot_confirmed boolean not null default false, status text not null default 'pending' check(status in ('pending','sent','failed')), failure_reason text, external_id text, created_at timestamptz not null default now(), check(actual_end is null or (actual_start is not null and actual_end>=actual_start)));
alter table public.bookings add foreign key(shooting_log_id) references public.shooting_logs(id);

create function public.immutable_history() returns trigger language plpgsql as $$ begin raise exception 'History is append-only'; end $$;
create trigger immutable_audit before update or delete on public.audit_logs for each row execute function public.immutable_history();
create trigger immutable_ledger before update or delete on public.session_ledger for each row execute function public.immutable_history();
create trigger immutable_allocation before update or delete on public.contract_month_allocations for each row execute function public.immutable_history();
create function public.audit_change() returns trigger language plpgsql security definer set search_path=public as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='INSERT' then null else to_jsonb(old) end; org uuid; bid uuid;
begin
 if tg_table_name='bookings' then org:=new.organization_id; bid:=new.id;
 elsif tg_table_name in ('contracts','profiles','notifications','shooting_logs','session_ledger') then org:=(n->>'organization_id')::uuid; bid:=(n->>'booking_id')::uuid;
 elsif tg_table_name='booking_files' then bid:=new.booking_id; select organization_id into org from bookings where id=bid;
 elsif tg_table_name='organizations' then org:=new.id;
 end if;
 insert into audit_logs(organization_id,booking_id,actor_user_id,action,entity_type,entity_id,old_values,new_values) values(org,bid,auth.uid(),tg_op,tg_table_name,(n->>'id')::uuid,o,n);
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['organizations','profiles','contracts','bookings','calendar_blocks','booking_files','notifications','shooting_logs','session_ledger','notification_templates','system_settings','resources','carry_forward'] loop execute format('create trigger audit_%I after insert or update on public.%I for each row execute function public.audit_change()',t,t); end loop; end $$;

do $$ declare t text; begin foreach t in array array['organizations','profiles','contracts','contract_month_allocations','resources','bookings','calendar_blocks','carry_forward','session_ledger','audit_logs','booking_files','notification_templates','notifications','system_settings','shooting_logs'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant select on public.%I to authenticated',t); end loop; end $$;
create policy org_read on public.organizations for select to authenticated using(can_access(id));
create policy profile_read on public.profiles for select to authenticated using(is_admin() or (organization_id=current_org() and role='client'));
create policy contract_read on public.contracts for select to authenticated using(can_access(organization_id));
create policy booking_read on public.bookings for select to authenticated using(can_access(organization_id));
create policy ledger_read on public.session_ledger for select to authenticated using(can_access(organization_id));
create policy allocation_read on public.contract_month_allocations for select to authenticated using(exists(select 1 from contracts c where c.id=contract_id and can_access(c.organization_id)));
create policy carry_read on public.carry_forward for select to authenticated using(exists(select 1 from contracts c where c.id=contract_id and can_access(c.organization_id)));
-- Raw audit values contain internal notes and delivery addresses. Only admins may read them.
create policy audit_admin on public.audit_logs for select to authenticated using(is_admin());
create policy block_admin on public.calendar_blocks for select to authenticated using(is_admin());
create policy resource_read on public.resources for select to authenticated using(app_current_role() is not null);
create policy rules_read on public.system_settings for select to authenticated using(app_current_role() is not null);
create policy template_admin on public.notification_templates for select to authenticated using(is_admin());
create policy file_read on public.booking_files for select to authenticated using(exists(select 1 from bookings b where b.id=booking_id and can_access(b.organization_id)));
create policy notice_read on public.notifications for select to authenticated using(is_admin() or (recipient_user_id=auth.uid() and channel='system'));
create policy log_read on public.shooting_logs for select to authenticated using(can_access(organization_id));

create function public.calendar_availability(range_start timestamptz,range_end timestamptz) returns table(start_at timestamptz,end_at timestamptz,resource_id uuid) language plpgsql stable security definer set search_path=public as $$ begin
 if app_current_role() is null then raise exception 'Unauthorized'; end if;
 if range_end-range_start>interval '400 days' then raise exception 'Range too large'; end if;
 return query select b.start_at,b.end_at,b.resource_id from bookings b where b.slot_locked and b.start_at<range_end and b.end_at>range_start union all select c.start_at,c.end_at,c.resource_id from calendar_blocks c where c.start_at<range_end and c.end_at>range_start;
end $$;
create function public.booking_timeline(target uuid) returns table(id uuid,booking_id uuid,action text,actor_user_id uuid,old_values jsonb,new_values jsonb,metadata jsonb,created_at timestamptz) language plpgsql stable security definer set search_path=public as $$ begin
 if not exists(select 1 from bookings b where b.id=target and can_access(b.organization_id)) then raise exception 'Not found'; end if;
 return query select a.id,a.booking_id,case when a.entity_type='bookings' then coalesce(a.new_values->>'status',a.action) else a.entity_type||' '||a.action end,a.actor_user_id,
 case when is_admin() then a.old_values else jsonb_build_object('start_at',a.old_values->'start_at','status',a.old_values->'status') end,
 case when is_admin() then a.new_values else jsonb_build_object('start_at',a.new_values->'start_at','status',a.new_values->'status') end,
 case when is_admin() then a.metadata else '{}'::jsonb end,a.created_at from audit_logs a where a.booking_id=target and (is_admin() or a.entity_type in ('bookings','booking_files','session_ledger')) order by a.created_at desc;
end $$;

create function public.month_remaining(cid uuid,mon date) returns integer language sql stable security definer set search_path=public as $$
 select coalesce((select original_allocation from contract_month_allocations where contract_id=cid and month=mon),0)+coalesce((select sum(quantity)::int from session_ledger where contract_id=cid and allocation_month=mon and transaction_type<>'Contract Allocation'),0)
$$;
create function public.contract_remaining(cid uuid) returns integer language sql stable security definer set search_path=public as $$
 select c.total_entitlement+coalesce((select sum(quantity)::int from session_ledger where contract_id=cid and transaction_type not in ('Contract Allocation','Carry Forward')),0) from contracts c where c.id=cid
$$;
create function public.session_balances() returns table(id uuid,contract_id uuid,month date,original_allocation integer,carry_forward_received bigint,advance_sessions_used bigint,normal_sessions_used bigint,remaining integer) language sql stable security definer set search_path=public as $$
 select a.id,a.contract_id,a.month,a.original_allocation,
 coalesce((select sum(cf.amount-cf.used) from carry_forward cf where cf.contract_id=a.contract_id and cf.target_month=a.month and cf.expires_at>=(now() at time zone (select value->>'timezone' from system_settings where key='booking_rules'))::date),0),
 -coalesce((select sum(l.quantity) from session_ledger l where l.contract_id=a.contract_id and l.allocation_month=a.month and l.session_source='advance'),0),
 -coalesce((select sum(l.quantity) from session_ledger l where l.contract_id=a.contract_id and l.allocation_month=a.month and l.session_source='current' and l.transaction_type not in ('Contract Allocation','Carry Forward')),0),month_remaining(a.contract_id,a.month)
 from contract_month_allocations a join contracts c on c.id=a.contract_id where can_access(c.organization_id)
$$;
