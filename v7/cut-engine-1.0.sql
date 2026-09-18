-- V7 CUT Transaction Engine 1.0 — engineering draft only.
create or replace function warehouse_v7.cut_carpet_roll(
 p_tenant uuid,p_command uuid,p_roll uuid,p_expected_version bigint,
 p_deduct_sixteenths bigint,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare c warehouse_v7.command; r warehouse_v7.carpet_roll; new_remaining bigint; out_result jsonb;
begin
 if p_deduct_sixteenths<=0 then raise exception using errcode='22023',message='INVALID_CUT_LENGTH'; end if;

 c:=warehouse_v7.begin_command(p_tenant,p_command,'CUT','carpet_roll',p_roll,p_expected_version,
   p_payload || jsonb_build_object('deduct_sixteenths',p_deduct_sixteenths),p_actor,p_device);

 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result); end if;

 select * into r from warehouse_v7.carpet_roll
 where tenant_id=p_tenant and id=p_roll for update;
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'ROLL_NOT_FOUND');
   return jsonb_build_object('status','rejected','code','ROLL_NOT_FOUND');
 end if;
 if r.lifecycle<>'active' then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_ROLL_STATE');
   return jsonb_build_object('status','rejected','code','INVALID_ROLL_STATE');
 end if;
 if r.version<>p_expected_version then
   perform warehouse_v7.reject_command(p_tenant,p_command,'STALE_VERSION',
     jsonb_build_object('current_version',r.version,'remaining_sixteenths',r.remaining_sixteenths));
   return jsonb_build_object('status','rejected','code','STALE_VERSION','current_version',r.version);
 end if;
 if p_deduct_sixteenths>r.remaining_sixteenths then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INSUFFICIENT_ROLL_LENGTH',
     jsonb_build_object('remaining_sixteenths',r.remaining_sixteenths));
   return jsonb_build_object('status','rejected','code','INSUFFICIENT_ROLL_LENGTH');
 end if;

 new_remaining:=r.remaining_sixteenths-p_deduct_sixteenths;
 update warehouse_v7.carpet_roll set remaining_sixteenths=new_remaining,
   version=version+1,measure_status=case when new_remaining=0 then 'TM' else measure_status end,
   lifecycle=case when new_remaining=0 then 'consumed' else lifecycle end,updated_at=now()
 where tenant_id=p_tenant and id=p_roll;

 insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,carpet_roll_id,
   movement_type,quantity,unit,from_location_id)
 values(p_tenant,p_command,r.product_id,p_roll,'CUT_CONSUME',p_deduct_sixteenths,'1/16_IN',r.location_id);

 insert into warehouse_v7.event(tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,p_command,'carpet_roll',p_roll,'CUT',r.version+1,
   jsonb_build_object('before',r.remaining_sixteenths,'deducted',p_deduct_sixteenths,'after',new_remaining));

 out_result:=jsonb_build_object('status','committed','roll_id',p_roll,'roll_number',r.roll_number,
   'before_sixteenths',r.remaining_sixteenths,'deducted_sixteenths',p_deduct_sixteenths,
   'remaining_sixteenths',new_remaining,'new_version',r.version+1);
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;
