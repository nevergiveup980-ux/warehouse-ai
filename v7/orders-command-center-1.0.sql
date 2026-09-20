-- RUNLU Warehouse OS V7 Orders Command Center 1.0
-- Unified read-only operational surface over Exception -> Binding -> Execution.
-- Engineering only. It contains no mutation function.

create or replace function warehouse_v7.get_orders_command_center(p_tenant uuid)
returns jsonb
language plpgsql
security invoker
stable
as $command_center$
declare
  exception_count int;
  needs_binding_count int;
  ready_receive_count int;
  ready_ship_count int;
  completed_count int;
  exceptions jsonb;
  bindings jsonb;
  receives jsonb;
  ships jsonb;
  completed jsonb;
  recent_actions jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;

  select count(*)::int into exception_count
  from warehouse_v7.order_exception_queue q
  where q.tenant_id=p_tenant and q.status in ('open','needs_review');

  select count(*)::int into needs_binding_count
  from warehouse_v7.order_binding_workbench_queue q
  where q.tenant_id=p_tenant
    and q.binding_status='unbound'
    and q.order_lifecycle<>'archived';

  select count(*)::int into ready_receive_count
  from warehouse_v7.order_execution_workbench_queue q
  where q.tenant_id=p_tenant and q.task_status='open' and q.flow='INBOUND';

  select count(*)::int into ready_ship_count
  from warehouse_v7.order_execution_workbench_queue q
  where q.tenant_id=p_tenant and q.task_status='open' and q.flow='OUTBOUND';

  select count(*)::int into completed_count
  from warehouse_v7.order_execution_workbench_queue q
  where q.tenant_id=p_tenant and q.task_status='completed';

  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority,x.updated_at desc,x.case_id),'[]'::jsonb)
  into exceptions
  from (
    select
      q.case_id,
      q.reason,
      q.status,
      q.version,
      q.evidence_count,
      q.updated_at,
      q.display_context,
      case q.reason
        when 'IDENTITY_CRITICAL_FIELDS_CONFLICT' then 1
        when 'STRUCTURED_STATUS_MOVED_BACKWARD' then 2
        when 'WEAK_SOURCE_IDENTITY' then 3
        when 'UNKNOWN_STRUCTURED_STATUS' then 4
        else 5
      end as priority
    from warehouse_v7.order_exception_queue q
    where q.tenant_id=p_tenant and q.status in ('open','needs_review')
    order by priority,q.updated_at desc,q.case_id
    limit 8
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_id,x.order_id),'[]'::jsonb)
  into bindings
  from (
    select
      q.order_id,
      coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text) as display_id,
      q.customer_label,
      q.source_product_label,
      q.source_location_label,
      q.source_quantity,
      q.source_unit,
      q.order_lifecycle,
      q.fulfillment_status,
      q.order_version
    from warehouse_v7.order_binding_workbench_queue q
    where q.tenant_id=p_tenant
      and q.binding_status='unbound'
      and q.order_lifecycle<>'archived'
    order by coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text),q.order_id
    limit 8
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_id,x.order_id),'[]'::jsonb)
  into receives
  from (
    select
      q.order_id,
      coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text) as display_id,
      q.customer_label,
      q.canonical_product_name,
      q.canonical_location_code,
      q.remaining_quantity,
      q.expected_quantity,
      q.executed_quantity,
      q.unit,
      q.order_lifecycle,
      q.fulfillment_status
    from warehouse_v7.order_execution_workbench_queue q
    where q.tenant_id=p_tenant and q.task_status='open' and q.flow='INBOUND'
    order by coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text),q.order_id
    limit 8
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_id,x.order_id),'[]'::jsonb)
  into ships
  from (
    select
      q.order_id,
      coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text) as display_id,
      q.customer_label,
      q.canonical_product_name,
      q.canonical_location_code,
      q.remaining_quantity,
      q.expected_quantity,
      q.executed_quantity,
      q.unit,
      q.stock_quantity,
      q.stock_version,
      q.order_lifecycle,
      q.fulfillment_status
    from warehouse_v7.order_execution_workbench_queue q
    where q.tenant_id=p_tenant and q.task_status='open' and q.flow='OUTBOUND'
    order by coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text),q.order_id
    limit 8
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_action_at desc nulls last,x.display_id,x.order_id),'[]'::jsonb)
  into completed
  from (
    select
      q.order_id,
      coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text) as display_id,
      q.customer_label,
      q.flow,
      q.canonical_product_name,
      q.canonical_location_code,
      q.expected_quantity,
      q.unit,
      (
        select max(a.created_at)
        from warehouse_v7.order_fulfillment_action a
        where a.tenant_id=q.tenant_id and a.order_id=q.order_id
      ) as last_action_at
    from warehouse_v7.order_execution_workbench_queue q
    where q.tenant_id=p_tenant and q.task_status='completed'
    order by last_action_at desc nulls last,display_id,q.order_id
    limit 8
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.action_id),'[]'::jsonb)
  into recent_actions
  from (
    select
      a.id as action_id,
      a.order_id,
      a.command_id,
      a.action_type,
      a.quantity,
      a.unit,
      a.created_at,
      coalesce(o.purchase_order_number,o.sales_order_number,o.recovery_key,o.id::text) as display_id,
      o.customer_label,
      p.name as canonical_product_name,
      l.code as canonical_location_code
    from warehouse_v7.order_fulfillment_action a
    join warehouse_v7.order_record o
      on o.tenant_id=a.tenant_id and o.id=a.order_id
    join warehouse_v7.product p
      on p.tenant_id=a.tenant_id and p.id=a.product_id
    left join warehouse_v7.location l
      on l.tenant_id=a.tenant_id and l.id=a.location_id
    where a.tenant_id=p_tenant
    order by a.created_at desc,a.id
    limit 10
  ) x;

  return jsonb_build_object(
    'tenant_id',p_tenant,
    'mode','V7_ORDERS_COMMAND_CENTER',
    'read_only',true,
    'summary',jsonb_build_object(
      'exceptions',exception_count,
      'needs_binding',needs_binding_count,
      'ready_receive',ready_receive_count,
      'ready_ship',ready_ship_count,
      'completed',completed_count,
      'attention_total',exception_count+needs_binding_count+ready_receive_count+ready_ship_count
    ),
    'permissions',jsonb_build_object(
      'can_resolve',warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin']),
      'can_bind',warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin','operator']),
      'can_execute',warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin','operator'])
    ),
    'lanes',jsonb_build_object(
      'exceptions',exceptions,
      'needs_binding',bindings,
      'ready_receive',receives,
      'ready_ship',ships,
      'completed',completed
    ),
    'recent_actions',recent_actions
  );
end
$command_center$;
