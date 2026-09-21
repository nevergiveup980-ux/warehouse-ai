-- RUNLU Warehouse OS V7 Inventory Command Center 1.0
-- Read-only inventory surface over canonical stock items plus Carpet Identity V2
-- migration staging. Carpet V2 rows are NOT operational carpet_roll rows yet.
-- Manufacturer roll is intentionally reference-only and not surfaced as identity.

create or replace view warehouse_v7.inventory_command_center_items
with (security_invoker=true)
as
select
  s.tenant_id,
  'STOCK'::text as kind,
  s.id::text as item_key,
  s.id as canonical_stock_item_id,
  null::text as legacy_instance_id,
  coalesce(nullif(s.legacy_record_id,''),s.id::text) as source_id,
  p.name as display_id,
  p.name as product_name,
  p.colour as colour,
  l.code as location_code,
  s.quantity::text as quantity_text,
  s.unit as unit,
  null::text as measure_status,
  false as shared_legacy_roll_number,
  false as review_required,
  true as operational_canonical,
  s.version::bigint as version,
  'canonical_stock_item'::text as source_mode,
  null::text as review_reason
from warehouse_v7.stock_item s
join warehouse_v7.product p
  on p.tenant_id=s.tenant_id and p.id=s.product_id
left join warehouse_v7.location l
  on l.tenant_id=s.tenant_id and l.id=s.location_id
where s.lifecycle='active' and s.quantity>0

union all

select
  m.tenant_id,
  'CARPET'::text,
  m.source_record_id,
  null::uuid,
  m.normalized_payload->>'legacy_instance_id',
  m.source_record_id,
  m.normalized_payload->>'company_roll_number',
  m.normalized_payload#>>'{current_state,collection}',
  m.normalized_payload#>>'{current_state,colour}',
  m.normalized_payload#>>'{current_state,location}',
  m.normalized_payload#>>'{current_state,length}',
  'FT'::text,
  m.normalized_payload#>>'{current_state,measure}',
  coalesce((m.normalized_payload->>'shared_legacy_roll_number')::boolean,false),
  false,
  false,
  1::bigint,
  'carpet_identity_v2_staging'::text,
  null::text
from warehouse_v7.migration_staging m
where m.source_dataset='derived_carpet_identity_v7'
  and m.classification='valid'

union all

select
  m.tenant_id,
  'CONFLICT'::text,
  m.source_record_id,
  null::uuid,
  nullif(m.normalized_payload->>'legacy_instance_id',''),
  m.source_record_id,
  coalesce(
    nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(m.normalized_payload->'roll_numbers','[]'::jsonb))),' ↔ '),''),
    m.exception_reason,
    'Carpet identity review'
  ),
  'Carpet identity review'::text,
  null::text,
  null::text,
  null::text,
  null::text,
  null::text,
  false,
  true,
  false,
  1::bigint,
  'carpet_identity_v2_conflict'::text,
  m.exception_reason
from warehouse_v7.migration_staging m
where m.source_dataset='derived_carpet_identity_v7'
  and m.classification='conflict'

union all

select
  m.tenant_id,
  'REVIEW'::text,
  m.source_record_id,
  null::uuid,
  nullif(m.normalized_payload->>'legacy_instance_id',''),
  m.source_record_id,
  coalesce(nullif(m.normalized_payload->>'company_roll_number',''),'Carpet review'),
  coalesce(nullif(m.normalized_payload#>>'{current_state,collection}',''),'Carpet operational review'),
  nullif(m.normalized_payload#>>'{current_state,colour}',''),
  nullif(m.normalized_payload#>>'{current_state,location}',''),
  nullif(m.normalized_payload#>>'{current_state,length}',''),
  'FT'::text,
  nullif(m.normalized_payload#>>'{current_state,measure}',''),
  coalesce((m.normalized_payload->>'shared_legacy_roll_number')::boolean,false),
  true,
  false,
  1::bigint,
  'carpet_operational_review'::text,
  coalesce(
    nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(m.normalized_payload->'reasons','[]'::jsonb))),' · '),''),
    m.exception_reason,
    'Operational readiness review'
  )
from warehouse_v7.migration_staging m
where m.source_dataset='derived_carpet_review_v7'
  and m.classification='deferred';

create or replace function warehouse_v7.get_inventory_command_center(p_tenant uuid)
returns jsonb
language plpgsql
security invoker
stable
as $inventory_center$
declare
  stock_count int;
  carpet_count int;
  carpet_roll_number_count int;
  shared_count int;
  conflict_count int;
  deferred_count int;
  location_count int;
  stock_by_unit jsonb;
  carpet_items jsonb;
  stock_items jsonb;
  conflicts jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;

  select
    count(*) filter(where kind='STOCK')::int,
    count(*) filter(where kind='CARPET')::int,
    count(distinct display_id) filter(where kind='CARPET')::int,
    count(*) filter(where kind='CARPET' and shared_legacy_roll_number)::int,
    count(*) filter(where kind='CONFLICT')::int,
    count(*) filter(where kind='REVIEW')::int,
    count(distinct location_code) filter(where nullif(location_code,'') is not null)::int
  into stock_count,carpet_count,carpet_roll_number_count,shared_count,conflict_count,deferred_count,location_count
  from warehouse_v7.inventory_command_center_items
  where tenant_id=p_tenant;

  select coalesce(jsonb_object_agg(unit,total order by unit),'{}'::jsonb)
  into stock_by_unit
  from (
    select unit,sum(quantity)::text as total
    from warehouse_v7.stock_item
    where tenant_id=p_tenant and lifecycle='active' and quantity>0
    group by unit
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_id,x.legacy_instance_id),'[]'::jsonb)
  into carpet_items
  from (
    select *
    from warehouse_v7.inventory_command_center_items
    where tenant_id=p_tenant and kind='CARPET'
    order by display_id,legacy_instance_id
    limit 12
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.product_name,x.location_code,x.item_key),'[]'::jsonb)
  into stock_items
  from (
    select *
    from warehouse_v7.inventory_command_center_items
    where tenant_id=p_tenant and kind='STOCK'
    order by product_name,location_code,item_key
    limit 12
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_id,x.item_key),'[]'::jsonb)
  into conflicts
  from (
    select *
    from warehouse_v7.inventory_command_center_items
    where tenant_id=p_tenant and kind in ('CONFLICT','REVIEW')
    order by display_id,item_key
    limit 12
  ) x;

  return jsonb_build_object(
    'tenant_id',p_tenant,
    'mode','V7_INVENTORY_COMMAND_CENTER',
    'read_only',true,
    'carpet_operational_cutover',false,
    'summary',jsonb_build_object(
      'ordinary_stock_items',stock_count,
      'carpet_physical_instances',carpet_count,
      'carpet_distinct_company_roll_numbers',carpet_roll_number_count,
      'shared_legacy_roll_instances',shared_count,
      'carpet_identity_conflicts',conflict_count,
      'carpet_operational_deferred',deferred_count,
      'carpet_review_total',conflict_count+deferred_count,
      'locations_represented',location_count
    ),
    'stock_quantity_by_unit',stock_by_unit,
    'carpet_identity_contract',jsonb_build_object(
      'warehouse_identity','company_roll_number',
      'company_roll_source','payload.roll',
      'manufacturer_roll_role','reference_only',
      'source_roll_role','lineage_reference_only',
      'legacy_payload_id_role','migration_alias_only',
      'shared_legacy_roll_numbers',jsonb_build_array('CHC022','CHC023'),
      'staging_dataset','derived_carpet_identity_v7'
    ),
    'lanes',jsonb_build_object(
      'carpet',carpet_items,
      'stock',stock_items,
      'review',conflicts,
      'conflicts',conflicts
    )
  );
end
$inventory_center$;

create or replace function warehouse_v7.list_inventory_command_center(
  p_tenant uuid,
  p_kind text default 'ALL',
  p_query text default null,
  p_location text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security invoker
stable
as $inventory_list$
declare
  k text:=upper(btrim(coalesce(p_kind,'ALL')));
  qtext text:=nullif(btrim(coalesce(p_query,'')),'');
  loc text:=nullif(btrim(coalesce(p_location,'')),'');
  matching_count int;
  items jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;
  if k not in ('ALL','STOCK','CARPET','SHARED','REVIEW','CONFLICT') then
    raise exception using errcode='22023',message='INVALID_INVENTORY_KIND_FILTER';
  end if;
  if qtext is not null and length(qtext)>100 then
    raise exception using errcode='22023',message='INVALID_INVENTORY_QUERY';
  end if;
  if loc is not null and length(loc)>100 then
    raise exception using errcode='22023',message='INVALID_INVENTORY_LOCATION_FILTER';
  end if;
  if p_limit<1 or p_limit>100 then
    raise exception using errcode='22023',message='INVALID_INVENTORY_LIMIT';
  end if;

  select count(*)::int into matching_count
  from warehouse_v7.inventory_command_center_items i
  where i.tenant_id=p_tenant
    and (
      k='ALL'
      or (k='SHARED' and i.kind='CARPET' and i.shared_legacy_roll_number)
      or (k='REVIEW' and i.kind in ('CONFLICT','REVIEW'))
      or i.kind=k
    )
    and (loc is null or lower(coalesce(i.location_code,''))=lower(loc))
    and (
      qtext is null
      or position(lower(qtext) in lower(concat_ws(' ',
        i.display_id,i.product_name,i.colour,i.location_code,i.quantity_text,
        i.unit,i.measure_status,i.legacy_instance_id,i.source_id,i.review_reason
      )))>0
    );

  select coalesce(jsonb_agg(to_jsonb(x) order by
    case x.kind when 'CONFLICT' then 0 when 'REVIEW' then 0 when 'CARPET' then 1 else 2 end,
    x.display_id,x.location_code,x.item_key
  ),'[]'::jsonb)
  into items
  from (
    select *
    from warehouse_v7.inventory_command_center_items i
    where i.tenant_id=p_tenant
      and (
        k='ALL'
        or (k='SHARED' and i.kind='CARPET' and i.shared_legacy_roll_number)
        or i.kind=k
      )
      and (loc is null or lower(coalesce(i.location_code,''))=lower(loc))
      and (
        qtext is null
        or position(lower(qtext) in lower(concat_ws(' ',
          i.display_id,i.product_name,i.colour,i.location_code,i.quantity_text,
          i.unit,i.measure_status,i.legacy_instance_id,i.source_id,i.review_reason
        )))>0
      )
    order by
      case i.kind when 'CONFLICT' then 0 when 'REVIEW' then 0 when 'CARPET' then 1 else 2 end,
      i.display_id,i.location_code,i.item_key
    limit p_limit
  ) x;

  return jsonb_build_object(
    'tenant_id',p_tenant,
    'mode','V7_INVENTORY_COMMAND_CENTER_LIST',
    'read_only',true,
    'matching_count',matching_count,
    'returned_count',jsonb_array_length(items),
    'limit',p_limit,
    'filters',jsonb_build_object('kind',k,'query',qtext,'location',loc),
    'items',items
  );
end
$inventory_list$;
