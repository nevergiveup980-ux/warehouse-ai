-- V7 Carpet Return Engine 1.0 — compensating child-roll transaction.
-- A returned carpet piece is a new physical roll identity. The source lineage roll is never enlarged.

create or replace function warehouse_v7.return_carpet_piece(
 p_tenant uuid,p_command uuid,p_source_roll uuid,p_new_roll uuid,p_new_roll_number text,
 p_return_sixteenths bigint,p_to_location uuid,p_original_out_command uuid,
 p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare
 c warehouse_v7.command;
 src warehouse_v7.carpet_roll;
 shipped numeric;
 already_returned numeric;
 out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
 if p_return_sixteenths<=0 then
   raise exception using errcode='22023',message='INVALID_RETURN_LENGTH';
 end if;
 if nullif(trim(p_new_roll_number),'') is null then
   raise exception using errcode='22023',message='RETURN_ROLL_NUMBER_REQUIRED';
 end if;
 if p_source_roll=p_new_roll then
   raise exception using errcode='22023',message='SOURCE_RETURN_ROLL_SAME_ENTITY';
 end if;

 c:=warehouse_v7.begin_command(
   p_tenant,p_command,'CARPET_RETURN','carpet_roll',p_new_roll,0,
   p_payload || jsonb_build_object(
     'source_roll_id',p_source_roll,
     'new_roll_number',p_new_roll_number,
     'return_sixteenths',p_return_sixteenths,
     'to_location_id',p_to_location,
     'original_out_command',p_original_out_command
   ),p_actor,p_device
 );
 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then
   return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result);
 end if;

 perform 1 from warehouse_v7.location
 where tenant_id=p_tenant and id=p_to_location and lifecycle='active';
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_LOCATION');
   return jsonb_build_object('status','rejected','code','INVALID_LOCATION');
 end if;

 select * into src from warehouse_v7.carpet_roll
 where tenant_id=p_tenant and id=p_source_roll;
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'SOURCE_ROLL_NOT_FOUND');
   return jsonb_build_object('status','rejected','code','SOURCE_ROLL_NOT_FOUND');
 end if;

 perform 1 from warehouse_v7.carpet_roll
 where tenant_id=p_tenant and (id=p_new_roll or roll_number=p_new_roll_number);
 if found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'RETURN_ROLL_ALREADY_EXISTS');
   return jsonb_build_object('status','rejected','code','RETURN_ROLL_ALREADY_EXISTS');
 end if;

 select coalesce(sum(quantity),0) into shipped
 from warehouse_v7.inventory_movement
 where tenant_id=p_tenant
   and command_id=p_original_out_command
   and carpet_roll_id=p_source_roll
   and movement_type in ('CARPET_OUT','CARPET_TRANSFER','CARPET_PIECE_OUT','CARPET_SHIP');

 if shipped=0 then
   perform warehouse_v7.reject_command(p_tenant,p_command,'ORIGINAL_CARPET_OUT_NOT_FOUND');
   return jsonb_build_object('status','rejected','code','ORIGINAL_CARPET_OUT_NOT_FOUND');
 end if;

 select coalesce(sum(m.quantity),0) into already_returned
 from warehouse_v7.inventory_movement m
 join warehouse_v7.command rc
   on rc.tenant_id=m.tenant_id and rc.id=m.command_id
 where m.tenant_id=p_tenant
   and m.movement_type='CARPET_RETURN'
   and rc.payload->>'original_out_command'=p_original_out_command::text;

 if already_returned+p_return_sixteenths>shipped then
   perform warehouse_v7.reject_command(
     p_tenant,p_command,'CARPET_RETURN_EXCEEDS_OUT',
     jsonb_build_object('out_sixteenths',shipped,'already_returned_sixteenths',already_returned)
   );
   return jsonb_build_object('status','rejected','code','CARPET_RETURN_EXCEEDS_OUT');
 end if;

 insert into warehouse_v7.carpet_roll(
   tenant_id,id,roll_number,physical_key,manufacturer_roll,source_roll,
   product_id,location_id,original_sixteenths,remaining_sixteenths,
   measure_status,version,lifecycle,legacy_record_id
 ) values(
   p_tenant,p_new_roll,p_new_roll_number,'v7:return:'||p_new_roll::text,
   src.manufacturer_roll,src.roll_number,src.product_id,p_to_location,
   p_return_sixteenths,p_return_sixteenths,'TM',1,'active',null
 );

 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,carpet_roll_id,movement_type,
   quantity,unit,to_location_id
 ) values(
   p_tenant,p_command,src.product_id,p_new_roll,'CARPET_RETURN',
   p_return_sixteenths,'1/16_IN',p_to_location
 );

 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
 ) values(
   p_tenant,p_command,'carpet_roll',p_new_roll,'CARPET_PIECE_RETURNED',1,
   jsonb_build_object(
     'source_roll_id',p_source_roll,'source_roll_number',src.roll_number,
     'original_out_command',p_original_out_command,
     'returned_sixteenths',p_return_sixteenths,
     'to_location_id',p_to_location,'measure_status','TM'
   )
 );

 out_result:=jsonb_build_object(
   'status','committed','new_roll_id',p_new_roll,'new_roll_number',p_new_roll_number,
   'source_roll_id',p_source_roll,'source_roll_number',src.roll_number,
   'returned_sixteenths',p_return_sixteenths,'to_location_id',p_to_location,
   'measure_status','TM','new_version',1
 );
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;
