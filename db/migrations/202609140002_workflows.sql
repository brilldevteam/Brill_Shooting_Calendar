create function public.working_days_between(request_at timestamptz,shoot_at timestamptz,rules jsonb) returns integer language sql stable as $$
 select count(*)::integer from generate_series((request_at at time zone (rules->>'timezone'))::date+1,(shoot_at at time zone (rules->>'timezone'))::date-1,interval '1 day') d where (rules->'working_days') @> to_jsonb(extract(dow from d)::int)
$$;
create function public.validate_slot(cid uuid,starts timestamptz,ends timestamptz,urgent boolean,rid uuid,exclude_id uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare c contracts; r jsonb; day date; local_start timestamp; local_end timestamp;
begin
 select * into c from contracts where id=cid; select value into r from system_settings where key='booking_rules';
 if not found or c.id is null or c.status<>'active' then raise exception 'Active contract required'; end if;
 if not can_access(c.organization_id) then raise exception 'Forbidden'; end if;
 local_start:=starts at time zone (r->>'timezone'); local_end:=ends at time zone (r->>'timezone'); day:=local_start::date;
 if starts<=now() or ends<=starts or ends-starts>interval '12 hours' then raise exception 'Choose a future slot of at most 12 hours'; end if;
 if day<c.start_date or local_end::date>c.end_date then raise exception 'Outside contract dates'; end if;
 if urgent and not is_admin() then raise exception 'Urgent shoots require Brill Admin'; end if;
 if not urgent then
  if not ((r->'working_days') @> to_jsonb(extract(dow from day)::int)) then raise exception 'Non-working day'; end if;
  if working_days_between(now(),starts,r)<coalesce(c.lead_time_days,(r->>'lead_time_days')::int) then raise exception 'Insufficient full Brill working days. Contact Brill for urgent requirements.'; end if;
  if local_start::date<>local_end::date or extract(hour from local_start)<(r->>'day_start')::int or local_end::time>make_time((r->>'day_end')::int,0,0) then raise exception 'Outside production hours'; end if;
 end if;
 if rid is not null and not exists(select 1 from resources where id=rid and active) then raise exception 'Resource is unavailable'; end if;
 if exists(select 1 from bookings b where b.id is distinct from exclude_id and b.slot_locked and starts<b.end_at and ends>b.start_at and (rid is null or b.resource_id is null or b.resource_id=rid)) or exists(select 1 from calendar_blocks b where starts<b.end_at and ends>b.start_at and (rid is null or b.resource_id is null or b.resource_id=rid)) then raise exception 'This time is unavailable'; end if;
end $$;

create function public.record_session(b public.bookings,kind text,qty integer,reason_text text) returns void language plpgsql security definer set search_path=public as $$
declare before_balance integer;
begin
 before_balance:=contract_remaining(b.contract_id);
 insert into session_ledger(organization_id,contract_id,booking_id,allocation_month,session_source,transaction_type,quantity,balance_before,balance_after,reason,created_by) values(b.organization_id,b.contract_id,b.id,b.allocation_month,b.session_source,kind,qty,before_balance,before_balance+qty,reason_text,auth.uid());
end $$;

create function public.allocate_session(bid uuid,future_month date default null,exception_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare b bookings; c contracts; mon date; chosen date; source text; cf carry_forward; r jsonb; advance_count integer;
begin
 select * into b from bookings where id=bid for update; select * into c from contracts where id=b.contract_id for update;
 select value into r from system_settings where key='booking_rules';
 mon:=date_trunc('month',b.start_at at time zone (r->>'timezone'))::date; chosen:=mon; source:='current';
 if contract_remaining(c.id)<1 then raise exception 'Total contract entitlement exhausted'; end if;
 -- Spend eligible expiring carry-forward first. It remains attached to its source month.
 if c.allow_carry_forward and (r->>'allow_carry_forward')::boolean then
  select * into cf from carry_forward where contract_id=c.id and target_month<=mon and expires_at>=(b.start_at at time zone (r->>'timezone'))::date and used<amount order by expires_at for update limit 1;
 end if;
 if cf.id is not null and future_month is null then chosen:=cf.source_month; source:='carry'; update carry_forward set used=used+1 where id=cf.id;
 elsif month_remaining(c.id,mon)<1 or future_month is not null then
  if not is_admin() then raise exception 'Brill Admin must select a future allocation'; end if;
  if not c.allow_future_usage or not (r->>'allow_future_usage')::boolean then raise exception 'Future usage disabled'; end if;
  if future_month is null then raise exception 'Choose a future allocation month'; end if;
  chosen:=date_trunc('month',future_month)::date; source:='advance';
  if chosen<=mon or chosen>date_trunc('month',c.end_date)::date then raise exception 'Future month outside contract'; end if;
  select -coalesce(sum(quantity),0)::int into advance_count from session_ledger where contract_id=c.id and session_source='advance' and allocation_month>mon;
  if c.advance_policy='numeric' and advance_count>=coalesce(c.max_advance_sessions,0) then raise exception 'Maximum advance sessions reached'; end if;
  if (r->>'advance_policy')='numeric' and advance_count>=coalesce((r->>'max_advance_sessions')::int,0) then raise exception 'System maximum advance sessions reached'; end if;
  if (c.advance_policy='approval' or r->>'advance_policy'='approval') and length(trim(coalesce(exception_reason,'')))<3 then raise exception 'Admin approval reason required'; end if;
  if month_remaining(c.id,chosen)<1 then raise exception 'Selected month has no sessions remaining'; end if;
 end if;
 update bookings set allocation_month=chosen,session_source=source,carry_id=case when source='carry' then cf.id else null end where id=bid returning * into b;
 perform record_session(b,case when source='advance' then 'Advance Usage' else 'Reservation' end,-1,coalesce(nullif(exception_reason,''),'Session reserved on approval'));
end $$;

create function public.release_session(b public.bookings,reason_text text) returns void language plpgsql security definer set search_path=public as $$ begin
 if b.allocation_month is not null then
  perform record_session(b,'Restoration',1,reason_text);
  if b.carry_id is not null then update carry_forward set used=used-1 where id=b.carry_id; end if;
 end if;
end $$;

create function public.notify_booking(bid uuid,event_name text) returns void language plpgsql security definer set search_path=public as $$
declare b bookings; p profiles; org_name text; message jsonb; admin_event boolean;
begin
 select * into b from bookings where id=bid; select name into org_name from organizations where id=b.organization_id;
 admin_event:=event_name in ('New booking request','Reschedule requested','Cancellation','Late cancellation','Urgent booking');
 for p in select * from profiles where status='active' and ((admin_event and role in ('admin','super_admin')) or (organization_id=b.organization_id and role='client')) loop
  message:=jsonb_build_object('client',org_name,'start',b.start_at,'end',b.end_at,'location',b.location,'subject',b.subject,'duration',extract(epoch from b.end_at-b.start_at)/60,'script',case when exists(select 1 from booking_files where booking_id=b.id and category='script') then 'Uploaded' else 'Not Uploaded' end,'status',b.status,'email',p.email,'phone',p.phone,'booking_id',b.id,'cancellation_deadline',b.cancellation_deadline,'cancellation_hours',coalesce((select cancellation_window_hours from contracts where id=b.contract_id),(select (value->>'cancellation_window_hours')::int from system_settings where key='booking_rules')));
  insert into notifications(organization_id,booking_id,recipient_user_id,channel,event_type,status,payload,sent_at) values(b.organization_id,b.id,p.id,'system',event_name,'sent',message,now());
  if p.role<>'client' and admin_event then insert into notifications(organization_id,booking_id,recipient_user_id,channel,event_type,payload) values(b.organization_id,b.id,p.id,'whatsapp',event_name,message);
  else insert into notifications(organization_id,booking_id,recipient_user_id,channel,event_type,payload) values(b.organization_id,b.id,p.id,'email',event_name,message); end if;
 end loop;
end $$;

create function public.validate_entitlement(cid uuid,starts timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare c contracts; r jsonb; mon date; advances integer;
begin
 select * into c from contracts where id=cid; select value into r from system_settings where key='booking_rules';
 if c.id is null or not can_access(c.organization_id) then raise exception 'Forbidden'; end if;
 mon:=date_trunc('month',starts at time zone (r->>'timezone'))::date;
 if contract_remaining(cid)<1 then raise exception 'Total contract entitlement exhausted'; end if;
 if month_remaining(cid,mon)>0 then return; end if;
 if c.allow_carry_forward and (r->>'allow_carry_forward')::boolean and exists(select 1 from carry_forward where contract_id=cid and target_month<=mon and expires_at>=(starts at time zone (r->>'timezone'))::date and used<amount) then return; end if;
 if not c.allow_future_usage or not (r->>'allow_future_usage')::boolean then raise exception 'Monthly allowance exhausted'; end if;
 if not exists(select 1 from contract_month_allocations a where a.contract_id=cid and a.month>mon and month_remaining(cid,a.month)>0) then raise exception 'No future entitlement available'; end if;
 select -coalesce(sum(quantity),0)::int into advances from session_ledger where contract_id=cid and session_source='advance' and allocation_month>mon;
 if c.advance_policy='numeric' and advances>=coalesce(c.max_advance_sessions,0) then raise exception 'Maximum advance sessions reached'; end if;
 if r->>'advance_policy'='numeric' and advances>=coalesce((r->>'max_advance_sessions')::int,0) then raise exception 'System maximum advance sessions reached'; end if;
end $$;

create function public.create_booking_request(input jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare b bookings; cid uuid:=(input->>'contract_id')::uuid; c contracts; r jsonb; starts timestamptz:=(input->>'start_at')::timestamptz; ends timestamptz; urgent_flag boolean:=coalesce((input->>'urgent')::boolean,false); mon date; total integer;
begin
 if app_current_role() is null then raise exception 'Unauthorized'; end if;
 if input ?| array['balance_before','balance_after','quantity','allocation_month','future_month','session_source'] then raise exception 'Accounting fields are server controlled'; end if;
 perform pg_advisory_xact_lock(80914001);
 select * into b from bookings where idempotency_key=(input->>'idempotency_key')::uuid;
 if found then if b.created_by<>auth.uid() then raise exception 'Duplicate request'; end if; return b.id; end if;
 select * into c from contracts where id=cid for update;
 if c.id is null or not can_access(c.organization_id) or c.organization_id<>(input->>'organization_id')::uuid then raise exception 'Forbidden'; end if;
 if (select count(*) from bookings where created_by=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'Request limit reached. Please try later.'; end if;
 ends:=starts+make_interval(mins=>(input->>'duration_minutes')::int);
 if coalesce((input->>'duration_minutes')::int,0)<30 then raise exception 'Minimum duration is 30 minutes'; end if;
 if length(trim(input->>'location'))<2 or length(trim(input->>'subject'))<2 or length(trim(input->>'topics'))<3 or coalesce((input->>'expected_reels')::int,0)<1 then raise exception 'Complete production details'; end if;
 perform validate_slot(cid,starts,ends,urgent_flag,(input->>'resource_id')::uuid);
 select value into r from system_settings where key='booking_rules'; mon:=date_trunc('month',starts at time zone (r->>'timezone'))::date;
 perform validate_entitlement(cid,starts);
 insert into bookings(organization_id,contract_id,created_by,status,start_at,end_at,location,subject,expected_reels,topics,script_ready,content_plan_ready,equipment_requirements,additional_notes,shoot_type,resource_id,urgent,slot_locked,idempotency_key)
 values(c.organization_id,cid,auth.uid(),case when coalesce((input->>'draft')::boolean,false) then 'Draft'::booking_status else 'Pending Approval'::booking_status end,starts,ends,input->>'location',input->>'subject',(input->>'expected_reels')::int,input->>'topics',coalesce((input->>'script_ready')::boolean,false),coalesce((input->>'content_plan_ready')::boolean,false),coalesce(input->>'equipment_requirements',''),coalesce(input->>'additional_notes',''),coalesce(input->>'shoot_type','Content shoot'),(input->>'resource_id')::uuid,urgent_flag,coalesce((r->>'pending_blocks')::boolean,false) and not coalesce((input->>'draft')::boolean,false),(input->>'idempotency_key')::uuid) returning * into b;
 if b.status<>'Draft' then perform notify_booking(b.id,case when urgent_flag then 'Urgent booking' else 'New booking request' end); end if;
 return b.id;
end $$;

create function public.booking_command(bid uuid,command text,input jsonb default '{}') returns uuid language plpgsql security definer set search_path=public as $$
declare b bookings; c contracts; r jsonb; late boolean; exception_granted boolean:=coalesce((input->>'exception')::boolean,false); reason_text text:=trim(coalesce(input->>'reason','')); event_name text; new_start timestamptz; new_end timestamptz; logid uuid;
begin
 if app_current_role() is null then raise exception 'Unauthorized'; end if;
 perform pg_advisory_xact_lock(80914001);
 select * into b from bookings where id=bid for update;
 if b.id is null or not can_access(b.organization_id) then raise exception 'Not found'; end if;
 select * into c from contracts where id=b.contract_id for update; select value into r from system_settings where key='booking_rules';
 if command not in ('cancel','request_reschedule','submit_draft','accept_suggestion') and not is_admin() then raise exception 'Admin permission required'; end if;
 if exception_granted and (not is_admin() or length(reason_text)<3) then raise exception 'Admin exception requires a reason'; end if;
 late:=b.cancellation_deadline is not null and now()>b.cancellation_deadline;
 if command='submit_draft' then
  if b.status<>'Draft' then raise exception 'Only drafts can be submitted'; end if;
  perform validate_slot(c.id,b.start_at,b.end_at,b.urgent,b.resource_id,b.id);
  perform validate_entitlement(c.id,b.start_at);
  update bookings set status='Pending Approval',slot_locked=(r->>'pending_blocks')::boolean where id=bid; event_name:='New booking request';
 elsif command='approve' then
  if b.status<>'Pending Approval' then raise exception 'Only pending requests can be approved'; end if;
  if b.proposed_start is not null then raise exception 'Client must accept the suggested time first'; end if;
  -- Lead time was checked at request time. Approval must still validate contract and conflicts.
  perform validate_slot(c.id,b.start_at,b.end_at,true,b.resource_id,b.id);
  perform allocate_session(bid,(input->>'future_month')::date,nullif(reason_text,''));
  update bookings set status=case when urgent then 'Urgent Shoot'::booking_status else 'Confirmed'::booking_status end,slot_locked=true,approved_at=now(),cancellation_deadline=start_at-make_interval(hours=>coalesce(c.cancellation_window_hours,(r->>'cancellation_window_hours')::int)) where id=bid; event_name:='Booking approved';
 elsif command='reject' then
  if b.status<>'Pending Approval' or length(reason_text)<3 then raise exception 'Pending request and rejection reason required'; end if;
  update bookings set status='Rejected',slot_locked=false,change_reason=reason_text where id=bid; event_name:='Booking rejected';
 elsif command='suggest' then
  if b.status<>'Pending Approval' or length(reason_text)<3 then raise exception 'Pending request and reason required'; end if;
  new_start:=(input->>'start_at')::timestamptz; new_end:=new_start+make_interval(mins=>(input->>'duration_minutes')::int);
  if new_start is null or new_end is null then raise exception 'Proposed time required'; end if;
  perform validate_slot(c.id,new_start,new_end,true,b.resource_id,b.id);
  update bookings set proposed_start=new_start,proposed_end=new_end,change_reason=reason_text where id=bid; event_name:='Alternative time suggested';
 elsif command='accept_suggestion' then
  if b.status<>'Pending Approval' or b.proposed_start is null then raise exception 'No alternative time awaiting acceptance'; end if;
  if not is_admin() and b.organization_id<>current_org() then raise exception 'Forbidden'; end if;
  -- A suggested urgent time is admin-authorized, but still pending approval.
  if exists(select 1 from bookings x where x.id<>bid and x.slot_locked and x.start_at<b.proposed_end and x.end_at>b.proposed_start and (x.resource_id is null or b.resource_id is null or x.resource_id=b.resource_id)) then raise exception 'Suggested slot is no longer available'; end if;
  update bookings set start_at=proposed_start,end_at=proposed_end,proposed_start=null,proposed_end=null where id=bid; event_name:='New booking request';
 elsif command='edit' then
  if b.status<>'Pending Approval' then raise exception 'Edit pending requests; use rescheduling for confirmed shoots'; end if;
  new_end:=b.start_at+make_interval(mins=>coalesce((input->>'duration_minutes')::int,extract(epoch from b.end_at-b.start_at)::int/60));
  perform validate_slot(c.id,b.start_at,new_end,true,b.resource_id,b.id);
  update bookings set end_at=new_end,location=coalesce(nullif(input->>'location',''),location),subject=coalesce(nullif(input->>'subject',''),subject),additional_notes=coalesce(input->>'additional_notes',additional_notes) where id=bid; event_name:='Booking edited';
 elsif command='cancel' then
  if b.status not in ('Draft','Pending Approval','Confirmed','Urgent Shoot','Reschedule Requested') then raise exception 'Booking cannot be cancelled in this status'; end if;
  if length(reason_text)<3 then raise exception 'Cancellation reason required'; end if;
  if late and not exception_granted and not coalesce((input->>'acknowledged')::boolean,false) then raise exception 'Acknowledge the session deduction'; end if;
  if b.allocation_month is not null then
   if late and not exception_granted then perform record_session(b,'Late Cancellation',0,reason_text); else perform release_session(b,reason_text); end if;
  end if;
  update bookings set status=case when late and not exception_granted then 'Late Cancellation'::booking_status else 'Cancelled On Time'::booking_status end,slot_locked=false,change_reason=reason_text where id=bid; event_name:=case when late and not exception_granted then 'Late cancellation' else 'Cancellation' end;
 elsif command='request_reschedule' then
  if b.status not in ('Confirmed','Urgent Shoot') or length(reason_text)<3 then raise exception 'Confirmed booking and reschedule reason required'; end if;
  if late and not exception_granted and not coalesce((input->>'acknowledged')::boolean,false) then raise exception 'Acknowledge the session deduction'; end if;
  new_start:=(input->>'start_at')::timestamptz; new_end:=new_start+make_interval(mins=>(input->>'duration_minutes')::int);
  if new_start is null or new_end is null then raise exception 'New schedule required'; end if;
  perform validate_slot(c.id,new_start,new_end,is_admin() and b.urgent,b.resource_id,b.id);
  update bookings set status='Reschedule Requested',proposed_start=new_start,proposed_end=new_end,late_change=late and not exception_granted,change_reason=reason_text where id=bid; event_name:='Reschedule requested';
 elsif command='approve_reschedule' then
  if b.status<>'Reschedule Requested' then raise exception 'No reschedule request'; end if;
  perform validate_slot(c.id,b.proposed_start,b.proposed_end,true,b.resource_id,b.id);
  if b.late_change and not exception_granted then perform record_session(b,'Late Cancellation',0,'Late reschedule: '||b.change_reason); else perform release_session(b,'Rescheduled: '||coalesce(b.change_reason,'')); end if;
  update bookings set start_at=proposed_start,end_at=proposed_end,allocation_month=null,session_source=null,carry_id=null where id=bid;
  perform allocate_session(bid,(input->>'future_month')::date,nullif(reason_text,''));
  update bookings set status=case when urgent then 'Urgent Shoot'::booking_status else 'Confirmed'::booking_status end,proposed_start=null,proposed_end=null,slot_locked=true,cancellation_deadline=start_at-make_interval(hours=>coalesce(c.cancellation_window_hours,(r->>'cancellation_window_hours')::int)) where id=bid; event_name:='Booking approved';
 elsif command='decline_reschedule' then
  if b.status<>'Reschedule Requested' or length(reason_text)<3 then raise exception 'Reschedule request and reason required'; end if;
  update bookings set status=case when urgent then 'Urgent Shoot'::booking_status else 'Confirmed'::booking_status end,proposed_start=null,proposed_end=null,late_change=false,change_reason=reason_text where id=bid; event_name:='Reschedule declined';
 elsif command in ('complete','no_show') then
  if b.status not in ('Confirmed','Urgent Shoot') or b.start_at>now() then raise exception 'Shoot must have started and be confirmed'; end if;
  perform record_session(b,case when command='complete' then 'Usage' else 'No Show' end,0,coalesce(nullif(reason_text,''),command));
  update bookings set status=case when command='complete' then 'Completed'::booking_status else 'No Show'::booking_status end,slot_locked=false where id=bid;
  if command='complete' then
   insert into shooting_logs(booking_id,organization_id,payload) values(bid,b.organization_id,jsonb_build_object('source_booking_reference',bid,'client_account',b.organization_id,'shoot_date',b.start_at,'shoot_confirmation_date',b.approved_at,'planned_start',b.start_at,'planned_end',b.end_at,'location',b.location,'subject',b.subject,'shoot_type',case when b.urgent then 'Urgent' else b.shoot_type end,'script_received',(select min(uploaded_at) from booking_files where booking_id=bid and category='script'),'content_plan_received',(select min(uploaded_at) from booking_files where booking_id=bid and category='content_plan'),'supporting_documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'path',storage_path,'category',category)) from booking_files where booking_id=bid),'[]'::jsonb))) returning id into logid;
   update bookings set shooting_log_id=logid where id=bid;
  end if; event_name:=case when command='complete' then 'Booking completed' else 'No show' end;
 else raise exception 'Unknown booking command'; end if;
 update bookings set updated_at=now() where id=bid;
 if exception_granted then insert into audit_logs(organization_id,booking_id,actor_user_id,action,entity_type,entity_id,metadata) values(b.organization_id,bid,auth.uid(),'Admin exception','bookings',bid,jsonb_build_object('reason',reason_text,'command',command)); perform notify_booking(bid,'Admin exception'); end if;
 perform notify_booking(bid,event_name); return bid;
end $$;
