-- RUNLU Warehouse OS V7 Order Execution Workbench 1.0
-- Read model for explicit Order -> RECEIVE / SHIP engineering tasks.
-- Engineering only. Production remains untouched.

create or replace view warehouse_v7.order_execution_workbench_queue
with (security_invoker=true)
as
select
  q.*,
  s.quantity as stock_quantity,
  s.version as stock_version,
  s.lifecycle as stock_lifecycle
from warehouse_v7.order_execution_queue q
left join warehouse_v7.stock_item s
  on s.tenant_id=q.tenant_id and s.id=q.stock_item_id;

create or replace function warehouse_v7.list_order_execution_workbench(
  p_tenant uuid,
  p_status text default 'open'
)
returns jsonb
language plpgsql
security invoker
stable
as $execution_list$
declare
  can_execute boolean;
  result jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;
  if p_status not in ('open','completed','all') then
    raise exception using errcode='22023',message='INVALID_ORDER_EXECUTION_STATUS';
  end if;

  can_execute:=warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin','operator']);

  select jsonb_build_object(
    'tenant_id',p_tenant,
    'status_filter',p_status,
    'can_execute',can_execute,
    'summary',jsonb_build_object(
      'total',count(*)::int,
      'open',count(*) filter(where q.task_status='open')::int,
      'completed',count(*) filter(where q.task_status='completed')::int,
      'inbound_open',count(*) filter(where q.task_status='open' and q.flow='INBOUND')::int,
      'outbound_open',count(*) filter(where q.task_status='open' and q.flow='OUTBOUND')::int
    ),
    'tasks',coalesce((
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
          'order_lifecycle',x.order_lifecycle,
          'fulfillment_status',x.fulfillment_status,
          'order_version',x.order_version,
          'flow',x.flow,
          'next_action',x.next_action,
          'task_status',x.task_status,
          'canonical_product_name',x.canonical_product_name,
          'canonical_location_code',x.canonical_location_code,
          'stock_item_id',x.stock_item_id,
          'stock_quantity',x.stock_quantity,
          'stock_version',x.stock_version,
          'stock_lifecycle',x.stock_lifecycle,
          'expected_quantity',x.expected_quantity,
          'executed_quantity',x.executed_quantity,
          'remaining_quantity',x.remaining_quantity,
          'unit',x.unit,
          'binding_version',x.binding_version
        )
        order by
          case x.task_status when 'open' then 0 else 1 end,
          case x.flow when 'INBOUND' then 0 else 1 end,
          coalesce(x.purchase_order_number,x.sales_order_number,x.recovery_key,''),
          x.order_id
      )
      from warehouse_v7.order_execution_workbench_queue x
      where x.tenant_id=p_tenant
        and (p_status='all' or x.task_status=p_status)
    ),'[]'::jsonb)
  ) into result
  from warehouse_v7.order_execution_workbench_queue q
  where q.tenant_id=p_tenant;

  return result;
end
$execution_list$;

create or replace function warehouse_v7.get_order_execution_workbench_task(
  p_tenant uuid,
  p_order uuid
)
returns jsonb
language plpgsql
security invoker
stable
as $execution_get$
declare
  q warehouse_v7.order_execution_workbench_queue;
  can_execute boolean;
  actions jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;

  select * into q
  from warehouse_v7.order_execution_workbench_queue
  where tenant_id=p_tenant and order_id=p_order;

  if not found then return null; end if;

  can_execute:=warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin','operator']);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'command_id',a.command_id,
      'action_type',a.action_type,
      'stock_item_id',a.stock_item_id,
      'quantity',a.quantity,
      'unit',a.unit,
      'actor_id',a.actor_id,
      'created_at',a.created_at
    ) order by a.created_at,a.id
  ),'[]'::jsonb)
  into actions
  from warehouse_v7.order_fulfillment_action a
  where a.tenant_id=p_tenant and a.order_id=p_order;

  return jsonb_build_object(
    'order_id',q.order_id,
    'order_kind',q.order_kind,
    'purchase_order_number',q.purchase_order_number,
    'sales_order_number',q.sales_order_number,
    'recovery_key',q.recovery_key,
    'customer_label',q.customer_label,
    'source_product_label',q.source_product_label,
    'source_location_label',q.source_location_label,
    'order_lifecycle',q.order_lifecycle,
    'fulfillment_status',q.fulfillment_status,
    'order_version',q.order_version,
    'flow',q.flow,
    'next_action',q.next_action,
    'task_status',q.task_status,
    'product_id',q.product_id,
    'canonical_product_name',q.canonical_product_name,
    'location_id',q.location_id,
    'canonical_location_code',q.canonical_location_code,
    'stock_item_id',q.stock_item_id,
    'stock_quantity',q.stock_quantity,
    'stock_version',q.stock_version,
    'stock_lifecycle',q.stock_lifecycle,
    'expected_quantity',q.expected_quantity,
    'executed_quantity',q.executed_quantity,
    'remaining_quantity',q.remaining_quantity,
    'unit',q.unit,
    'binding_version',q.binding_version,
    'can_execute',can_execute,
    'actions',actions
  );
end
$execution_get$;
