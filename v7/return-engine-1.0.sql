-- V7 Return Engine 1.0 — compensating transaction; engineering draft only.
create or replace function warehouse_v7.return_stock(
 p_tenant uuid,p_command uuid,p_stock_item uuid,p_expected_version bigint,
 p_quantity numeric,p_unit text,p_to_location uuid,p_original_ship_command uuid,
 p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare c warehouse_v7.command; s warehouse_v7.stock_item; shipped numeric; returned numeric; out_result jsonb;
begin
 if p_quantity<=0 then raise exception using errcode='22023',message='INVALID_RETURN_QUANTITY'; end if;

 c:=warehouse_v7.begin_command(p_tenant,p_command,'RETURN','stock_item',p_stock_item,p_expected_version,
   p_payload || jsonb_build_object('quantity',p_quantity,'unit',p_unit,'to_location_id',p_to_location,
   'original_ship_command',p_original_ship_command),p_actor,p_device);
 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result); end if;

 perform 1 from warehouse_v7.location where tenant_id=p_tenant and id=p_to_location and lifecycle='active';
 if not found then perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_LOCATION');
 return jsonb_build_object('status','rejected','code','INVALID_LOCATION'); end if;

 select coalesce(sum(quantity),0) into shipped from warehouse_v7.inventory_movement
 where tenant_id=p_tenant and command_id=p_original_ship_command and stock_item_id=p_stock_item and movement_type='SHIP';
 if shipped=0 then perform warehouse_v7.reject_command(p_tenant,p_command,'ORIGINAL_SHIPMENT_NOT_FOUND');
 return jsonb_build_object('status','rejected','code','ORIGINAL_SHIPMENT_NOT_FOUND'); end if;

 select coalesce(sum(quantity),0) into returned from warehouse_v7.inventory_movement
 where tenant_id=p_tenant and stock_item_id=p_stock_item and movement_type='RETURN'
 and (command_id in (select id from warehouse_v7.command where tenant_id=p_tenant
   and payload->>'original_ship_command'=p_original_ship_command::text));
 if returned+p_quantity>shipped then perform warehouse_v7.reject_command(p_tenant,p_command,'RETURN_EXCEEDS_SHIPPED',
 jsonb_build_object('shipped',shipped,'already_returned',returned));
 return jsonb_build_object('status','rejected','code','RETURN_EXCEEDS_SHIPPED'); end if;

 select * into s from warehouse_v7.stock_item where tenant_id=p_tenant and id=p_stock_item for update;
 if not found then perform warehouse_v7.reject_command(p_tenant,p_command,'STOCK_NOT_FOUND');
 return jsonb_build_object('status','rejected','code','STOCK_NOT_FOUND'); end if;
 if s.unit<>p_unit then perform warehouse_v7.reject_command(p_tenant,p_command,'UNIT_MISMATCH');
 return jsonb_build_object('status','rejected','code','UNIT_MISMATCH'); end if;
 if s.version<>p_expected_version then perform warehouse_v7.reject_command(p_tenant,p_command,'STALE_VERSION');
 return jsonb_build_object('status','rejected','code','STALE_VERSION'); end if;

 update warehouse_v7.stock_item set quantity=quantity+p_quantity,location_id=p_to_location,
 lifecycle='active',version=version+1 where tenant_id=p_tenant and id=p_stock_item;

 insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,movement_type,
 quantity,unit,to_location_id) values(p_tenant,p_command,s.product_id,p_stock_item,'RETURN',p_quantity,p_unit,p_to_location);

 insert into warehouse_v7.event(tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,p_command,'stock_item',p_stock_item,'RETURNED',s.version+1,
 jsonb_build_object('original_ship_command',p_original_ship_command,'returned',p_quantity,'unit',p_unit,'to_location_id',p_to_location));

 out_result:=jsonb_build_object('status','committed','stock_item_id',p_stock_item,'returned',p_quantity,
 'unit',p_unit,'original_ship_command',p_original_ship_command,'new_version',s.version+1);
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result); return out_result;
end $$;
