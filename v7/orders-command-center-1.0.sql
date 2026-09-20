-- RUNLU Warehouse OS V7 Orders Command Center 1.1
-- Unified read-only operational surface over Exception -> Binding -> Execution.
-- Adds transparent Today / priority / aging without inventing legacy due dates.
-- Engineering only. It contains no mutation function.

create or replace view warehouse_v7.orders_attention_queue
with (security_invoker=true)
as
with attention_base as (
  select
    q.tenant_id,
    'EXCEPTION'::text as work_type,
    q.case_id as entity_id,
    null::uuid as order_id,
    coalesce(
      nullif(q.display_context->>'purchase_order_number',''),
      nullif(q.display_context->>'sales_order_number',''),
      nullif(q.display_context->>'recovery_key',''),
      q.case_key
    ) as display_id,
    q.reason as title,
    coalesce(nullif(q.display_context->>'product_label',''),'Manual source review') as subtitle,
    q.reason as exception_reason,
    q.opened_at as attention_since,
    q.updated_at as changed_at,
    '/order-exception-workbench.html'::text as target_path
  from warehouse_v7.order_exception_queue q
  where q.status in ('open','needs_review')

  union all

  select
    q.tenant_id,
    'BINDING'::text,
    q.order_id,
    q.order_id,
    coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text),
    coalesce(q.source_product_label,'Canonical order'),
    coalesce(q.source_location_label,'Explicit product/location identity required'),
    null::text,
    o.created_at,
    o.updated_at,
    '/order-binding-workbench.html'::text
  from warehouse_v7.order_binding_workbench_queue q
  join warehouse_v7.order_record o
    on o.tenant_id=q.tenant_id and o.id=q.order_id
  where q.binding_status='unbound'
    and q.order_lifecycle<>'archived'

  union all

  select
    q.tenant_id,
    case when q.flow='INBOUND' then 'RECEIVE' else 'SHIP' end::text,
    q.order_id,
    q.order_id,
    coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text),
    coalesce(q.canonical_product_name,q.source_product_label,'Order task'),
    coalesce(q.canonical_location_code,'Canonical location'),
    null::text,
    q.bound_at,
    q.bound_at,
    '/order-execution-workbench.html'::text
  from warehouse_v7.order_execution_workbench_queue q
  where q.task_status='open'
),
aged as (
  select
    b.*,
    greatest(
      0,
      floor(extract(epoch from (now()-b.attention_since))/3600)
    )::integer as age_hours
  from attention_base b
)
select
  a.*,
  case
    when a.work_type='EXCEPTION'
      and a.exception_reason in ('IDENTITY_CRITICAL_FIELDS_CONFLICT','STRUCTURED_STATUS_MOVED_BACKWARD') then 1
    when a.age_hours>=72 then 1
    when a.work_type='EXCEPTION' then 2
    when a.age_hours>=24 then 2
    when a.work_type='SHIP' then 2
    else 3
  end as priority_rank,
  case
    when a.work_type='EXCEPTION'
      and a.exception_reason in ('IDENTITY_CRITICAL_FIELDS_CONFLICT','STRUCTURED_STATUS_MOVED_BACKWARD') then 'P1'
    when a.age_hours>=72 then 'P1'
    when a.work_type='EXCEPTION' then 'P2'
    when a.age_hours>=24 then 'P2'
    when a.work_type='SHIP' then 'P2'
    else 'P3'
  end as priority,
  case
    when a.work_type='EXCEPTION' and a.exception_reason='IDENTITY_CRITICAL_FIELDS_CONFLICT'
      then 'Identity conflict blocks safe canonical execution'
    when a.work_type='EXCEPTION' and a.exception_reason='STRUCTURED_STATUS_MOVED_BACKWARD'
      then 'Lifecycle regression requires manual review'
    when a.age_hours>=72 then 'Waiting 72 hours or longer'
    when a.work_type='EXCEPTION' then 'Open exception blocks canonical order flow'
    when a.age_hours>=24 then 'Waiting 24 hours or longer'
    when a.work_type='SHIP' then 'Outbound task is ready for warehouse execution'
    when a.work_type='RECEIVE' then 'Inbound task is ready for warehouse execution'
    else 'Canonical identity still requires explicit binding'
  end as priority_reason
from aged a;

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
  p1_count int;
  p2_count int;
  p3_count int;
  aged_24_count int;
  aged_72_count int;
  oldest_hours int;
  today jsonb;
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

  select
    count(*) filter(where a.work_type='EXCEPTION')::int,
    count(*) filter(where a.work_type='BINDING')::int,
    count(*) filter(where a.work_type='RECEIVE')::int,
    count(*) filter(where a.work_type='SHIP')::int,
    count(*) filter(where a.priority_rank=1)::int,
    count(*) filter(where a.priority_rank=2)::int,
    count(*) filter(where a.priority_rank=3)::int,
    count(*) filter(where a.age_hours>=24)::int,
    count(*) filter(where a.age_hours>=72)::int,
    coalesce(max(a.age_hours),0)::int
  into
    exception_count,needs_binding_count,ready_receive_count,ready_ship_count,
    p1_count,p2_count,p3_count,aged_24_count,aged_72_count,oldest_hours
  from warehouse_v7.orders_attention_queue a
  where a.tenant_id=p_tenant;

  select count(*)::int into completed_count
  from warehouse_v7.order_execution_workbench_queue q
  where q.tenant_id=p_tenant and q.task_status='completed';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'work_type',x.work_type,
      'entity_id',x.entity_id,
      'order_id',x.order_id,
      'display_id',x.display_id,
      'title',x.title,
      'subtitle',x.subtitle,
      'priority',x.priority,
      'priority_rank',x.priority_rank,
      'priority_reason',x.priority_reason,
      'age_hours',x.age_hours,
      'attention_since',x.attention_since,
      'target_path',x.target_path
    )
    order by x.priority_rank,x.age_hours desc,x.work_type,x.display_id,x.entity_id
  ),'[]'::jsonb)
  into today
  from (
    select *
    from warehouse_v7.orders_attention_queue
    where tenant_id=p_tenant
    order by priority_rank,age_hours desc,work_type,display_id,entity_id
    limit 10
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority,x.updated_at desc,x.case_id),'[]'::jsonb)
  into exceptions
  from (
    select
      q.case_id,q.reason,q.status,q.version,q.evidence_count,q.updated_at,q.display_context,
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
      q.customer_label,q.source_product_label,q.source_location_label,q.source_quantity,q.source_unit,
      q.order_lifecycle,q.fulfillment_status,q.order_version
    from warehouse_v7.order_binding_workbench_queue q
    where q.tenant_id=p_tenant and q.binding_status='unbound' and q.order_lifecycle<>'archived'
    order by coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text),q.order_id
    limit 8
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_id,x.order_id),'[]'::jsonb)
  into receives
  from (
    select
      q.order_id,
      coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text) as display_id,
      q.customer_label,q.canonical_product_name,q.canonical_location_code,q.remaining_quantity,
      q.expected_quantity,q.executed_quantity,q.unit,q.order_lifecycle,q.fulfillment_status
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
      q.customer_label,q.canonical_product_name,q.canonical_location_code,q.remaining_quantity,
      q.expected_quantity,q.executed_quantity,q.unit,q.stock_quantity,q.stock_version,
      q.order_lifecycle,q.fulfillment_status
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
      q.customer_label,q.flow,q.canonical_product_name,q.canonical_location_code,q.expected_quantity,q.unit,
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
      a.id as action_id,a.order_id,a.command_id,a.action_type,a.quantity,a.unit,a.created_at,
      coalesce(o.purchase_order_number,o.sales_order_number,o.recovery_key,o.id::text) as display_id,
      o.customer_label,p.name as canonical_product_name,l.code as canonical_location_code
    from warehouse_v7.order_fulfillment_action a
    join warehouse_v7.order_record o on o.tenant_id=a.tenant_id and o.id=a.order_id
    join warehouse_v7.product p on p.tenant_id=a.tenant_id and p.id=a.product_id
    left join warehouse_v7.location l on l.tenant_id=a.tenant_id and l.id=a.location_id
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
    'priority',jsonb_build_object(
      'p1',p1_count,
      'p2',p2_count,
      'p3',p3_count,
      'policy_is_sla',false,
      'policy_version','V7_TODAY_PRIORITY_1'
    ),
    'aging',jsonb_build_object(
      'aged_24h',aged_24_count,
      'aged_72h',aged_72_count,
      'oldest_hours',oldest_hours,
      'basis','time_waiting_in_current_attention_stage'
    ),
    'priority_policy',jsonb_build_object(
      'p1','identity/lifecycle critical exception OR waiting 72h+',
      'p2','other open exception OR waiting 24h+ OR ready-to-ship',
      'p3','other open binding/receive work',
      'sla_claim',false
    ),
    'today',today,
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


-- V1.2: filtered Today worklist. This is a read-only projection; filters do not
-- create commands, events, movements, or mutate order state.
create or replace function warehouse_v7.list_orders_today_work(
  p_tenant uuid,
  p_priority text default null,
  p_work_type text default null,
  p_min_age_hours integer default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security invoker
stable
as $today_work$
declare
  matching_count int;
  items jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;
  if p_priority is not null and p_priority not in ('P1','P2','P3') then
    raise exception using errcode='22023',message='INVALID_TODAY_PRIORITY_FILTER';
  end if;
  if p_work_type is not null and p_work_type not in ('EXCEPTION','BINDING','RECEIVE','SHIP') then
    raise exception using errcode='22023',message='INVALID_TODAY_WORK_TYPE_FILTER';
  end if;
  if p_min_age_hours is not null and (p_min_age_hours<0 or p_min_age_hours>87600) then
    raise exception using errcode='22023',message='INVALID_TODAY_AGE_FILTER';
  end if;
  if p_limit<1 or p_limit>100 then
    raise exception using errcode='22023',message='INVALID_TODAY_LIMIT';
  end if;

  select count(*)::int into matching_count
  from warehouse_v7.orders_attention_queue a
  where a.tenant_id=p_tenant
    and (p_priority is null or a.priority=p_priority)
    and (p_work_type is null or a.work_type=p_work_type)
    and (p_min_age_hours is null or a.age_hours>=p_min_age_hours);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'work_type',x.work_type,
      'entity_id',x.entity_id,
      'order_id',x.order_id,
      'display_id',x.display_id,
      'title',x.title,
      'subtitle',x.subtitle,
      'priority',x.priority,
      'priority_rank',x.priority_rank,
      'priority_reason',x.priority_reason,
      'age_hours',x.age_hours,
      'attention_since',x.attention_since,
      'target_path',x.target_path
    )
    order by x.priority_rank,x.age_hours desc,x.work_type,x.display_id,x.entity_id
  ),'[]'::jsonb)
  into items
  from (
    select *
    from warehouse_v7.orders_attention_queue a
    where a.tenant_id=p_tenant
      and (p_priority is null or a.priority=p_priority)
      and (p_work_type is null or a.work_type=p_work_type)
      and (p_min_age_hours is null or a.age_hours>=p_min_age_hours)
    order by a.priority_rank,a.age_hours desc,a.work_type,a.display_id,a.entity_id
    limit p_limit
  ) x;

  return jsonb_build_object(
    'tenant_id',p_tenant,
    'read_only',true,
    'matching_count',matching_count,
    'returned_count',jsonb_array_length(items),
    'limit',p_limit,
    'filters',jsonb_build_object(
      'priority',p_priority,
      'work_type',p_work_type,
      'min_age_hours',p_min_age_hours
    ),
    'items',items
  );
end
$today_work$;

-- "Today completed" is intentionally a rolling window until a tenant timezone
-- contract exists. It must not imply a local calendar-day boundary we do not know.
create or replace function warehouse_v7.list_orders_completed_recent(
  p_tenant uuid,
  p_hours integer default 24,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security invoker
stable
as $completed_recent$
declare
  matching_count int;
  items jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;
  if p_hours<1 or p_hours>168 then
    raise exception using errcode='22023',message='INVALID_COMPLETED_RECENT_HOURS';
  end if;
  if p_limit<1 or p_limit>100 then
    raise exception using errcode='22023',message='INVALID_COMPLETED_RECENT_LIMIT';
  end if;

  with completed as (
    select
      q.order_id,
      coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text) as display_id,
      q.customer_label,
      q.flow,
      q.canonical_product_name,
      q.canonical_location_code,
      q.expected_quantity,
      q.unit,
      max(a.created_at) as completed_at
    from warehouse_v7.order_execution_workbench_queue q
    join warehouse_v7.order_fulfillment_action a
      on a.tenant_id=q.tenant_id and a.order_id=q.order_id
    where q.tenant_id=p_tenant and q.task_status='completed'
    group by
      q.order_id,q.purchase_order_number,q.sales_order_number,q.recovery_key,
      q.customer_label,q.flow,q.canonical_product_name,q.canonical_location_code,
      q.expected_quantity,q.unit
  )
  select count(*)::int into matching_count
  from completed
  where completed_at>=now()-make_interval(hours=>p_hours);

  with completed as (
    select
      q.order_id,
      coalesce(q.purchase_order_number,q.sales_order_number,q.recovery_key,q.order_id::text) as display_id,
      q.customer_label,
      q.flow,
      q.canonical_product_name,
      q.canonical_location_code,
      q.expected_quantity,
      q.unit,
      max(a.created_at) as completed_at
    from warehouse_v7.order_execution_workbench_queue q
    join warehouse_v7.order_fulfillment_action a
      on a.tenant_id=q.tenant_id and a.order_id=q.order_id
    where q.tenant_id=p_tenant and q.task_status='completed'
    group by
      q.order_id,q.purchase_order_number,q.sales_order_number,q.recovery_key,
      q.customer_label,q.flow,q.canonical_product_name,q.canonical_location_code,
      q.expected_quantity,q.unit
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.completed_at desc,x.display_id,x.order_id),'[]'::jsonb)
  into items
  from (
    select *
    from completed
    where completed_at>=now()-make_interval(hours=>p_hours)
    order by completed_at desc,display_id,order_id
    limit p_limit
  ) x;

  return jsonb_build_object(
    'tenant_id',p_tenant,
    'read_only',true,
    'hours',p_hours,
    'window_semantics','rolling_hours_not_calendar_day',
    'matching_count',matching_count,
    'returned_count',jsonb_array_length(items),
    'items',items
  );
end
$completed_recent$;
