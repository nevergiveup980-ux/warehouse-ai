-- V7 Supplier Return Engine 1.0 — outbound inventory transaction to supplier.
-- This is distinct from Customer/Installer RETURN, which adds inventory back.
-- Supplier reference is stored in command/event evidence; no supplier master table is required yet.

create or replace function warehouse_v7.return_stock_to_supplier(
 p_tenant uuid,p_command uuid,p_stock_item uuid,p_expected_version bigint,
 p_quantity numeric,p_supplier_ref text,p_payload jsonb,p_actor uuid,p_device text)
returns jsonb language plpgsql security invoker as $$
declare
 c warehouse_v7.command;
 s warehouse_v7.stock_item;
 new_qty numeric;
 out_result jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,p_actor);

 if p_quantity<=0 then
   raise exception using errcode='22023',message='INVALID_SUPPLIER_RETURN_QUANTITY';
 end if;
 if nullif(trim(p_supplier_ref),'') is null then
   raise exception using errcode='22023',message='SUPPLIER_REFERENCE_REQUIRED';
 end if;

 c:=warehouse_v7.begin_command(
   p_tenant,p_command,'RETURN_TO_SUPPLIER','stock_item',p_stock_item,p_expected_version,
   p_payload || jsonb_build_object(
     'quantity',p_quantity,
     'supplier_ref',trim(p_supplier_ref)
   ),p_actor,p_device
 );
 if c.status='committed' then return c.result; end if;
 if c.status='rejected' then
   return jsonb_build_object('status','rejected','code',c.rejection_code,'result',c.result);
 end if;

 select * into s
 from warehouse_v7.stock_item
 where tenant_id=p_tenant and id=p_stock_item
 for update;

 if not found then
   perform warehouse_v7.reject_command(p_tenant,p_command,'STOCK_NOT_FOUND');
   return jsonb_build_object('status','rejected','code','STOCK_NOT_FOUND');
 end if;

 if s.lifecycle<>'active' then
   perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_STOCK_STATE');
   return jsonb_build_object('status','rejected','code','INVALID_STOCK_STATE');
 end if;

 if s.version<>p_expected_version then
   perform warehouse_v7.reject_command(
     p_tenant,p_command,'STALE_VERSION',
     jsonb_build_object('current_version',s.version)
   );
   return jsonb_build_object(
     'status','rejected','code','STALE_VERSION','current_version',s.version
   );
 end if;

 if p_quantity>s.quantity then
   perform warehouse_v7.reject_command(
     p_tenant,p_command,'INSUFFICIENT_STOCK',
     jsonb_build_object('available',s.quantity,'unit',s.unit)
   );
   return jsonb_build_object(
     'status','rejected','code','INSUFFICIENT_STOCK',
     'available',s.quantity,'unit',s.unit
   );
 end if;

 new_qty:=s.quantity-p_quantity;

 update warehouse_v7.stock_item
 set quantity=new_qty,
     version=version+1,
     lifecycle=case when new_qty=0 then 'consumed' else lifecycle end
 where tenant_id=p_tenant and id=p_stock_item;

 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,stock_item_id,movement_type,
   quantity,unit,from_location_id
 ) values(
   p_tenant,p_command,s.product_id,p_stock_item,'RETURN_TO_SUPPLIER',
   p_quantity,s.unit,s.location_id
 );

 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
 ) values(
   p_tenant,p_command,'stock_item',p_stock_item,'RETURNED_TO_SUPPLIER',s.version+1,
   jsonb_build_object(
     'before',s.quantity,
     'returned_to_supplier',p_quantity,
     'after',new_qty,
     'unit',s.unit,
     'supplier_ref',trim(p_supplier_ref),
     'from_location_id',s.location_id
   )
 );

 out_result:=jsonb_build_object(
   'status','committed',
   'stock_item_id',p_stock_item,
   'before',s.quantity,
   'returned_to_supplier',p_quantity,
   'remaining',new_qty,
   'unit',s.unit,
   'supplier_ref',trim(p_supplier_ref),
   'new_version',s.version+1
 );
 perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
 return out_result;
end $$;
