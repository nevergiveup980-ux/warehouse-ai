-- RUNLU Warehouse OS V7 Orders Domain 1.0
-- Wave 2 foundation: stable order identity, source-evidence quarantine, and monotonic lifecycle.
-- Engineering branch only. No V6 production mutation.

create table if not exists warehouse_v7.order_record (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  order_kind text not null check(order_kind in ('STANDARD','SPECIAL')),
  source_identity_key text not null,
  recovery_key text,
  sales_order_number text,
  purchase_order_number text,
  customer_label text,
  product_label text,
  source_location text,
  quantity numeric(18,6) check(quantity is null or quantity>=0),
  unit text,
  lifecycle text not null default 'draft'
    check(lifecycle in ('draft','in_progress','completed','archived')),
  fulfillment_status text not null default 'unverified'
    check(fulfillment_status in (
      'unverified','pending','received','backorder',
      'ready_for_pickup','picked_up','completed'
    )),
  version bigint not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,id),
  unique(tenant_id,order_kind,source_identity_key)
);

create table if not exists warehouse_v7.order_source_evidence (
  tenant_id uuid not null,
  id uuid not null default gen_random_uuid(),
  order_id uuid,
  source_dataset text not null,
  source_record_id text not null,
  recovery_key text,
  evidence_class text not null check(evidence_class in (
    'singleton',
    'replay_duplicate',
    'lifecycle_evidence',
    'lifecycle_regression',
    'identity_conflict',
    'deferred'
  )),
  source_fingerprint text not null,
  source_payload jsonb not null default '{}',
  source_updated_at timestamptz,
  staged_at timestamptz not null default now(),
  primary key(tenant_id,id),
  unique(tenant_id,source_dataset,source_record_id),
  foreign key(tenant_id,order_id)
    references warehouse_v7.order_record(tenant_id,id)
    on delete restrict
);

create index if not exists order_source_evidence_recovery_idx
  on warehouse_v7.order_source_evidence(tenant_id,recovery_key)
  where recovery_key is not null;

create or replace function warehouse_v7.transition_order(
  p_tenant uuid,
  p_command uuid,
  p_order uuid,
  p_expected_version bigint,
  p_to_lifecycle text,
  p_to_fulfillment text,
  p_payload jsonb,
  p_actor uuid,
  p_device text
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  c warehouse_v7.command;
  o warehouse_v7.order_record;
  out_result jsonb;
begin
  perform warehouse_v7.assert_command_identity(p_tenant,p_actor);

  if p_to_lifecycle not in ('draft','in_progress','completed','archived') then
    raise exception using errcode='22023',message='INVALID_ORDER_LIFECYCLE';
  end if;

  if p_to_fulfillment not in (
    'unverified','pending','received','backorder',
    'ready_for_pickup','picked_up','completed'
  ) then
    raise exception using errcode='22023',message='INVALID_ORDER_FULFILLMENT';
  end if;

  c:=warehouse_v7.begin_command(
    p_tenant,p_command,'ORDER_TRANSITION','order',p_order,p_expected_version,
    p_payload || jsonb_build_object(
      'to_lifecycle',p_to_lifecycle,
      'to_fulfillment',p_to_fulfillment
    ),
    p_actor,p_device
  );

  if c.status='committed' then return c.result; end if;
  if c.status='rejected' then
    return jsonb_build_object(
      'status','rejected','code',c.rejection_code,'result',c.result
    );
  end if;

  select * into o
  from warehouse_v7.order_record
  where tenant_id=p_tenant and id=p_order
  for update;

  if not found then
    perform warehouse_v7.reject_command(p_tenant,p_command,'ORDER_NOT_FOUND');
    return jsonb_build_object('status','rejected','code','ORDER_NOT_FOUND');
  end if;

  if o.version<>p_expected_version then
    perform warehouse_v7.reject_command(
      p_tenant,p_command,'STALE_VERSION',
      jsonb_build_object('current_version',o.version)
    );
    return jsonb_build_object(
      'status','rejected','code','STALE_VERSION','current_version',o.version
    );
  end if;

  if p_to_lifecycle<>o.lifecycle and not (
       (o.lifecycle='draft' and p_to_lifecycle='in_progress')
    or (o.lifecycle='in_progress' and p_to_lifecycle='completed')
    or (o.lifecycle='completed' and p_to_lifecycle='archived')
  ) then
    perform warehouse_v7.reject_command(
      p_tenant,p_command,'INVALID_ORDER_LIFECYCLE_TRANSITION',
      jsonb_build_object('from',o.lifecycle,'to',p_to_lifecycle)
    );
    return jsonb_build_object(
      'status','rejected','code','INVALID_ORDER_LIFECYCLE_TRANSITION',
      'from',o.lifecycle,'to',p_to_lifecycle
    );
  end if;

  if p_to_fulfillment<>o.fulfillment_status and not (
       (o.fulfillment_status='unverified' and p_to_fulfillment in ('pending','received','ready_for_pickup'))
    or (o.fulfillment_status='pending' and p_to_fulfillment in ('received','backorder','ready_for_pickup','completed'))
    or (o.fulfillment_status='backorder' and p_to_fulfillment in ('pending','received'))
    or (o.fulfillment_status='received' and p_to_fulfillment in ('ready_for_pickup','completed'))
    or (o.fulfillment_status='ready_for_pickup' and p_to_fulfillment='picked_up')
    or (o.fulfillment_status='picked_up' and p_to_fulfillment='completed')
  ) then
    perform warehouse_v7.reject_command(
      p_tenant,p_command,'INVALID_ORDER_FULFILLMENT_TRANSITION',
      jsonb_build_object('from',o.fulfillment_status,'to',p_to_fulfillment)
    );
    return jsonb_build_object(
      'status','rejected','code','INVALID_ORDER_FULFILLMENT_TRANSITION',
      'from',o.fulfillment_status,'to',p_to_fulfillment
    );
  end if;

  if p_to_lifecycle='archived' and o.lifecycle<>'completed' then
    perform warehouse_v7.reject_command(p_tenant,p_command,'ARCHIVE_REQUIRES_COMPLETED_ORDER');
    return jsonb_build_object(
      'status','rejected','code','ARCHIVE_REQUIRES_COMPLETED_ORDER'
    );
  end if;

  update warehouse_v7.order_record
  set lifecycle=p_to_lifecycle,
      fulfillment_status=p_to_fulfillment,
      version=version+1,
      updated_at=now()
  where tenant_id=p_tenant and id=p_order;

  insert into warehouse_v7.event(
    tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload
  ) values(
    p_tenant,p_command,'order',p_order,'ORDER_TRANSITIONED',o.version+1,
    jsonb_build_object(
      'from_lifecycle',o.lifecycle,
      'to_lifecycle',p_to_lifecycle,
      'from_fulfillment',o.fulfillment_status,
      'to_fulfillment',p_to_fulfillment
    )
  );

  out_result:=jsonb_build_object(
    'status','committed',
    'order_id',p_order,
    'lifecycle',p_to_lifecycle,
    'fulfillment_status',p_to_fulfillment,
    'new_version',o.version+1
  );
  perform warehouse_v7.commit_command(p_tenant,p_command,out_result);
  return out_result;
end $$;
