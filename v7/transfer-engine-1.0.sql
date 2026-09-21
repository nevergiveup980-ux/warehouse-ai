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


-- V7 quantity-aware stock transfer path.
-- Preserves the original whole-aggregate transfer_stock() contract above while adding
-- a split-safe path for partial Warehouse -> Store/Branch/Installer transfers.
create or replace function warehouse_v7.transfer_stock_quantity(
 p_tenant uuid,p_command uuid,p_source_stock uuid,p_expected_source_version bigint,
 p_destination_stock uuid,p_expected_destination_version bigint,p_quantity numeric,
 p_to_location uuid,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare
 c warehouse_v7.command;
 src warehouse_v7.stock_item;
 dst warehouse_v7.stock_item;
 source_after numeric;
 destination_after numeric;
 destination_new_version bigint;
 out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
 if p_quantity<=0 then raise exception using errcode='22023',message='INVALID_TRANSFER_QUANTITY'; end if;
 if p_source_stock=p_destination_stock then
   raise exception using errcode='22023',message='TRANSFER_SOURCE_DESTINATION_SAME_ENTITY';
 end if;

 c:=warehouse_v7.begin_command(
   p_tenant,p_command,'TRANSFER','stock_item',p_source_stock,p_expected_source_version,
   p_payload || jsonb_build_object(
     'destination_stock_item_id',p_destination_stock,
     'expected_destination_version',p_expected_destination_version,
     'quantity',p_quantity,'to_location_id',p_to_location
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

 select * into src from warehouse_v7.stock_item
 where tenant_id=p_tenant and id=p_source_stock for update;
 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'STOCK_NOT_FOUND');
   return jsonb_build_object('status','rejected','code','STOCK_NOT_FOUND');
 end if;
 if src.lifecycle<>'active' then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_STOCK_STATE');
   return jsonb_build_object('status','rejected','code','INVALID_STOCK_STATE');
 end if;
 if src.version<>p_expected_source_version then
   perform warehouse_v7.reject_command(
     p_tenant,p_command,'STALE_VERSION',
     jsonb_build_object('current_version',src.version,'scope','source')
   );
   return jsonb_build_object('status','rejected','code','STALE_VERSION','scope','source','current_version',src.version);
 end if;
 if src.location_id is not distinct from p_to_location then
   perform warehouse_v7.reject_command(p_tenant,p_command,'SAME_LOCATION');
   return jsonb_build_object('status','rejected','code','SAME_LOCATION');
 end if;
 if p_quantity>src.quantity then
   perform warehouse_v7.reject_command(
     p_tenant,p_command,'INSUFFICIENT_STOCK',
     jsonb_build_object('available',src.quantity,'unit',src.unit)
   );
   return jsonb_build_object('status','rejected','code','INSUFFICIENT_STOCK','available',src.quantity,'unit',src.unit);
 end if;

 select * into dst from warehouse_v7.stock_item
 where tenant_id=p_tenant and id=p_destination_stock for update;

 if found then
   if dst.product_id<>src.product_id or dst.location_id is distinct from p_to_location or dst.unit<>src.unit then
     perform warehouse_v7.reject_command(p_tenant,p_command,'DESTINATION_STOCK_IDENTITY_MISMATCH');
     return jsonb_build_object('status','rejected','code','DESTINATION_STOCK_IDENTITY_MISMATCH');
   end if;
   if dst.version<>p_expected_destination_version then
     perform warehouse_v7.reject_command(
       p_tenant,p_command,'STALE_VERSION',
       jsonb_build_object('current_version',dst.version,'scope','destination')
     );
     return jsonb_build_object('status','rejected','code','STALE_VERSION','scope','destination','current_version',dst.version);
   end if;
   destination_after:=dst.quantity+p_quantity;
   destination_new_version:=dst.version+1;
   update warehouse_v7.stock_item
   set quantity=destination_after,lifecycle='active',version=destination_new_version
   where tenant_id=p_tenant and id=p_destination_stock;
 else
   if p_expected_destination_version<>0 then
     perform warehouse_v7.reject_command(p_tenant,p_command,'DESTINATION_STOCK_NOT_FOUND');
     return jsonb_build_object('status','rejected','code','DESTINATION_STOCK_NOT_FOUND');
   end if;
   destination_after:=p_quantity;
   destination_new_version:=1;
   insert into warehouse_v7.stock_item(
     tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle
   ) values(
     p_tenant,p_destination_stock,src.product_id,p_to_location,p_quantity,src.unit,1,'active'
   );
 end if;

 source_after:=src.quantity-p_quantity;
 update warehouse_v7.stock_item
 set quantity=source_after,version=version+1,
     lifecycle=case when source_after=0 then 'consumed' else lifecycle end
 where tenant_id=p_tenant and id=p_source_stock;

 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,stock_item_id,movement_type,quantity,unit,
   from_location_id,to_location_id
 ) values(
   p_tenant,p_command,src.product_id,p_source_stock,'TRANSFER_OUT',p_quantity,src.unit,
   src.location_id,p_to_location
 );
 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,stock_item_id,movement_type,quantity,unit,
   from_location_id,to_location_id
 ) values(
   p_tenant,p_command,src.product_id,p_destination_stock,'TRANSFER_IN',p_quantity,src.unit,
   src.location_id,p_to_location
 );

 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
 ) values(
   p_tenant,p_command,'stock_item',p_source_stock,'TRANSFERRED_OUT',src.version+1,
   jsonb_build_object(
     'destination_stock_item_id',p_destination_stock,
     'from_location_id',src.location_id,'to_location_id',p_to_location,
     'before',src.quantity,'transferred',p_quantity,'after',source_after,'unit',src.unit
   )
 );
 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
 ) values(
   p_tenant,p_command,'stock_item',p_destination_stock,'TRANSFERRED_IN',destination_new_version,
   jsonb_build_object(
     'source_stock_item_id',p_source_stock,
     'from_location_id',src.location_id,'to_location_id',p_to_location,
     'received',p_quantity,'after',destination_after,'unit',src.unit
   )
 );

 out_result:=jsonb_build_object(
   'status','committed',
   'source_stock_item_id',p_source_stock,
   'destination_stock_item_id',p_destination_stock,
   'from_location_id',src.location_id,
   'to_location_id',p_to_location,
   'quantity',p_quantity,'unit',src.unit,
   'source_before',src.quantity,'source_remaining',source_after,
   'source_new_version',src.version+1,
   'destination_quantity',destination_after,
   'destination_new_version',destination_new_version
 );
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;
