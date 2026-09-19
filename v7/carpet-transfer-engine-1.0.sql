-- V7 Carpet Transfer Engine 1.0 — engineering draft only.
-- Supports whole-roll movement and partial-piece transfer without merging carpet identities.

create or replace function warehouse_v7.transfer_carpet_roll(
 p_tenant uuid,p_command uuid,p_roll uuid,p_expected_version bigint,
 p_to_location uuid,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare
 c warehouse_v7.command;
 r warehouse_v7.carpet_roll;
 out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);

 c:=warehouse_v7.begin_command(
   p_tenant,p_command,'CARPET_TRANSFER','carpet_roll',p_roll,p_expected_version,
   p_payload || jsonb_build_object('mode','whole_roll','to_location_id',p_to_location),
   p_actor,p_device
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
   perform warehouse_v7.reject_command(
     p_tenant,p_command,'STALE_VERSION',
     jsonb_build_object('current_version',r.version)
   );
   return jsonb_build_object('status','rejected','code','STALE_VERSION','current_version',r.version);
 end if;
 if r.location_id is not distinct from p_to_location then
   perform warehouse_v7.reject_command(p_tenant,p_command,'SAME_LOCATION');
   return jsonb_build_object('status','rejected','code','SAME_LOCATION');
 end if;

 update warehouse_v7.carpet_roll
 set location_id=p_to_location,version=version+1,updated_at=now()
 where tenant_id=p_tenant and id=p_roll;

 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,carpet_roll_id,movement_type,
   quantity,unit,from_location_id,to_location_id
 ) values(
   p_tenant,p_command,r.product_id,p_roll,'CARPET_TRANSFER',
   r.remaining_sixteenths,'1/16_IN',r.location_id,p_to_location
 );

 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
 ) values(
   p_tenant,p_command,'carpet_roll',p_roll,'CARPET_TRANSFERRED',r.version+1,
   jsonb_build_object(
     'mode','whole_roll','roll_number',r.roll_number,
     'from_location_id',r.location_id,'to_location_id',p_to_location,
     'remaining_sixteenths',r.remaining_sixteenths
   )
 );

 out_result:=jsonb_build_object(
   'status','committed','mode','whole_roll',
   'roll_id',p_roll,'roll_number',r.roll_number,
   'from_location_id',r.location_id,'to_location_id',p_to_location,
   'remaining_sixteenths',r.remaining_sixteenths,
   'new_version',r.version+1
 );
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;


create or replace function warehouse_v7.transfer_carpet_piece(
 p_tenant uuid,p_command uuid,p_source_roll uuid,p_expected_source_version bigint,
 p_child_roll uuid,p_child_roll_number text,p_transfer_sixteenths bigint,
 p_to_location uuid,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare
 c warehouse_v7.command;
 src warehouse_v7.carpet_roll;
 source_after bigint;
 out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
 if p_transfer_sixteenths<=0 then
   raise exception using errcode='22023',message='INVALID_TRANSFER_LENGTH';
 end if;
 if nullif(trim(p_child_roll_number),'') is null then
   raise exception using errcode='22023',message='CHILD_ROLL_NUMBER_REQUIRED';
 end if;
 if p_source_roll=p_child_roll then
   raise exception using errcode='22023',message='SOURCE_CHILD_ROLL_SAME_ENTITY';
 end if;

 c:=warehouse_v7.begin_command(
   p_tenant,p_command,'CARPET_TRANSFER_PIECE','carpet_roll',p_source_roll,p_expected_source_version,
   p_payload || jsonb_build_object(
     'mode','partial_piece',
     'child_roll_id',p_child_roll,
     'child_roll_number',p_child_roll_number,
     'transfer_sixteenths',p_transfer_sixteenths,
     'to_location_id',p_to_location
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
 where tenant_id=p_tenant and id=p_source_roll for update;
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'ROLL_NOT_FOUND');
   return jsonb_build_object('status','rejected','code','ROLL_NOT_FOUND');
 end if;
 if src.lifecycle<>'active' then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_ROLL_STATE');
   return jsonb_build_object('status','rejected','code','INVALID_ROLL_STATE');
 end if;
 if src.version<>p_expected_source_version then
   perform warehouse_v7.reject_command(
     p_tenant,p_command,'STALE_VERSION',
     jsonb_build_object('current_version',src.version,'remaining_sixteenths',src.remaining_sixteenths)
   );
   return jsonb_build_object('status','rejected','code','STALE_VERSION','current_version',src.version);
 end if;
 if p_transfer_sixteenths>=src.remaining_sixteenths then
   perform warehouse_v7.reject_command(
     p_tenant,p_command,'PIECE_TRANSFER_REQUIRES_PARTIAL_LENGTH',
     jsonb_build_object('remaining_sixteenths',src.remaining_sixteenths)
   );
   return jsonb_build_object('status','rejected','code','PIECE_TRANSFER_REQUIRES_PARTIAL_LENGTH');
 end if;

 perform 1 from warehouse_v7.carpet_roll
 where tenant_id=p_tenant and (id=p_child_roll or roll_number=p_child_roll_number);
 if found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'CHILD_ROLL_ALREADY_EXISTS');
   return jsonb_build_object('status','rejected','code','CHILD_ROLL_ALREADY_EXISTS');
 end if;

 source_after:=src.remaining_sixteenths-p_transfer_sixteenths;

 update warehouse_v7.carpet_roll
 set remaining_sixteenths=source_after,version=version+1,updated_at=now()
 where tenant_id=p_tenant and id=p_source_roll;

 insert into warehouse_v7.carpet_roll(
   tenant_id,id,roll_number,physical_key,manufacturer_roll,source_roll,
   product_id,location_id,original_sixteenths,remaining_sixteenths,
   measure_status,version,lifecycle,legacy_record_id
 ) values(
   p_tenant,p_child_roll,p_child_roll_number,'v7:piece:'||p_child_roll::text,
   src.manufacturer_roll,src.roll_number,src.product_id,p_to_location,
   p_transfer_sixteenths,p_transfer_sixteenths,'TM',1,'active',null
 );

 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,carpet_roll_id,movement_type,
   quantity,unit,from_location_id,to_location_id
 ) values(
   p_tenant,p_command,src.product_id,p_source_roll,'CARPET_PIECE_OUT',
   p_transfer_sixteenths,'1/16_IN',src.location_id,p_to_location
 );
 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,carpet_roll_id,movement_type,
   quantity,unit,from_location_id,to_location_id
 ) values(
   p_tenant,p_command,src.product_id,p_child_roll,'CARPET_PIECE_IN',
   p_transfer_sixteenths,'1/16_IN',src.location_id,p_to_location
 );

 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
 ) values(
   p_tenant,p_command,'carpet_roll',p_source_roll,'CARPET_PIECE_TRANSFERRED_OUT',src.version+1,
   jsonb_build_object(
     'child_roll_id',p_child_roll,'child_roll_number',p_child_roll_number,
     'before_sixteenths',src.remaining_sixteenths,
     'transferred_sixteenths',p_transfer_sixteenths,
     'after_sixteenths',source_after,
     'from_location_id',src.location_id,'to_location_id',p_to_location,
     'advisory',case when src.source_roll is not null then 'REMNANT_WHOLE_ROLL_PREFERRED' else null end
   )
 );
 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
 ) values(
   p_tenant,p_command,'carpet_roll',p_child_roll,'CARPET_PIECE_TRANSFERRED_IN',1,
   jsonb_build_object(
     'source_roll_id',p_source_roll,'source_roll_number',src.roll_number,
     'remaining_sixteenths',p_transfer_sixteenths,
     'from_location_id',src.location_id,'to_location_id',p_to_location,
     'measure_status','TM'
   )
 );

 out_result:=jsonb_build_object(
   'status','committed','mode','partial_piece',
   'source_roll_id',p_source_roll,'source_roll_number',src.roll_number,
   'child_roll_id',p_child_roll,'child_roll_number',p_child_roll_number,
   'from_location_id',src.location_id,'to_location_id',p_to_location,
   'source_before_sixteenths',src.remaining_sixteenths,
   'transferred_sixteenths',p_transfer_sixteenths,
   'source_remaining_sixteenths',source_after,
   'source_new_version',src.version+1,'child_version',1,
   'advisory',case when src.source_roll is not null then 'REMNANT_WHOLE_ROLL_PREFERRED' else null end
 );
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;
