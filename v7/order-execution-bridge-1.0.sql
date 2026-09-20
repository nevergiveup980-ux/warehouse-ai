-- RUNLU Warehouse OS V7 Order Execution Bridge 1.0
-- Connects a canonical V7 order to RECEIVE/SHIP only through explicit UUID bindings.
-- No product/location identity is inferred from legacy labels.

create table if not exists warehouse_v7.order_execution_binding (
  tenant_id uuid not null,
  order_id uuid not null,
  flow text not null check(flow in ('INBOUND','OUTBOUND')),
  product_id uuid not null,
  location_id uuid not null,
  stock_item_id uuid,
  expected_quantity numeric(18,6) not null check(expected_quantity>0),
  unit text not null check(length(trim(unit))>0),
  version bigint not null default 1 check(version>0),
  bound_by uuid not null,
  bound_at timestamptz not null default now(),
  primary key(tenant_id,order_id),
  foreign key(tenant_id,order_id)
    references warehouse_v7.order_record(tenant_id,id) on delete restrict,
  foreign key(tenant_id,product_id)
    references warehouse_v7.product(tenant_id,id) on delete restrict,
  foreign key(tenant_id,location_id)
    references warehouse_v7.location(tenant_id,id) on delete restrict,
  foreign key(tenant_id,stock_item_id)
    references warehouse_v7.stock_item(tenant_id,id) on delete restrict
);

create table if not exists warehouse_v7.order_fulfillment_action (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  command_id uuid not null,
  action_type text not null check(action_type in ('RECEIVE','SHIP')),
  product_id uuid not null,
  location_id uuid not null,
  stock_item_id uuid not null,
  quantity numeric(18,6) not null check(quantity>0),
  unit text not null check(length(trim(unit))>0),
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(tenant_id,id),
  unique(tenant_id,command_id),
  foreign key(tenant_id,order_id)
    references warehouse_v7.order_execution_binding(tenant_id,order_id) on delete restrict,
  foreign key(tenant_id,command_id)
    references warehouse_v7.command(tenant_id,id) on delete restrict,
  foreign key(tenant_id,product_id)
    references warehouse_v7.product(tenant_id,id) on delete restrict,
  foreign key(tenant_id,location_id)
    references warehouse_v7.location(tenant_id,id) on delete restrict,
  foreign key(tenant_id,stock_item_id)
    references warehouse_v7.stock_item(tenant_id,id) on delete restrict
);

create index if not exists order_fulfillment_action_order_idx
  on warehouse_v7.order_fulfillment_action(tenant_id,order_id,action_type,created_at);

create or replace function warehouse_v7.reject_order_fulfillment_action_mutation()
returns trigger
language plpgsql
security invoker
as $$
begin
  raise exception using errcode='55000',message='ORDER_FULFILLMENT_ACTION_APPEND_ONLY';
end $$;

drop trigger if exists order_fulfillment_action_append_only
on warehouse_v7.order_fulfillment_action;
create trigger order_fulfillment_action_append_only
before update or delete on warehouse_v7.order_fulfillment_action
for each row execute function warehouse_v7.reject_order_fulfillment_action_mutation();

create or replace function warehouse_v7.reject_order_execution_binding_delete()
returns trigger
language plpgsql
security invoker
as $$
begin
  raise exception using errcode='55000',message='ORDER_EXECUTION_BINDING_DELETE_FORBIDDEN';
end $$;

drop trigger if exists order_execution_binding_no_delete
on warehouse_v7.order_execution_binding;
create trigger order_execution_binding_no_delete
before delete on warehouse_v7.order_execution_binding
for each row execute function warehouse_v7.reject_order_execution_binding_delete();

alter table warehouse_v7.order_execution_binding enable row level security;
alter table warehouse_v7.order_execution_binding force row level security;
alter table warehouse_v7.order_fulfillment_action enable row level security;
alter table warehouse_v7.order_fulfillment_action force row level security;

drop policy if exists tenant_member_select on warehouse_v7.order_execution_binding;
create policy tenant_member_select on warehouse_v7.order_execution_binding
  for select using (warehouse_v7.is_tenant_member(tenant_id));
drop policy if exists tenant_member_insert on warehouse_v7.order_execution_binding;
create policy tenant_member_insert on warehouse_v7.order_execution_binding
  for insert with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin','operator'])
  );
drop policy if exists tenant_member_update on warehouse_v7.order_execution_binding;
create policy tenant_member_update on warehouse_v7.order_execution_binding
  for update using (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin','operator'])
  ) with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin','operator'])
  );
drop policy if exists tenant_member_delete on warehouse_v7.order_execution_binding;

drop policy if exists tenant_member_select on warehouse_v7.order_fulfillment_action;
create policy tenant_member_select on warehouse_v7.order_fulfillment_action
  for select using (warehouse_v7.is_tenant_member(tenant_id));
drop policy if exists tenant_member_insert on warehouse_v7.order_fulfillment_action;
create policy tenant_member_insert on warehouse_v7.order_fulfillment_action
  for insert with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin','operator'])
  );
drop policy if exists tenant_member_update on warehouse_v7.order_fulfillment_action;
drop policy if exists tenant_member_delete on warehouse_v7.order_fulfillment_action;

create or replace view warehouse_v7.order_execution_queue
with (security_invoker=true)
as
with totals as (
  select
    tenant_id,
    order_id,
    coalesce(sum(quantity) filter(where action_type='RECEIVE'),0)::numeric(18,6) as received_quantity,
    coalesce(sum(quantity) filter(where action_type='SHIP'),0)::numeric(18,6) as shipped_quantity
  from warehouse_v7.order_fulfillment_action
  group by tenant_id,order_id
)
select
  b.tenant_id,
  b.order_id,
  o.order_kind,
  o.recovery_key,
  o.sales_order_number,
  o.purchase_order_number,
  o.customer_label,
  o.product_label as source_product_label,
  o.source_location as source_location_label,
  o.lifecycle as order_lifecycle,
  o.fulfillment_status,
  o.version as order_version,
  b.flow,
  b.product_id,
  p.name as canonical_product_name,
  b.location_id,
  l.code as canonical_location_code,
  b.stock_item_id,
  b.expected_quantity,
  b.unit,
  b.version as binding_version,
  case when b.flow='INBOUND'
    then coalesce(t.received_quantity,0)
    else coalesce(t.shipped_quantity,0)
  end as executed_quantity,
  greatest(
    b.expected_quantity -
    case when b.flow='INBOUND'
      then coalesce(t.received_quantity,0)
      else coalesce(t.shipped_quantity,0)
    end,
    0
  )::numeric(18,6) as remaining_quantity,
  case
    when (
      case when b.flow='INBOUND'
        then coalesce(t.received_quantity,0)
        else coalesce(t.shipped_quantity,0)
      end
    ) >= b.expected_quantity then 'completed'
    else 'open'
  end as task_status,
  case when b.flow='INBOUND' then 'RECEIVE_ORDER' else 'SHIP_ORDER' end as next_action,
  b.bound_by,
  b.bound_at
from warehouse_v7.order_execution_binding b
join warehouse_v7.order_record o
  on o.tenant_id=b.tenant_id and o.id=b.order_id
join warehouse_v7.product p
  on p.tenant_id=b.tenant_id and p.id=b.product_id
join warehouse_v7.location l
  on l.tenant_id=b.tenant_id and l.id=b.location_id
left join totals t
  on t.tenant_id=b.tenant_id and t.order_id=b.order_id;

create or replace function warehouse_v7.bind_order_execution(
  p_tenant uuid,
  p_command uuid,
  p_order uuid,
  p_expected_order_version bigint,
  p_flow text,
  p_product uuid,
  p_location uuid,
  p_stock_item uuid,
  p_expected_quantity numeric,
  p_unit text,
  p_payload jsonb,
  p_actor uuid,
  p_device text
)
returns jsonb
language plpgsql
security invoker
as $bind$
declare
  cmd warehouse_v7.command;
  o warehouse_v7.order_record;
  s warehouse_v7.stock_item;
  existing warehouse_v7.order_execution_binding;
  normalized_unit text;
  out_result jsonb;
begin
  perform warehouse_v7.assert_command_identity(p_tenant,p_actor);

  if p_flow not in ('INBOUND','OUTBOUND') then
    raise exception using errcode='22023',message='INVALID_ORDER_EXECUTION_FLOW';
  end if;
  if p_expected_quantity is null or p_expected_quantity<=0 then
    raise exception using errcode='22023',message='INVALID_ORDER_EXECUTION_QUANTITY';
  end if;
  normalized_unit:=upper(trim(coalesce(p_unit,'')));
  if normalized_unit='' then
    raise exception using errcode='22023',message='INVALID_ORDER_EXECUTION_UNIT';
  end if;
  if p_flow='OUTBOUND' and p_stock_item is null then
    raise exception using errcode='22023',message='OUTBOUND_ORDER_REQUIRES_STOCK_ITEM';
  end if;

  cmd:=warehouse_v7.begin_command(
    p_tenant,p_command,'ORDER_BIND_EXECUTION','order',p_order,p_expected_order_version,
    coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(
      'flow',p_flow,
      'product_id',p_product,
      'location_id',p_location,
      'stock_item_id',p_stock_item,
      'expected_quantity',p_expected_quantity,
      'unit',normalized_unit
    ),
    p_actor,p_device
  );
  if cmd.status='committed' then return cmd.result; end if;
  if cmd.status='rejected' then
    return jsonb_build_object('status','rejected','code',cmd.rejection_code,'result',cmd.result);
  end if;

  select * into o
  from warehouse_v7.order_record
  where tenant_id=p_tenant and id=p_order
  for update;

  if not found then
    perform warehouse_v7.reject_command(p_tenant,p_command,'ORDER_NOT_FOUND');
    return jsonb_build_object('status','rejected','code','ORDER_NOT_FOUND');
  end if;
  if o.version<>p_expected_order_version then
    perform warehouse_v7.reject_command(
      p_tenant,p_command,'STALE_VERSION',jsonb_build_object('current_version',o.version)
    );
    return jsonb_build_object('status','rejected','code','STALE_VERSION','current_version',o.version);
  end if;
  if o.lifecycle='archived' then
    perform warehouse_v7.reject_command(p_tenant,p_command,'ARCHIVED_ORDER_CANNOT_BIND_EXECUTION');
    return jsonb_build_object('status','rejected','code','ARCHIVED_ORDER_CANNOT_BIND_EXECUTION');
  end if;
  if o.quantity is not null and o.quantity<>p_expected_quantity then
    perform warehouse_v7.reject_command(
      p_tenant,p_command,'ORDER_EXECUTION_QUANTITY_MISMATCH',
      jsonb_build_object('order_quantity',o.quantity,'requested_quantity',p_expected_quantity)
    );
    return jsonb_build_object('status','rejected','code','ORDER_EXECUTION_QUANTITY_MISMATCH');
  end if;
  if nullif(trim(coalesce(o.unit,'')),'') is not null
     and upper(trim(o.unit))<>normalized_unit then
    perform warehouse_v7.reject_command(
      p_tenant,p_command,'ORDER_EXECUTION_UNIT_MISMATCH',
      jsonb_build_object('order_unit',upper(trim(o.unit)),'requested_unit',normalized_unit)
    );
    return jsonb_build_object('status','rejected','code','ORDER_EXECUTION_UNIT_MISMATCH');
  end if;

  perform 1 from warehouse_v7.product
  where tenant_id=p_tenant and id=p_product and lifecycle='active';
  if not found then
    perform warehouse_v7.reject_command(p_tenant,p_command,'PRODUCT_NOT_ACTIVE');
    return jsonb_build_object('status','rejected','code','PRODUCT_NOT_ACTIVE');
  end if;

  perform 1 from warehouse_v7.location
  where tenant_id=p_tenant and id=p_location and lifecycle='active';
  if not found then
    perform warehouse_v7.reject_command(p_tenant,p_command,'INVALID_LOCATION');
    return jsonb_build_object('status','rejected','code','INVALID_LOCATION');
  end if;

  if p_stock_item is not null then
    select * into s
    from warehouse_v7.stock_item
    where tenant_id=p_tenant and id=p_stock_item;
    if not found then
      perform warehouse_v7.reject_command(p_tenant,p_command,'BOUND_STOCK_NOT_FOUND');
      return jsonb_build_object('status','rejected','code','BOUND_STOCK_NOT_FOUND');
    end if;
    if s.product_id<>p_product
       or s.location_id is distinct from p_location
       or upper(trim(s.unit))<>normalized_unit then
      perform warehouse_v7.reject_command(p_tenant,p_command,'BOUND_STOCK_IDENTITY_MISMATCH');
      return jsonb_build_object('status','rejected','code','BOUND_STOCK_IDENTITY_MISMATCH');
    end if;
  end if;

  select * into existing
  from warehouse_v7.order_execution_binding
  where tenant_id=p_tenant and order_id=p_order;

  if found then
    perform warehouse_v7.reject_command(
      p_tenant,p_command,'ORDER_EXECUTION_ALREADY_BOUND',
      jsonb_build_object('flow',existing.flow,'product_id',existing.product_id,'location_id',existing.location_id)
    );
    return jsonb_build_object('status','rejected','code','ORDER_EXECUTION_ALREADY_BOUND');
  end if;

  insert into warehouse_v7.order_execution_binding(
    tenant_id,order_id,flow,product_id,location_id,stock_item_id,
    expected_quantity,unit,version,bound_by
  ) values(
    p_tenant,p_order,p_flow,p_product,p_location,p_stock_item,
    p_expected_quantity,normalized_unit,1,p_actor
  );

  insert into warehouse_v7.event(
    tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
  ) values(
    p_tenant,p_command,'order',p_order,'ORDER_EXECUTION_BOUND',o.version,
    jsonb_build_object(
      'flow',p_flow,'product_id',p_product,'location_id',p_location,
      'stock_item_id',p_stock_item,'expected_quantity',p_expected_quantity,'unit',normalized_unit
    )
  );

  out_result:=jsonb_build_object(
    'status','committed',
    'order_id',p_order,
    'flow',p_flow,
    'product_id',p_product,
    'location_id',p_location,
    'stock_item_id',p_stock_item,
    'expected_quantity',p_expected_quantity,
    'unit',normalized_unit,
    'binding_version',1
  );
  perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
  return out_result;
end
$bind$;

create or replace function warehouse_v7.receive_bound_order_stock(
  p_tenant uuid,
  p_command uuid,
  p_order uuid,
  p_expected_order_version bigint,
  p_stock_item uuid,
  p_expected_stock_version bigint,
  p_quantity numeric,
  p_payload jsonb,
  p_actor uuid,
  p_device text
)
returns jsonb
language plpgsql
security invoker
as $receive_bound$
declare
  b warehouse_v7.order_execution_binding;
  o warehouse_v7.order_record;
  prior warehouse_v7.order_fulfillment_action;
  used numeric;
  receive_result jsonb;
begin
  perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
  if p_quantity is null or p_quantity<=0 then
    raise exception using errcode='22023',message='INVALID_RECEIVE_QUANTITY';
  end if;

  select * into b
  from warehouse_v7.order_execution_binding
  where tenant_id=p_tenant and order_id=p_order
  for update;
  if not found then
    raise exception using errcode='22023',message='ORDER_EXECUTION_BINDING_NOT_FOUND';
  end if;
  if b.flow<>'INBOUND' then
    raise exception using errcode='22023',message='ORDER_EXECUTION_FLOW_MISMATCH';
  end if;
  if b.stock_item_id is not null and b.stock_item_id<>p_stock_item then
    raise exception using errcode='22023',message='ORDER_EXECUTION_STOCK_MISMATCH';
  end if;

  select * into o
  from warehouse_v7.order_record
  where tenant_id=p_tenant and id=p_order
  for update;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  if o.version<>p_expected_order_version then
    raise exception using errcode='40001',message='ORDER_EXECUTION_STALE_ORDER_VERSION';
  end if;
  if o.lifecycle='archived' then
    raise exception using errcode='22023',message='ARCHIVED_ORDER_CANNOT_EXECUTE';
  end if;

  select * into prior
  from warehouse_v7.order_fulfillment_action
  where tenant_id=p_tenant and command_id=p_command;
  if found then
    if prior.order_id<>p_order
       or prior.action_type<>'RECEIVE'
       or prior.stock_item_id<>p_stock_item
       or prior.quantity<>p_quantity
       or upper(trim(prior.unit))<>upper(trim(b.unit)) then
      raise exception using errcode='22023',message='ORDER_EXECUTION_RETRY_MISMATCH';
    end if;
    return warehouse_v7.receive_stock(
      p_tenant,p_command,b.product_id,b.location_id,p_quantity,b.unit,
      p_expected_stock_version,p_stock_item,
      coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('order_id',p_order,'order_flow','INBOUND'),
      p_actor,p_device
    );
  end if;

  perform 1 from warehouse_v7.command
  where tenant_id=p_tenant and id=p_command;
  if found then
    raise exception using errcode='22023',message='ORDER_EXECUTION_COMMAND_ALREADY_USED';
  end if;

  select coalesce(sum(quantity),0) into used
  from warehouse_v7.order_fulfillment_action
  where tenant_id=p_tenant and order_id=p_order and action_type='RECEIVE';

  if used+p_quantity>b.expected_quantity then
    raise exception using errcode='22023',message='ORDER_EXECUTION_OVERFULFILLMENT';
  end if;

  receive_result:=warehouse_v7.receive_stock(
    p_tenant,p_command,b.product_id,b.location_id,p_quantity,b.unit,
    p_expected_stock_version,p_stock_item,
    coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('order_id',p_order,'order_flow','INBOUND'),
    p_actor,p_device
  );
  if receive_result->>'status'<>'committed' then return receive_result; end if;

  if b.stock_item_id is null then
    update warehouse_v7.order_execution_binding
    set stock_item_id=p_stock_item,version=version+1
    where tenant_id=p_tenant and order_id=p_order and stock_item_id is null;
  end if;

  insert into warehouse_v7.order_fulfillment_action(
    tenant_id,order_id,command_id,action_type,product_id,location_id,
    stock_item_id,quantity,unit,actor_id
  ) values(
    p_tenant,p_order,p_command,'RECEIVE',b.product_id,b.location_id,
    p_stock_item,p_quantity,b.unit,p_actor
  );

  insert into warehouse_v7.event(
    tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
  ) values(
    p_tenant,p_command,'order',p_order,'ORDER_RECEIVE_LINKED',o.version,
    jsonb_build_object(
      'stock_item_id',p_stock_item,'quantity',p_quantity,'unit',b.unit,
      'product_id',b.product_id,'location_id',b.location_id
    )
  );

  return receive_result;
end
$receive_bound$;

create or replace function warehouse_v7.ship_bound_order_stock(
  p_tenant uuid,
  p_command uuid,
  p_order uuid,
  p_expected_order_version bigint,
  p_expected_stock_version bigint,
  p_quantity numeric,
  p_payload jsonb,
  p_actor uuid,
  p_device text
)
returns jsonb
language plpgsql
security invoker
as $ship_bound$
declare
  b warehouse_v7.order_execution_binding;
  o warehouse_v7.order_record;
  s warehouse_v7.stock_item;
  prior warehouse_v7.order_fulfillment_action;
  used numeric;
  ship_result jsonb;
begin
  perform warehouse_v7.assert_command_identity(p_tenant,p_actor);
  if p_quantity is null or p_quantity<=0 then
    raise exception using errcode='22023',message='INVALID_SHIP_QUANTITY';
  end if;

  select * into b
  from warehouse_v7.order_execution_binding
  where tenant_id=p_tenant and order_id=p_order
  for update;
  if not found then
    raise exception using errcode='22023',message='ORDER_EXECUTION_BINDING_NOT_FOUND';
  end if;
  if b.flow<>'OUTBOUND' then
    raise exception using errcode='22023',message='ORDER_EXECUTION_FLOW_MISMATCH';
  end if;
  if b.stock_item_id is null then
    raise exception using errcode='22023',message='OUTBOUND_ORDER_REQUIRES_STOCK_ITEM';
  end if;

  select * into o
  from warehouse_v7.order_record
  where tenant_id=p_tenant and id=p_order
  for update;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  if o.version<>p_expected_order_version then
    raise exception using errcode='40001',message='ORDER_EXECUTION_STALE_ORDER_VERSION';
  end if;
  if o.lifecycle='archived' then
    raise exception using errcode='22023',message='ARCHIVED_ORDER_CANNOT_EXECUTE';
  end if;

  select * into s
  from warehouse_v7.stock_item
  where tenant_id=p_tenant and id=b.stock_item_id;
  if not found then
    raise exception using errcode='22023',message='BOUND_STOCK_NOT_FOUND';
  end if;
  if s.product_id<>b.product_id
     or s.location_id is distinct from b.location_id
     or upper(trim(s.unit))<>upper(trim(b.unit)) then
    raise exception using errcode='22023',message='BOUND_STOCK_IDENTITY_MISMATCH';
  end if;

  select * into prior
  from warehouse_v7.order_fulfillment_action
  where tenant_id=p_tenant and command_id=p_command;
  if found then
    if prior.order_id<>p_order
       or prior.action_type<>'SHIP'
       or prior.stock_item_id<>b.stock_item_id
       or prior.quantity<>p_quantity
       or upper(trim(prior.unit))<>upper(trim(b.unit)) then
      raise exception using errcode='22023',message='ORDER_EXECUTION_RETRY_MISMATCH';
    end if;
    return warehouse_v7.ship_stock(
      p_tenant,p_command,b.stock_item_id,p_expected_stock_version,p_quantity,
      coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('order_id',p_order,'order_flow','OUTBOUND'),
      p_actor,p_device
    );
  end if;

  perform 1 from warehouse_v7.command
  where tenant_id=p_tenant and id=p_command;
  if found then
    raise exception using errcode='22023',message='ORDER_EXECUTION_COMMAND_ALREADY_USED';
  end if;

  select coalesce(sum(quantity),0) into used
  from warehouse_v7.order_fulfillment_action
  where tenant_id=p_tenant and order_id=p_order and action_type='SHIP';

  if used+p_quantity>b.expected_quantity then
    raise exception using errcode='22023',message='ORDER_EXECUTION_OVERFULFILLMENT';
  end if;

  ship_result:=warehouse_v7.ship_stock(
    p_tenant,p_command,b.stock_item_id,p_expected_stock_version,p_quantity,
    coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('order_id',p_order,'order_flow','OUTBOUND'),
    p_actor,p_device
  );
  if ship_result->>'status'<>'committed' then return ship_result; end if;

  insert into warehouse_v7.order_fulfillment_action(
    tenant_id,order_id,command_id,action_type,product_id,location_id,
    stock_item_id,quantity,unit,actor_id
  ) values(
    p_tenant,p_order,p_command,'SHIP',b.product_id,b.location_id,
    b.stock_item_id,p_quantity,b.unit,p_actor
  );

  insert into warehouse_v7.event(
    tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
  ) values(
    p_tenant,p_command,'order',p_order,'ORDER_SHIP_LINKED',o.version,
    jsonb_build_object(
      'stock_item_id',b.stock_item_id,'quantity',p_quantity,'unit',b.unit,
      'product_id',b.product_id,'location_id',b.location_id
    )
  );

  return ship_result;
end
$ship_bound$;
