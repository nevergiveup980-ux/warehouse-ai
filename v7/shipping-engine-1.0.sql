-- V7 Shipping Engine 1.0 — engineering draft only.
create or replace function warehouse_v7.ship_stock(
 p_tenant uuid,p_command uuid,p_stock_item uuid,p_expected_version bigint,
 p_quantity numeric,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare c warehouse_v7.command; s warehouse_v7.stock_item; new_qty numeric; out_result jsonb;
begin
 if p_quantity<=0 then raise exception using errcode='22023',message='INVALID_SHIP_QUANTITY'; end if;

 c:=warehouse_v7.begin_command(p_tenant,p_command,'SHIP','stock_item',p_stock_item,p_expected_version,
   p_payload || jsonb_build_object('quantity',p_quantity),p_actor,p_device);
 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result); end if;

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
 if p_quantity>s.quantity then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INSUFFICIENT_STOCK',jsonb_build_object('available',s.quantity,'unit',s.unit));
   return jsonb_build_object('status','rejected','code','INSUFFICIENT_STOCK','available',s.quantity,'unit',s.unit);
 end if;

 new_qty:=s.quantity-p_quantity;
 update warehouse_v7.stock_item set quantity=new_qty,version=version+1,
   lifecycle=case when new_qty=0 then 'consumed' else lifecycle end
 where tenant_id=p_tenant and id=p_stock_item;

 insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,movement_type,
 quantity,unit,from_location_id)
 values(p_tenant,p_command,s.product_id,p_stock_item,'SHIP',p_quantity,s.unit,s.location_id);

 insert into warehouse_v7.event(tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,p_command,'stock_item',p_stock_item,'SHIPPED',s.version+1,
 jsonb_build_object('before',s.quantity,'shipped',p_quantity,'after',new_qty,'unit',s.unit,'from_location_id',s.location_id));

 out_result:=jsonb_build_object('status','committed','stock_item_id',p_stock_item,'before',s.quantity,
 'shipped',p_quantity,'remaining',new_qty,'unit',s.unit,'new_version',s.version+1);
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;
