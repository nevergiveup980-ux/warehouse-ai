-- RUNLU Warehouse OS V7 Order Binding Workbench 1.0
-- Human-reviewed bridge from canonical orders to explicit product/location/stock UUIDs.
-- Source labels are display-only and are never used to infer a binding.

create or replace view warehouse_v7.order_binding_workbench_queue
with (security_invoker=true)
as
select
  o.tenant_id,
  o.id as order_id,
  o.order_kind,
  o.recovery_key,
  o.sales_order_number,
  o.purchase_order_number,
  o.customer_label,
  o.product_label as source_product_label,
  o.source_location as source_location_label,
  o.quantity as source_quantity,
  o.unit as source_unit,
  o.lifecycle as order_lifecycle,
  o.fulfillment_status,
  o.version as order_version,
  b.flow,
  b.product_id,
  b.location_id,
  b.stock_item_id,
  b.expected_quantity,
  b.unit as binding_unit,
  b.version as binding_version,
  b.bound_by,
  b.bound_at,
  case when b.order_id is null then 'unbound' else 'bound' end as binding_status
from warehouse_v7.order_record o
left join warehouse_v7.order_execution_binding b
  on b.tenant_id=o.tenant_id and b.order_id=o.id;

create or replace function warehouse_v7.list_order_binding_workbench(
  p_tenant uuid,
  p_status text default 'unbound'
)
returns jsonb
language plpgsql
security invoker
stable
as $binding_list$
declare
  result jsonb;
  can_bind boolean;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;
  if p_status not in ('unbound','bound','all') then
    raise exception using errcode='22023',message='INVALID_ORDER_BINDING_STATUS';
  end if;

  can_bind:=warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin','operator']);

  select jsonb_build_object(
    'tenant_id',p_tenant,
    'status_filter',p_status,
    'can_bind',can_bind,
    'summary',jsonb_build_object(
      'total',count(*)::int,
      'unbound',count(*) filter(where q.binding_status='unbound' and q.order_lifecycle<>'archived')::int,
      'bound',count(*) filter(where q.binding_status='bound')::int,
      'archived_unbound',count(*) filter(where q.binding_status='unbound' and q.order_lifecycle='archived')::int
    ),
    'orders',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'order_id',x.order_id,
          'order_kind',x.order_kind,
          'purchase_order_number',x.purchase_order_number,
          'sales_order_number',x.sales_order_number,
          'recovery_key',x.recovery_key,
          'customer_label',x.customer_label,
          'source_product_label',x.source_product_label,
          'source_location_label',x.source_location_label,
          'source_quantity',x.source_quantity,
          'source_unit',x.source_unit,
          'order_lifecycle',x.order_lifecycle,
          'fulfillment_status',x.fulfillment_status,
          'order_version',x.order_version,
          'binding_status',x.binding_status,
          'flow',x.flow,
          'product_id',x.product_id,
          'location_id',x.location_id,
          'stock_item_id',x.stock_item_id,
          'expected_quantity',x.expected_quantity,
          'binding_unit',x.binding_unit,
          'binding_version',x.binding_version
        )
        order by
          case x.binding_status when 'unbound' then 0 else 1 end,
          coalesce(x.purchase_order_number,x.sales_order_number,x.recovery_key,''),
          x.order_id
      )
      from warehouse_v7.order_binding_workbench_queue x
      where x.tenant_id=p_tenant
        and (
          p_status='all'
          or x.binding_status=p_status
        )
        and not (p_status='unbound' and x.order_lifecycle='archived')
    ),'[]'::jsonb)
  ) into result
  from warehouse_v7.order_binding_workbench_queue q
  where q.tenant_id=p_tenant;

  return result;
end
$binding_list$;

create or replace function warehouse_v7.get_order_binding_workbench_order(
  p_tenant uuid,
  p_order uuid
)
returns jsonb
language plpgsql
security invoker
stable
as $binding_get$
declare
  q warehouse_v7.order_binding_workbench_queue;
  can_bind boolean;
  products jsonb;
  locations jsonb;
  stock_items jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;

  select * into q
  from warehouse_v7.order_binding_workbench_queue
  where tenant_id=p_tenant and order_id=p_order;
  if not found then return null; end if;

  can_bind:=q.binding_status='unbound'
    and q.order_lifecycle<>'archived'
    and warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin','operator']);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id',p.id,
      'sku',p.sku,
      'name',p.name,
      'base_unit',p.base_unit,
      'coverage_unit',p.coverage_unit,
      'version',p.version
    ) order by p.name,p.sku,p.id
  ),'[]'::jsonb)
  into products
  from warehouse_v7.product p
  where p.tenant_id=p_tenant and p.lifecycle='active';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'location_id',l.id,
      'code',l.code,
      'kind',l.kind
    ) order by l.code,l.id
  ),'[]'::jsonb)
  into locations
  from warehouse_v7.location l
  where l.tenant_id=p_tenant and l.lifecycle='active';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'stock_item_id',s.id,
      'product_id',s.product_id,
      'product_name',p.name,
      'location_id',s.location_id,
      'location_code',l.code,
      'quantity',s.quantity,
      'unit',s.unit,
      'version',s.version,
      'lifecycle',s.lifecycle
    ) order by p.name,l.code,s.id
  ),'[]'::jsonb)
  into stock_items
  from warehouse_v7.stock_item s
  join warehouse_v7.product p
    on p.tenant_id=s.tenant_id and p.id=s.product_id
  left join warehouse_v7.location l
    on l.tenant_id=s.tenant_id and l.id=s.location_id
  where s.tenant_id=p_tenant and s.lifecycle='active';

  return jsonb_build_object(
    'order_id',q.order_id,
    'order_kind',q.order_kind,
    'purchase_order_number',q.purchase_order_number,
    'sales_order_number',q.sales_order_number,
    'recovery_key',q.recovery_key,
    'customer_label',q.customer_label,
    'source_product_label',q.source_product_label,
    'source_location_label',q.source_location_label,
    'source_quantity',q.source_quantity,
    'source_unit',q.source_unit,
    'order_lifecycle',q.order_lifecycle,
    'fulfillment_status',q.fulfillment_status,
    'order_version',q.order_version,
    'binding_status',q.binding_status,
    'flow',q.flow,
    'product_id',q.product_id,
    'location_id',q.location_id,
    'stock_item_id',q.stock_item_id,
    'expected_quantity',q.expected_quantity,
    'binding_unit',q.binding_unit,
    'binding_version',q.binding_version,
    'can_bind',can_bind,
    'products',products,
    'locations',locations,
    'stock_items',stock_items,
    'identity_policy',jsonb_build_object(
      'source_labels_are_display_only',true,
      'explicit_product_uuid_required',true,
      'explicit_location_uuid_required',true,
      'outbound_stock_uuid_required',true,
      'inbound_stock_created_on_receive',true
    )
  );
end
$binding_get$;
