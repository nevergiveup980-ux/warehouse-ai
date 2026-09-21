-- RUNLU Warehouse OS V7 Carpet Review Promotion Gate 1.0
-- Explicit, admin-only promotion from resolved review overlay to canonical carpet inventory.
-- No automatic promotion exists. Production is not enabled by this engineering migration.

create table if not exists warehouse_v7.carpet_review_promotion (
  tenant_id uuid not null,
  source_dataset text not null,
  source_record_id text not null,
  resolution_version bigint not null check(resolution_version>0),
  carpet_roll_id uuid not null,
  command_id uuid not null,
  promoted_by uuid not null,
  promoted_at timestamptz not null default now(),
  primary key(tenant_id,source_dataset,source_record_id),
  foreign key(tenant_id,carpet_roll_id) references warehouse_v7.carpet_roll(tenant_id,id) on delete restrict,
  foreign key(tenant_id,command_id) references warehouse_v7.command(tenant_id,id) on delete restrict
);

alter table warehouse_v7.carpet_review_promotion enable row level security;
alter table warehouse_v7.carpet_review_promotion force row level security;
drop policy if exists carpet_review_promotion_select on warehouse_v7.carpet_review_promotion;
create policy carpet_review_promotion_select on warehouse_v7.carpet_review_promotion
  for select using (warehouse_v7.is_tenant_member(tenant_id));
drop policy if exists carpet_review_promotion_insert on warehouse_v7.carpet_review_promotion;
create policy carpet_review_promotion_insert on warehouse_v7.carpet_review_promotion
  for insert with check (warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin']));

create or replace function warehouse_v7.guard_carpet_review_promotion_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='55000',message='CARPET_REVIEW_PROMOTION_IMMUTABLE';
end
$$;
drop trigger if exists carpet_review_promotion_immutable on warehouse_v7.carpet_review_promotion;
create trigger carpet_review_promotion_immutable
before update or delete on warehouse_v7.carpet_review_promotion
for each row execute function warehouse_v7.guard_carpet_review_promotion_immutable();

create or replace function warehouse_v7.guard_promoted_carpet_review_resolution()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(
    select 1 from warehouse_v7.carpet_review_promotion p
    where p.tenant_id=old.tenant_id
      and p.source_dataset=old.source_dataset
      and p.source_record_id=old.source_record_id
  ) then
    raise exception using errcode='55000',message='CARPET_REVIEW_ALREADY_PROMOTED';
  end if;
  return new;
end
$$;
drop trigger if exists carpet_review_resolution_after_promotion_guard on warehouse_v7.carpet_review_resolution;
create trigger carpet_review_resolution_after_promotion_guard
before update on warehouse_v7.carpet_review_resolution
for each row execute function warehouse_v7.guard_promoted_carpet_review_resolution();

create or replace function warehouse_v7.carpet_review_feet_to_sixteenths(p_value text)
returns bigint
language plpgsql
immutable
as $$
declare n numeric;
begin
  if nullif(btrim(coalesce(p_value,'')),'') is null then return null; end if;
  if btrim(p_value) !~ '^[0-9]+([.][0-9]+)?$' then return null; end if;
  n:=btrim(p_value)::numeric;
  if n<=0 then return null; end if;
  return round(n*192)::bigint;
end
$$;

create or replace function warehouse_v7.preview_carpet_review_promotion_case(
  p_tenant uuid,
  p_source_dataset text,
  p_source_record_id text
)
returns jsonb
language plpgsql
security invoker
stable
as $preview$
declare
  review_status text;
  resolution_version bigint;
  resolution jsonb;
  normalized jsonb;
  promoted_roll uuid;
  legacy_instance text;
  company_roll text;
  product_name text;
  colour text;
  location_code text;
  measure_status text;
  original_units bigint;
  remaining_units bigint;
  manufacturer_roll text;
  source_roll text;
  shared_number boolean;
  blockers jsonb:='[]'::jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;

  select q.review_status,q.resolution_version,q.resolution_payload,m.normalized_payload,p.carpet_roll_id
  into review_status,resolution_version,resolution,normalized,promoted_roll
  from warehouse_v7.carpet_review_workbench_queue q
  join warehouse_v7.migration_staging m
    on m.tenant_id=q.tenant_id and m.source_dataset=q.source_dataset and m.source_record_id=q.source_record_id
  left join warehouse_v7.carpet_review_promotion p
    on p.tenant_id=q.tenant_id and p.source_dataset=q.source_dataset and p.source_record_id=q.source_record_id
  where q.tenant_id=p_tenant and q.source_dataset=p_source_dataset and q.source_record_id=p_source_record_id;

  if not found then return null; end if;

  legacy_instance:=nullif(btrim(coalesce(normalized->>'legacy_instance_id','')),'');
  company_roll:=nullif(upper(btrim(coalesce(
    resolution->>'company_roll_number',
    normalized->>'company_roll_number',
    ''
  ))),'');
  product_name:=nullif(btrim(coalesce(
    resolution->>'product_name',
    normalized#>>'{current_state,collection}',
    ''
  )),'');
  colour:=nullif(btrim(coalesce(
    resolution->>'colour',
    normalized#>>'{current_state,colour}',
    ''
  )),'');
  location_code:=nullif(btrim(coalesce(
    resolution->>'location_code',
    normalized#>>'{current_state,location}',
    ''
  )),'');
  measure_status:=nullif(upper(btrim(coalesce(
    resolution->>'measure_status',
    normalized#>>'{current_state,measure}',
    ''
  ))),'');
  original_units:=warehouse_v7.carpet_review_feet_to_sixteenths(normalized#>>'{current_state,original_length}');
  remaining_units:=warehouse_v7.carpet_review_feet_to_sixteenths(normalized#>>'{current_state,length}');
  manufacturer_roll:=nullif(btrim(coalesce(normalized#>>'{references,manufacturer_roll}','')),'');
  source_roll:=nullif(btrim(coalesce(normalized#>>'{references,source_roll}','')),'');
  shared_number:=coalesce((normalized->>'shared_legacy_roll_number')::boolean,false)
    or company_roll in ('CHC022','CHC023');

  if promoted_roll is not null then
    return jsonb_build_object(
      'status','promoted','ready',false,'blockers','[]'::jsonb,
      'carpet_roll_id',promoted_roll,'source_dataset',p_source_dataset,'source_record_id',p_source_record_id
    );
  end if;
  if review_status<>'resolved' then blockers:=blockers||jsonb_build_array('REVIEW_NOT_RESOLVED'); end if;
  if legacy_instance is null then blockers:=blockers||jsonb_build_array('LEGACY_INSTANCE_ID_REQUIRED'); end if;
  if company_roll is null then blockers:=blockers||jsonb_build_array('COMPANY_ROLL_NUMBER_REQUIRED'); end if;
  if product_name is null then blockers:=blockers||jsonb_build_array('PRODUCT_NAME_REQUIRED'); end if;
  if location_code is null then blockers:=blockers||jsonb_build_array('LOCATION_REQUIRED'); end if;
  if measure_status is null or measure_status not in ('FULL','CAL','TM') then
    blockers:=blockers||jsonb_build_array('MEASURE_STATUS_REQUIRED');
  end if;
  if original_units is null or remaining_units is null or remaining_units>original_units then
    blockers:=blockers||jsonb_build_array('LENGTH_MEASURE_INVALID');
  elsif measure_status='FULL' and remaining_units<>original_units then
    blockers:=blockers||jsonb_build_array('FULL_MISMATCH');
  end if;
  if legacy_instance is not null and exists(
    select 1 from warehouse_v7.carpet_roll r
    where r.tenant_id=p_tenant and r.physical_key='legacy_instance:'||legacy_instance
  ) then
    blockers:=blockers||jsonb_build_array('PHYSICAL_INSTANCE_ALREADY_ACTIVE');
  end if;
  if company_roll is not null and not shared_number and exists(
    select 1 from warehouse_v7.carpet_roll r
    where r.tenant_id=p_tenant and r.lifecycle='active'
      and upper(btrim(r.roll_number))=company_roll
  ) then
    blockers:=blockers||jsonb_build_array('COMPANY_ROLL_ALREADY_ACTIVE');
  end if;

  return jsonb_build_object(
    'status',case when blockers='[]'::jsonb then 'ready' else 'blocked' end,
    'ready',blockers='[]'::jsonb,
    'blockers',blockers,
    'source_dataset',p_source_dataset,
    'source_record_id',p_source_record_id,
    'resolution_version',resolution_version,
    'legacy_instance_id',legacy_instance,
    'company_roll_number',company_roll,
    'shared_legacy_roll_number',shared_number,
    'product_name',product_name,
    'colour',colour,
    'location_code',location_code,
    'measure_status',measure_status,
    'original_sixteenths',original_units,
    'remaining_sixteenths',remaining_units,
    'manufacturer_roll_reference',manufacturer_roll,
    'source_roll_lineage',source_roll,
    'manufacturer_roll_used_for_identity',false,
    'source_roll_used_for_identity',false
  );
end
$preview$;

create or replace function warehouse_v7.get_carpet_review_promotion_gate(p_tenant uuid)
returns jsonb
language plpgsql
security invoker
stable
as $gate$
declare result jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;

  with q as (
    select w.*,warehouse_v7.preview_carpet_review_promotion_case(
      w.tenant_id,w.source_dataset,w.source_record_id) as preview
    from warehouse_v7.carpet_review_workbench_queue w
    where w.tenant_id=p_tenant
  )
  select jsonb_build_object(
    'mode','V7_CARPET_REVIEW_PROMOTION_GATE',
    'automatic_promotion',false,
    'production_enabled',false,
    'summary',jsonb_build_object(
      'total',count(*)::int,
      'open',count(*) filter(where review_status='open')::int,
      'resolved',count(*) filter(where review_status='resolved')::int,
      'promotable',count(*) filter(where (preview->>'ready')::boolean is true)::int,
      'promoted',count(*) filter(where preview->>'status'='promoted')::int,
      'blocked_resolved',count(*) filter(where review_status='resolved' and preview->>'status'='blocked')::int
    ),
    'cases',coalesce(jsonb_agg(jsonb_build_object(
      'company_roll_display',company_roll_display,
      'source_dataset',source_dataset,
      'source_record_id',source_record_id,
      'review_status',review_status,
      'preview',preview
    ) order by company_roll_display,source_record_id),'[]'::jsonb)
  ) into result
  from q;
  return result;
end
$gate$;

create or replace function warehouse_v7.promote_carpet_review(
  p_tenant uuid,
  p_source_dataset text,
  p_source_record_id text,
  p_expected_resolution_version bigint,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
as $promote$
declare
  rr warehouse_v7.carpet_review_resolution;
  existing warehouse_v7.carpet_review_promotion;
  preview jsonb;
  blockers jsonb;
  legacy_instance text;
  roll_no text;
  pname text;
  pcolour text;
  lcode text;
  mstatus text;
  manufacturer_ref text;
  source_lineage text;
  original_units bigint;
  remaining_units bigint;
  shared_number boolean;
  product_matches int;
  pid uuid;
  lid uuid;
  rid uuid;
  cmdid uuid:=gen_random_uuid();
  product_legacy text;
  carpet_legacy text;
  physical_key_text text;
begin
  perform warehouse_v7.assert_admin_identity(p_tenant,p_actor);
  perform pg_advisory_xact_lock(hashtextextended(
    p_tenant::text||'|'||p_source_dataset||'|'||p_source_record_id,0));

  select * into rr
  from warehouse_v7.carpet_review_resolution
  where tenant_id=p_tenant and source_dataset=p_source_dataset and source_record_id=p_source_record_id
  for update;
  if not found or rr.status<>'resolved' then
    raise exception using errcode='22023',message='CARPET_REVIEW_NOT_RESOLVED';
  end if;
  if rr.version<>p_expected_resolution_version then
    raise exception using errcode='40001',message='CARPET_REVIEW_VERSION_CONFLICT';
  end if;

  select * into existing
  from warehouse_v7.carpet_review_promotion
  where tenant_id=p_tenant and source_dataset=p_source_dataset and source_record_id=p_source_record_id;
  if found then
    if existing.resolution_version<>rr.version then
      raise exception using errcode='55000',message='CARPET_REVIEW_ALREADY_PROMOTED_AT_DIFFERENT_VERSION';
    end if;
    return jsonb_build_object(
      'status','already_promoted','carpet_roll_id',existing.carpet_roll_id,
      'command_id',existing.command_id,'resolution_version',existing.resolution_version,
      'idempotent_retry',true
    );
  end if;

  preview:=warehouse_v7.preview_carpet_review_promotion_case(p_tenant,p_source_dataset,p_source_record_id);
  if preview is null then raise exception using errcode='P0002',message='CARPET_REVIEW_CASE_NOT_FOUND'; end if;
  if coalesce((preview->>'ready')::boolean,false) is not true then
    blockers:=coalesce(preview->'blockers','[]'::jsonb);
    raise exception using errcode='22023',message='CARPET_REVIEW_PROMOTION_NOT_READY',detail=blockers::text;
  end if;

  legacy_instance:=preview->>'legacy_instance_id';
  roll_no:=preview->>'company_roll_number';
  pname:=preview->>'product_name';
  pcolour:=nullif(preview->>'colour','');
  lcode:=preview->>'location_code';
  mstatus:=preview->>'measure_status';
  original_units:=(preview->>'original_sixteenths')::bigint;
  remaining_units:=(preview->>'remaining_sixteenths')::bigint;
  manufacturer_ref:=nullif(preview->>'manufacturer_roll_reference','');
  source_lineage:=nullif(preview->>'source_roll_lineage','');
  shared_number:=coalesce((preview->>'shared_legacy_roll_number')::boolean,false);

  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||'|ROLL|'||roll_no,0));
  if not shared_number and exists(
    select 1 from warehouse_v7.carpet_roll r
    where r.tenant_id=p_tenant and r.lifecycle='active' and upper(btrim(r.roll_number))=roll_no
  ) then
    raise exception using errcode='23505',message='CARPET_REVIEW_COMPANY_ROLL_ALREADY_ACTIVE';
  end if;
  physical_key_text:='legacy_instance:'||legacy_instance;
  carpet_legacy:='CARPET_V2_REVIEW_PROMOTION:'||legacy_instance;
  if exists(
    select 1 from warehouse_v7.carpet_roll r
    where r.tenant_id=p_tenant and (r.physical_key=physical_key_text or r.legacy_record_id=carpet_legacy)
  ) then
    raise exception using errcode='23505',message='CARPET_REVIEW_PHYSICAL_INSTANCE_ALREADY_ACTIVE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_tenant::text||'|PRODUCT|'||lower(pname)||'|'||lower(coalesce(pcolour,'')),0));
  select count(*)::int,(array_agg(p.id order by p.id))[1]
  into product_matches,pid
  from warehouse_v7.product p
  where p.tenant_id=p_tenant and p.lifecycle='active'
    and lower(btrim(p.name))=lower(btrim(pname))
    and lower(btrim(coalesce(p.colour,'')))=lower(btrim(coalesce(pcolour,'')));
  if product_matches>1 then
    raise exception using errcode='23505',message='CARPET_REVIEW_PRODUCT_AMBIGUOUS';
  elsif product_matches=0 then
    product_legacy:='CARPET_REVIEW_PRODUCT:'||md5(lower(btrim(pname))||'|'||lower(btrim(coalesce(pcolour,''))));
    insert into warehouse_v7.product(
      tenant_id,legacy_record_id,sku,name,colour,base_unit,coverage_unit,version,lifecycle)
    values(p_tenant,product_legacy,null,pname,pcolour,'1/16_IN',null,1,'active')
    on conflict(tenant_id,legacy_record_id) do nothing;
    select p.id into pid from warehouse_v7.product p
    where p.tenant_id=p_tenant and p.legacy_record_id=product_legacy and p.lifecycle='active';
  end if;
  if pid is null then raise exception using errcode='23503',message='CARPET_REVIEW_PRODUCT_LINK_FAILED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||'|LOCATION|'||upper(lcode),0));
  insert into warehouse_v7.location(tenant_id,code,kind,lifecycle)
  values(p_tenant,lcode,'rack','active')
  on conflict(tenant_id,code) do nothing;
  select l.id into lid from warehouse_v7.location l
  where l.tenant_id=p_tenant and l.code=lcode and l.lifecycle='active';
  if lid is null then raise exception using errcode='23503',message='CARPET_REVIEW_LOCATION_LINK_FAILED'; end if;

  insert into warehouse_v7.carpet_roll(
    tenant_id,roll_number,physical_key,manufacturer_roll,source_roll,product_id,location_id,
    original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle,legacy_record_id)
  values(
    p_tenant,roll_no,physical_key_text,manufacturer_ref,source_lineage,pid,lid,
    original_units,remaining_units,mstatus,1,'active',carpet_legacy)
  returning id into rid;

  perform warehouse_v7.begin_command(
    p_tenant,cmdid,'MIGRATION_REVIEW_PROMOTED_CARPET','carpet_roll',rid,0,
    jsonb_build_object(
      'review_source_dataset',p_source_dataset,
      'review_source_record_id',p_source_record_id,
      'resolution_version',rr.version,
      'legacy_instance_id',legacy_instance,
      'roll_number',roll_no,
      'physical_key',physical_key_text,
      'manufacturer_roll_reference',manufacturer_ref,
      'source_roll_lineage',source_lineage,
      'original_sixteenths',original_units,
      'remaining_sixteenths',remaining_units,
      'measure_status',mstatus,
      'location_code',lcode,
      'product_id',pid),
    p_actor,'CARPET_REVIEW_PROMOTION');

  insert into warehouse_v7.inventory_movement(
    tenant_id,command_id,product_id,carpet_roll_id,movement_type,quantity,unit,to_location_id)
  values(p_tenant,cmdid,pid,rid,'OPENING_REVIEW_PROMOTION',remaining_units,'1/16_IN',lid);

  insert into warehouse_v7.event(
    tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
  values(p_tenant,cmdid,'carpet_roll',rid,'MIGRATED_REVIEWED_CARPET',1,
    jsonb_build_object(
      'review_source_dataset',p_source_dataset,
      'review_source_record_id',p_source_record_id,
      'resolution_version',rr.version,
      'legacy_instance_id',legacy_instance,
      'roll_number',roll_no,
      'physical_key',physical_key_text,
      'manufacturer_roll_reference',manufacturer_ref,
      'source_roll_lineage',source_lineage,
      'location_id',lid,'product_id',pid,
      'remaining_sixteenths',remaining_units,'measure_status',mstatus));

  perform warehouse_v7.commit_command(
    p_tenant,cmdid,jsonb_build_object(
      'status','committed','carpet_roll_id',rid,'review_promoted',true,
      'resolution_version',rr.version));

  insert into warehouse_v7.carpet_review_promotion(
    tenant_id,source_dataset,source_record_id,resolution_version,carpet_roll_id,command_id,promoted_by)
  values(p_tenant,p_source_dataset,p_source_record_id,rr.version,rid,cmdid,p_actor);

  return jsonb_build_object(
    'status','promoted','carpet_roll_id',rid,'command_id',cmdid,
    'resolution_version',rr.version,'idempotent_retry',false,
    'manufacturer_roll_used_for_identity',false,'source_roll_used_for_identity',false
  );
end
$promote$;
