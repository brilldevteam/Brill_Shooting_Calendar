create function public.manage_record(kind text,input jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; c contracts; mon date; left_total integer; amount integer; rules jsonb; expires date;
begin
 if not is_admin() then raise exception 'Admin permission required'; end if;
 if kind in ('organization','contract','contract_policy','profile','settings','template') and app_current_role()<>'super_admin' then raise exception 'Super Admin permission required'; end if;
 perform pg_advisory_xact_lock(80914001);
 if kind='organization' then
  if length(trim(input->>'name'))<2 then raise exception 'Organization name required'; end if;
  if input->>'id' is null then insert into organizations(name) values(input->>'name') returning id into result;
  else update organizations set name=input->>'name',status=coalesce(input->>'status','active'),updated_at=now() where id=(input->>'id')::uuid returning id into result; end if;
 elsif kind='profile' then
  if (input->>'id')::uuid=auth.uid() and (input->>'role'<>'super_admin' or input->>'status'='inactive') then raise exception 'Cannot remove your own Super Admin access'; end if;
  insert into profiles(id,organization_id,role,name,email,phone,status) values((input->>'id')::uuid,(input->>'organization_id')::uuid,(input->>'role')::app_role,input->>'name',input->>'email',input->>'phone',coalesce(input->>'status','active')) on conflict(id) do update set organization_id=excluded.organization_id,role=excluded.role,name=excluded.name,email=excluded.email,phone=excluded.phone,status=excluded.status,updated_at=now() returning id into result;
 elsif kind='contract' then
  if (input->>'end_date')::date>(input->>'start_date')::date+interval '10 years' then raise exception 'Maximum contract term is 10 years'; end if;
  insert into contracts(organization_id,start_date,end_date,monthly_allowance,total_entitlement,lead_time_days,cancellation_window_hours,allow_future_usage,max_advance_sessions,advance_policy,allow_carry_forward,carry_forward_expiry_months)
  values((input->>'organization_id')::uuid,(input->>'start_date')::date,(input->>'end_date')::date,(input->>'monthly_allowance')::int,(input->>'total_entitlement')::int,(input->>'lead_time_days')::int,(input->>'cancellation_window_hours')::int,coalesce((input->>'allow_future_usage')::boolean,false),(input->>'max_advance_sessions')::int,coalesce(input->>'advance_policy','numeric'),coalesce((input->>'allow_carry_forward')::boolean,false),coalesce((input->>'carry_forward_expiry_months')::int,1)) returning * into c;
  left_total:=c.total_entitlement;
  for mon in select generate_series(date_trunc('month',c.start_date),date_trunc('month',c.end_date),interval '1 month')::date loop
   amount:=least(c.monthly_allowance,left_total); insert into contract_month_allocations(contract_id,month,original_allocation) values(c.id,mon,amount);
   insert into session_ledger(organization_id,contract_id,allocation_month,session_source,transaction_type,quantity,balance_before,balance_after,reason,created_by) values(c.organization_id,c.id,mon,'current','Contract Allocation',amount,c.total_entitlement-left_total,c.total_entitlement-left_total+amount,'Original contractual allocation',auth.uid()); left_total:=left_total-amount;
  end loop;
  if left_total<>0 then raise exception 'Total entitlement exceeds monthly allocations within contract dates'; end if; result:=c.id;
 elsif kind='contract_policy' then
  update contracts set lead_time_days=(input->>'lead_time_days')::int,cancellation_window_hours=(input->>'cancellation_window_hours')::int,allow_future_usage=coalesce((input->>'allow_future_usage')::boolean,false),advance_policy=coalesce(input->>'advance_policy','numeric'),max_advance_sessions=(input->>'max_advance_sessions')::int,allow_carry_forward=coalesce((input->>'allow_carry_forward')::boolean,false),carry_forward_expiry_months=coalesce((input->>'carry_forward_expiry_months')::int,1),status=coalesce(input->>'status','active') where id=(input->>'id')::uuid returning id into result;
 elsif kind='extend_contract' then
  if app_current_role()<>'super_admin' or length(trim(input->>'reason'))<3 then raise exception 'Super Admin and extension reason required'; end if;
  select * into c from contracts where id=(input->>'id')::uuid for update;
  if (input->>'end_date')::date<=c.end_date or (input->>'end_date')::date>c.start_date+interval '10 years' then raise exception 'Invalid extension date'; end if;
  left_total:=0;
  for mon in select generate_series(date_trunc('month',c.end_date)+interval '1 month',date_trunc('month',(input->>'end_date')::date),interval '1 month')::date loop
   insert into contract_month_allocations(contract_id,month,original_allocation) values(c.id,mon,c.monthly_allowance); left_total:=left_total+c.monthly_allowance;
   insert into session_ledger(organization_id,contract_id,allocation_month,session_source,transaction_type,quantity,balance_before,balance_after,reason,created_by) values(c.organization_id,c.id,mon,'current','Contract Allocation',c.monthly_allowance,c.total_entitlement+left_total-c.monthly_allowance,c.total_entitlement+left_total,input->>'reason',auth.uid());
  end loop;
  update contracts set end_date=(input->>'end_date')::date,total_entitlement=total_entitlement+left_total where id=c.id; result:=c.id;
 elsif kind='carry' then
  select * into c from contracts where id=(input->>'contract_id')::uuid for update; select value into rules from system_settings where key='booking_rules';
  if c.id is null or not c.allow_carry_forward or not (rules->>'allow_carry_forward')::boolean then raise exception 'Carry-forward disabled'; end if;
  mon:=date_trunc('month',(input->>'source_month')::date)::date;
  if mon>=date_trunc('month',now() at time zone (rules->>'timezone'))::date then raise exception 'Only closed months can carry forward'; end if;
  if mon+interval '1 month'>c.end_date then raise exception 'Carry-forward cannot exceed contract'; end if;
  amount:=month_remaining(c.id,mon); if amount<1 then raise exception 'No unused sessions in source month'; end if;
  if exists(select 1 from bookings where contract_id=c.id and allocation_month=mon and status in ('Confirmed','Urgent Shoot','Reschedule Requested')) then raise exception 'Resolve source-month reservations before carrying forward'; end if;
  expires:=least(c.end_date,(mon+make_interval(months=>least(c.carry_forward_expiry_months,(rules->>'carry_forward_expiry_months')::int)+1)-interval '1 day')::date);
  insert into carry_forward(contract_id,source_month,target_month,original_amount,amount,expires_at) values(c.id,mon,(mon+interval '1 month')::date,(select original_allocation from contract_month_allocations where contract_id=c.id and month=mon),amount,expires) returning id into result;
  insert into session_ledger(organization_id,contract_id,allocation_month,session_source,transaction_type,quantity,balance_before,balance_after,reason,created_by) values(c.organization_id,c.id,mon,'carry','Carry Forward',0,contract_remaining(c.id),contract_remaining(c.id),'Carried '||amount||' sessions; source allocation preserved',auth.uid());
 elsif kind='adjustment' then
  select * into c from contracts where id=(input->>'contract_id')::uuid for update; mon:=(input->>'month')::date; amount:=(input->>'quantity')::int;
  if c.id is null or length(trim(input->>'reason'))<3 or amount=0 or abs(amount)>1000 then raise exception 'Contract, nonzero quantity and reason required'; end if;
  if not exists(select 1 from contract_month_allocations where contract_id=c.id and month=mon) then raise exception 'Unknown allocation month'; end if;
  if contract_remaining(c.id)+amount<0 or month_remaining(c.id,mon)+amount<0 or contract_remaining(c.id)+amount>c.total_entitlement then raise exception 'Adjustment exceeds contract bounds; extend contract for additional entitlement'; end if;
  insert into session_ledger(organization_id,contract_id,allocation_month,session_source,transaction_type,quantity,balance_before,balance_after,reason,created_by) values(c.organization_id,c.id,mon,'exception','Admin Adjustment',amount,contract_remaining(c.id),contract_remaining(c.id)+amount,input->>'reason',auth.uid()) returning id into result;
 elsif kind='block' then
  if (input->>'start_at')::timestamptz >= (input->>'end_at')::timestamptz then raise exception 'Invalid blocking interval'; end if;
  if exists(select 1 from bookings where slot_locked and start_at<(input->>'end_at')::timestamptz and end_at>(input->>'start_at')::timestamptz and ((input->>'resource_id') is null or resource_id is null or resource_id=(input->>'resource_id')::uuid)) then raise exception 'Block conflicts with an existing reserved slot'; end if;
  insert into calendar_blocks(created_by,start_at,end_at,block_type,reason,notes,resource_id) values(auth.uid(),(input->>'start_at')::timestamptz,(input->>'end_at')::timestamptz,input->>'block_type',input->>'reason',coalesce(input->>'notes',''),(input->>'resource_id')::uuid) returning id into result;
 elsif kind='remove_block' then
  insert into audit_logs(actor_user_id,action,entity_type,entity_id,old_values,metadata) select auth.uid(),'Unblocked','calendar_blocks',id,to_jsonb(calendar_blocks),jsonb_build_object('reason',input->>'reason') from calendar_blocks where id=(input->>'id')::uuid;
  delete from calendar_blocks where id=(input->>'id')::uuid returning id into result;
 elsif kind='resource' then
  insert into resources(id,name,kind,active) values(coalesce((input->>'id')::uuid,gen_random_uuid()),input->>'name',input->>'kind',coalesce((input->>'active')::boolean,true)) on conflict(id) do update set name=excluded.name,kind=excluded.kind,active=excluded.active returning id into result;
 elsif kind='settings' then
  rules:=input->'rules';
  if rules is null or not (rules ?& array['timezone','working_days','lead_time_days','cancellation_window_hours','pending_blocks','day_start','day_end','allow_future_usage','allow_carry_forward','max_advance_sessions','advance_policy','carry_forward_expiry_months']) or exists(select 1 from jsonb_each(rules) kv where kv.value='null'::jsonb and kv.key<>'max_advance_sessions') then raise exception 'Complete settings are required'; end if;
  if (rules->>'advance_policy')='numeric' and (rules->>'max_advance_sessions') is null then raise exception 'Numeric advance limit required'; end if;
  if not exists(select 1 from pg_timezone_names where name=rules->>'timezone') or jsonb_array_length(rules->'working_days') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(rules->'working_days') d where d::int not between 0 and 6) or (rules->>'lead_time_days')::int not between 0 and 90 or (rules->>'cancellation_window_hours')::int not between 0 and 720 or (rules->>'day_start')::int not between 0 and 23 or (rules->>'day_end')::int not between 1 and 23 or (rules->>'day_start')::int>=(rules->>'day_end')::int or (rules->>'advance_policy') not in ('numeric','unlimited','approval') or (rules->>'carry_forward_expiry_months')::int not between 1 and 24 then raise exception 'Invalid rules'; end if;
  -- Changing pending lock policy must not silently leave conflicting pending requests locked.
  if (rules->>'pending_blocks')::boolean then
   if exists(select 1 from bookings a join bookings b on a.id<>b.id and a.start_at<b.end_at and a.end_at>b.start_at and (a.resource_id is null or b.resource_id is null or a.resource_id=b.resource_id) where a.status='Pending Approval' and (b.slot_locked or b.status='Pending Approval')) or exists(select 1 from bookings a join calendar_blocks b on a.start_at<b.end_at and a.end_at>b.start_at and (a.resource_id is null or b.resource_id is null or a.resource_id=b.resource_id) where a.status='Pending Approval') then raise exception 'Resolve pending conflicts before enabling slot locks'; end if;
  end if;
  update bookings set slot_locked=(rules->>'pending_blocks')::boolean where status='Pending Approval';
  update system_settings set value=rules,updated_by=auth.uid(),updated_at=now() where key='booking_rules';
 elsif kind='template' then
  insert into notification_templates(event_type,channel,subject,body,enabled) values(input->>'event_type',input->>'channel',input->>'subject',input->>'body',coalesce((input->>'enabled')::boolean,true)) on conflict(event_type,channel) do update set subject=excluded.subject,body=excluded.body,enabled=excluded.enabled,updated_at=now() returning id into result;
 elsif kind='retry_notification' then
  update notifications set status='queued',failure_reason=null where id=(input->>'id')::uuid and status='failed' and channel<>'system' returning id into result;
 elsif kind='shooting_log' then
  update shooting_logs set actual_start=(input->>'actual_start')::timestamptz,actual_end=(input->>'actual_end')::timestamptz,production_notes=coalesce(input->>'production_notes',''),post_shoot_confirmed=coalesce((input->>'post_shoot_confirmed')::boolean,false),status='pending' where id=(input->>'id')::uuid returning id into result;
 else raise exception 'Unknown management action'; end if;
 return result;
end $$;

create function public.register_booking_file(input jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare b bookings; result uuid;
begin
 select * into b from bookings where id=(input->>'booking_id')::uuid for update;
 if b.id is null or not can_access(b.organization_id) then raise exception 'Not found'; end if;
 if (select count(*) from booking_files where booking_id=b.id)>=20 then raise exception 'Maximum 20 files per booking'; end if;
 if (input->>'storage_path') not like b.organization_id::text||'/'||b.id::text||'/%' then raise exception 'Invalid storage path'; end if;
 insert into booking_files(booking_id,file_name,storage_path,file_type,category,uploaded_by) values(b.id,input->>'file_name',input->>'storage_path',input->>'file_type',input->>'category',auth.uid()) returning id into result; return result;
end $$;

create function public.claim_notifications() returns setof public.notifications language plpgsql security definer set search_path=public as $$ begin
 return query update notifications set status='processing',attempts=attempts+1,locked_at=now() where id in (select id from notifications where channel<>'system' and (status='queued' or (status='processing' and locked_at<now()-interval '10 minutes')) order by created_at for update skip locked limit 25) returning *;
end $$;

-- Deny direct execution of all helpers, especially security-definer accounting functions.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.app_current_role(),public.current_org(),public.is_admin(),public.can_access(uuid) to authenticated;
grant execute on function public.calendar_availability(timestamptz,timestamptz),public.booking_timeline(uuid),public.session_balances(),public.create_booking_request(jsonb),public.booking_command(uuid,text,jsonb),public.manage_record(text,jsonb),public.register_booking_file(jsonb) to authenticated;
grant execute on all functions in schema public to service_role;
grant all on all tables in schema public to service_role;

insert into public.notification_templates(event_type,channel,subject,body) values
('Booking approved','email','Shooting Session Confirmed - Brill Creations','Hello {{client}}, your shooting session is confirmed.\nDate and time: {{start}}\nDuration: {{duration}} minutes\nLocation: {{location}}\nDoctor / Subject: {{subject}}\nCancellation deadline: {{cancellation_deadline}}. Any cancellation or rescheduling within {{cancellation_hours}} hours of the confirmed shooting time will count as a used session and be deducted from your applicable shooting allowance.\nPlease prepare your script, content plan and references before the session.\nView booking: {{link}}'),
('New booking request','whatsapp','New Shooting Booking Request','Client: {{client}}\nRequested Date: {{start}}\nDuration: {{duration}} minutes\nLocation: {{location}}\nSubject: {{subject}}\nScript: {{script}}\nStatus: Pending Approval\nReview booking: {{link}}');
