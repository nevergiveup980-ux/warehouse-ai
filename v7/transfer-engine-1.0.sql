-- V7 Transfer Engine 1.0 — engineering draft only.
create or replace function warehouse_v7.transfer_stock(
 p_tenant uuid,p_command uuid,p_stock_item uuid,p_expected_version bigint,
 p_to_location uuid,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare c warehouse_v7.command; s warehouse_v7.stock_item; out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
 c:=warehouse_v7.begin_command(p_tenant,p_command,'TRANSFER','stock_item',p_stock_item,p_expected_version,
   p_payload || jsonb_build_object('to_location_id',p_to_location),p_actor,p_device);
 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result); end if;

 perform 1 from warehouse_v7.location where tenant_id=p_tenant and id=p_to_location and lifecycle='active';
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_LOCATION');
   return jsonb_build_object('status','rejected','code','INVALID_LOCATION');
 end if;

 select * into s from warehouse_v7.stock_item where tenant_id=p_tenant and id=p_stock_item for update;
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'STOCK_NOT_FOUND');
   return jsonb_build_object('status','rejected','code','STOCK_NOT_FOUND');
 end if;
 if s.lifecycle<>'active' then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_STOCK_STATE');
   return jsonb_build_object('status','rejected','code','INVALID_STOCK_STATE');
 end if;
 if s.version<>p_expected_version then
   perform warehouse_v7.reject_command(p_tenant,p_command,'STALE_VERSION',jsonb_build_object('current_version',s.version));
   return jsonb_build_object('status','rejected','code','STALE_VERSION','current_version',s.version);
 end if;
 if s.location_id is not distinct from p_to_location then
   perform warehouse_v7.reject_command(p_tenant,p_command,'SAME_LOCATION');
   return jsonb_build_object('status','rejected','code','SAME_LOCATION');
 end if;

 update warehouse_v7.stock_item set location_id=p_to_location,version=version+1
 where tenant_id=p_tenant and id=p_stock_item;

 insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,movement_type,
 quantity,unit,from_location_id,to_location_id)
 values(p_tenant,p_command,s.product_id,p_stock_item,'TRANSFER',s.quantity,s.unit,s.location_id,p_to_location);

 insert into warehouse_v7.event(tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,p_command,'stock_item',p_stock_item,'TRANSFERRED',s.version+1,
 jsonb_build_object('from_location_id',s.location_id,'to_location_id',p_to_location,'quantity',s.quantity,'unit',s.unit));

 out_result:=jsonb_build_object('status','committed','stock_item_id',p_stock_item,
 'from_location_id',s.location_id,'to_location_id',p_to_location,'quantity',s.quantity,'unit',s.unit,'new_version',s.version+1);
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;
