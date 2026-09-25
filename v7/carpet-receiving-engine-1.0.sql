-- V7 Carpet Receiving Engine 1.0 — operational create path for new products and full rolls.
create or replace function warehouse_v7.create_product(
 p_tenant uuid,p_command uuid,p_product uuid,p_name text,p_colour text,p_sku text,
 p_base_unit text,p_coverage_unit text,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare c warehouse_v7.command; out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
 if nullif(trim(p_name),'') is null then raise exception using errcode='22023',message='INVALID_PRODUCT_NAME'; end if;
 if nullif(trim(p_base_unit),'') is null then raise exception using errcode='22023',message='INVALID_BASE_UNIT'; end if;
 c:=warehouse_v7.begin_command(p_tenant,p_command,'CREATE_PRODUCT','product',p_product,0,
   coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('name',trim(p_name),'colour',nullif(trim(p_colour),''),
   'sku',nullif(trim(p_sku),''),'base_unit',p_base_unit,'coverage_unit',nullif(trim(p_coverage_unit),'')),p_actor,p_device);
 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result); end if;
 if exists(select 1 from warehouse_v7.product where tenant_id=p_tenant and id=p_product) then
   perform warehouse_v7.reject_command(p_tenant,p_command,'PRODUCT_ID_EXISTS');
   return jsonb_build_object('status','rejected','code','PRODUCT_ID_EXISTS');
 end if;
 insert into warehouse_v7.product(tenant_id,id,sku,name,colour,base_unit,coverage_unit,version,lifecycle)
 values(p_tenant,p_product,nullif(trim(p_sku),''),trim(p_name),nullif(trim(p_colour),''),p_base_unit,nullif(trim(p_coverage_unit),''),1,'active');
 insert into warehouse_v7.event(tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,p_command,'product',p_product,'PRODUCT_CREATED',1,
   jsonb_build_object('name',trim(p_name),'colour',nullif(trim(p_colour),''),'sku',nullif(trim(p_sku),''),'base_unit',p_base_unit));
 out_result:=jsonb_build_object('status','committed','product_id',p_product,'new_version',1);
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result); return out_result;
end $$;

create or replace function warehouse_v7.receive_carpet_roll(
 p_tenant uuid,p_command uuid,p_roll uuid,p_roll_number text,p_manufacturer_roll text,p_product uuid,
 p_location uuid,p_original_sixteenths bigint,p_measure_status text,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare c warehouse_v7.command; out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
 if nullif(trim(p_roll_number),'') is null then raise exception using errcode='22023',message='INVALID_ROLL_NUMBER'; end if;
 if p_original_sixteenths<=0 then raise exception using errcode='22023',message='INVALID_ROLL_LENGTH'; end if;
 if p_measure_status not in ('FULL','CAL','TM') then raise exception using errcode='22023',message='INVALID_MEASURE_STATUS'; end if;
 c:=warehouse_v7.begin_command(p_tenant,p_command,'RECEIVE_CARPET','carpet_roll',p_roll,0,
   coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('roll_number',trim(p_roll_number),'manufacturer_roll',nullif(trim(p_manufacturer_roll),''),
   'product_id',p_product,'location_id',p_location,'original_sixteenths',p_original_sixteenths,'measure_status',p_measure_status),p_actor,p_device);
 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result); end if;
 perform 1 from warehouse_v7.product where tenant_id=p_tenant and id=p_product and lifecycle='active';
 if not found then perform warehouse_v7.reject_command(p_tenant,p_command,'PRODUCT_NOT_ACTIVE'); return jsonb_build_object('status','rejected','code','PRODUCT_NOT_ACTIVE'); end if;
 perform 1 from warehouse_v7.location where tenant_id=p_tenant and id=p_location and lifecycle='active';
 if not found then perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_LOCATION'); return jsonb_build_object('status','rejected','code','INVALID_LOCATION'); end if;
 if exists(select 1 from warehouse_v7.carpet_roll where tenant_id=p_tenant and id=p_roll) then
   perform warehouse_v7.reject_command(p_tenant,p_command,'ROLL_ID_EXISTS'); return jsonb_build_object('status','rejected','code','ROLL_ID_EXISTS'); end if;
 if exists(select 1 from warehouse_v7.carpet_roll where tenant_id=p_tenant and roll_number=trim(p_roll_number) and lifecycle='active') then
   perform warehouse_v7.reject_command(p_tenant,p_command,'ACTIVE_ROLL_NUMBER_EXISTS'); return jsonb_build_object('status','rejected','code','ACTIVE_ROLL_NUMBER_EXISTS'); end if;
 if nullif(trim(p_manufacturer_roll),'') is not null and exists(select 1 from warehouse_v7.carpet_roll where tenant_id=p_tenant and manufacturer_roll=trim(p_manufacturer_roll) and lifecycle='active') then
   perform warehouse_v7.reject_command(p_tenant,p_command,'ACTIVE_MANUFACTURER_ROLL_EXISTS'); return jsonb_build_object('status','rejected','code','ACTIVE_MANUFACTURER_ROLL_EXISTS'); end if;
 insert into warehouse_v7.carpet_roll(tenant_id,id,roll_number,manufacturer_roll,product_id,location_id,
   original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle)
 values(p_tenant,p_roll,trim(p_roll_number),nullif(trim(p_manufacturer_roll),''),p_product,p_location,
   p_original_sixteenths,p_original_sixteenths,p_measure_status,1,'active');
 insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,carpet_roll_id,movement_type,quantity,unit,to_location_id)
 values(p_tenant,p_command,p_product,p_roll,'RECEIVE_CARPET',p_original_sixteenths,'1/16_IN',p_location);
 insert into warehouse_v7.event(tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,p_command,'carpet_roll',p_roll,'CARPET_RECEIVED',1,
   jsonb_build_object('roll_number',trim(p_roll_number),'manufacturer_roll',nullif(trim(p_manufacturer_roll),''),
   'original_sixteenths',p_original_sixteenths,'location_id',p_location,'measure_status',p_measure_status));
 out_result:=jsonb_build_object('status','committed','roll_id',p_roll,'roll_number',trim(p_roll_number),'new_version',1);
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result); return out_result;
end $$;
