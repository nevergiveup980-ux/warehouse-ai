-- V7 Receiving Engine 1.0 — engineering draft only.
create or replace function warehouse_v7.receive_stock(
 p_tenant uuid,p_command uuid,p_product uuid,p_location uuid,p_quantity numeric,p_unit text,
 p_expected_stock_version bigint,p_stock_item uuid,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare c warehouse_v7.command; s warehouse_v7.stock_item; out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
 if p_quantity<=0 then raise exception using errcode='22023',message='INVALID_RECEIVE_QUANTITY'; end if;
 if nullif(trim(p_unit),'') is null then raise exception using errcode='22023',message='INVALID_UNIT'; end if;

 c:=warehouse_v7.begin_command(p_tenant,p_command,'RECEIVE','stock_item',p_stock_item,p_expected_stock_version,
   p_payload || jsonb_build_object('product_id',p_product,'location_id',p_location,'quantity',p_quantity,'unit',p_unit),
   p_actor,p_device);
 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result); end if;

 perform 1 from warehouse_v7.product where tenant_id=p_tenant and id=p_product and lifecycle='active';
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'PRODUCT_NOT_ACTIVE');
   return jsonb_build_object('status','rejected','code','PRODUCT_NOT_ACTIVE');
 end if;
 perform 1 from warehouse_v7.location where tenant_id=p_tenant and id=p_location and lifecycle='active';
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_LOCATION');
   return jsonb_build_object('status','rejected','code','INVALID_LOCATION');
 end if;

 select * into s from warehouse_v7.stock_item where tenant_id=p_tenant and id=p_stock_item for update;
 if found then
   if s.product_id<>p_product or s.location_id is distinct from p_location or s.unit<>p_unit then
     perform warehouse_v7.reject_command(p_tenant,p_command,'STOCK_IDENTITY_MISMATCH');
     return jsonb_build_object('status','rejected','code','STOCK_IDENTITY_MISMATCH');
   end if;
   if s.version<>p_expected_stock_version then
     perform warehouse_v7.reject_command(p_tenant,p_command,'STALE_VERSION',jsonb_build_object('current_version',s.version));
     return jsonb_build_object('status','rejected','code','STALE_VERSION','current_version',s.version);
   end if;
   update warehouse_v7.stock_item set quantity=quantity+p_quantity,version=version+1
    where tenant_id=p_tenant and id=p_stock_item;
 else
   if p_expected_stock_version<>0 then
     perform warehouse_v7.reject_command(p_tenant,p_command,'STOCK_NOT_FOUND');
     return jsonb_build_object('status','rejected','code','STOCK_NOT_FOUND');
   end if;
   insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version)
    values(p_tenant,p_stock_item,p_product,p_location,p_quantity,p_unit,1);
 end if;

 insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,movement_type,
 quantity,unit,to_location_id) values(p_tenant,p_command,p_product,p_stock_item,'RECEIVE',p_quantity,p_unit,p_location);

 insert into warehouse_v7.event(tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,p_command,'stock_item',p_stock_item,'RECEIVED',
   case when found then s.version+1 else 1 end,
   jsonb_build_object('quantity',p_quantity,'unit',p_unit,'location_id',p_location));

 out_result:=jsonb_build_object('status','committed','stock_item_id',p_stock_item,'received',p_quantity,
   'unit',p_unit,'new_version',case when s.id is null then 1 else s.version+1 end);
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;
