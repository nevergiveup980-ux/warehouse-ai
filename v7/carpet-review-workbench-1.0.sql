-- RUNLU Warehouse OS V7 Carpet Review Workbench 1.0
-- Explicit human resolution overlay for Carpet Identity V2 migration review.
-- Source migration evidence stays immutable. Resolving a review never writes carpet_roll,
-- command, event, or inventory_movement. Promotion is a later, separate cutover step.

create table if not exists warehouse_v7.carpet_review_resolution (
  tenant_id uuid not null,
  source_dataset text not null,
  source_record_id text not null,
  status text not null default 'resolved' check(status in ('open','resolved')),
  resolution_payload jsonb not null default '{}'::jsonb check(jsonb_typeof(resolution_payload)='object'),
  version bigint not null default 1 check(version>0),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,source_dataset,source_record_id)
);

alter table warehouse_v7.carpet_review_resolution enable row level security;
alter table warehouse_v7.carpet_review_resolution force row level security;
drop policy if exists carpet_review_resolution_select on warehouse_v7.carpet_review_resolution;
create policy carpet_review_resolution_select on warehouse_v7.carpet_review_resolution
  for select using (warehouse_v7.is_tenant_member(tenant_id));
drop policy if exists carpet_review_resolution_insert on warehouse_v7.carpet_review_resolution;
create policy carpet_review_resolution_insert on warehouse_v7.carpet_review_resolution
  for insert with check (warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin']));
drop policy if exists carpet_review_resolution_update on warehouse_v7.carpet_review_resolution;
create policy carpet_review_resolution_update on warehouse_v7.carpet_review_resolution
  for update using (warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin']))
  with check (warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin']));

create or replace function warehouse_v7.carpet_review_reason_help(p_reason text)
returns jsonb
language sql
immutable
as $$
 select case upper(btrim(coalesce(p_reason,'')))
   when 'LOCATION_MISSING' then jsonb_build_object(
     'title','Location required',
     'action','Confirm the physical rack/location for this roll.'
   )
   when 'MEASURE_REVIEW' then jsonb_build_object(
     'title','Measure status required',
     'action','Confirm FULL, CAL, or TM from the physical roll or warehouse knowledge.'
   )
   when 'MEASURE_INVALID' then jsonb_build_object(
     'title','Length/measure review required',
     'action','Confirm the correct measurement status and physical remaining length before promotion.'
   )
   when 'FULL_MISMATCH' then jsonb_build_object(
     'title','FULL status conflicts with length',
     'action','Confirm whether the roll is FULL or CAL/TM.'
   )
   when 'PRODUCT_NAME_MISSING' then jsonb_build_object(
     'title','Product name required',
     'action','Confirm the carpet collection/product name.'
   )
   when 'PRODUCT_LABEL_HISTORY_VARIANT' then jsonb_build_object(
     'title','Product label conflict',
     'action','Confirm the canonical carpet collection/product name.'
   )
   when 'LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE' then jsonb_build_object(
     'title','Company roll number conflict',
     'action','Confirm the correct company roll number from the physical label.'
   )
   when 'COMPANY_ROLL_REUSED_ACROSS_PHYSICAL_INSTANCES' then jsonb_build_object(
     'title','Company roll number reused',
     'action','Confirm the correct company roll number for each physical roll.'
   )
   else jsonb_build_object(
     'title','Carpet review required',
     'action','Confirm the flagged field from physical inventory or trusted warehouse evidence.'
   )
 end
$$;

create or replace view warehouse_v7.carpet_review_workbench_queue
with (security_invoker=true)
as
select
  m.tenant_id,
  m.source_dataset,
  m.source_record_id,
  case when m.source_dataset='derived_carpet_identity_v7' then 'IDENTITY' else 'OPERATIONAL' end as review_kind,
  nullif(m.normalized_payload->>'legacy_instance_id','') as legacy_instance_id,
  coalesce(
    nullif(m.normalized_payload->>'company_roll_number',''),
    nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(m.normalized_payload->'roll_numbers','[]'::jsonb))),' ↔ '),''),
    'Carpet review'
  ) as company_roll_display,
  coalesce(
    m.normalized_payload->'reasons',
    case when nullif(m.exception_reason,'') is null then '[]'::jsonb else jsonb_build_array(m.exception_reason) end,
    '[]'::jsonb
  ) as reasons,
  nullif(m.normalized_payload#>>'{current_state,collection}','') as product_name,
  nullif(m.normalized_payload#>>'{current_state,colour}','') as colour,
  nullif(m.normalized_payload#>>'{current_state,location}','') as location_code,
  nullif(m.normalized_payload#>>'{current_state,length}','') as length_text,
  nullif(m.normalized_payload#>>'{current_state,original_length}','') as original_length_text,
  nullif(m.normalized_payload#>>'{current_state,measure}','') as measure_status,
  coalesce((m.normalized_payload->>'shared_legacy_roll_number')::boolean,false) as shared_legacy_roll_number,
  m.classification as migration_classification,
  coalesce(r.status,'open') as review_status,
  coalesce(r.version,0)::bigint as resolution_version,
  coalesce(r.resolution_payload,'{}'::jsonb) as resolution_payload,
  r.resolved_by,
  r.resolved_at,
  coalesce(r.updated_at,m.reviewed_at,m.staged_at) as updated_at
from warehouse_v7.migration_staging m
left join warehouse_v7.carpet_review_resolution r
  on r.tenant_id=m.tenant_id
 and r.source_dataset=m.source_dataset
 and r.source_record_id=m.source_record_id
where
  (m.source_dataset='derived_carpet_review_v7' and m.classification='deferred')
  or
  (m.source_dataset='derived_carpet_identity_v7' and m.classification='conflict');

create or replace function warehouse_v7.list_carpet_review_workbench(
  p_tenant uuid,
  p_status text default 'open'
)
returns jsonb
language plpgsql
security invoker
stable
as $list$
declare
  s text:=lower(btrim(coalesce(p_status,'open')));
  result jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;
  if s not in ('open','resolved','all') then
    raise exception using errcode='22023',message='INVALID_CARPET_REVIEW_STATUS';
  end if;

  select jsonb_build_object(
    'tenant_id',p_tenant,
    'mode','V7_CARPET_REVIEW_WORKBENCH',
    'status_filter',s,
    'can_resolve',warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin']),
    'operational_cutover',false,
    'summary',jsonb_build_object(
      'total',(select count(*)::int from warehouse_v7.carpet_review_workbench_queue z where z.tenant_id=p_tenant),
      'open',(select count(*)::int from warehouse_v7.carpet_review_workbench_queue z where z.tenant_id=p_tenant and z.review_status='open'),
      'resolved',(select count(*)::int from warehouse_v7.carpet_review_workbench_queue z where z.tenant_id=p_tenant and z.review_status='resolved'),
      'identity',(select count(*)::int from warehouse_v7.carpet_review_workbench_queue z where z.tenant_id=p_tenant and z.review_kind='IDENTITY'),
      'operational',(select count(*)::int from warehouse_v7.carpet_review_workbench_queue z where z.tenant_id=p_tenant and z.review_kind='OPERATIONAL')
    ),
    'cases',coalesce(jsonb_agg(
      jsonb_build_object(
        'source_dataset',q.source_dataset,
        'source_record_id',q.source_record_id,
        'review_kind',q.review_kind,
        'legacy_instance_id',q.legacy_instance_id,
        'company_roll_display',q.company_roll_display,
        'reasons',q.reasons,
        'reason_help',coalesce((
          select jsonb_agg(warehouse_v7.carpet_review_reason_help(x) order by x)
          from jsonb_array_elements_text(q.reasons) x
        ),'[]'::jsonb),
        'product_name',q.product_name,
        'colour',q.colour,
        'location_code',q.location_code,
        'length_text',q.length_text,
        'original_length_text',q.original_length_text,
        'measure_status',q.measure_status,
        'shared_legacy_roll_number',q.shared_legacy_roll_number,
        'review_status',q.review_status,
        'resolution_version',q.resolution_version,
        'resolution_payload',q.resolution_payload,
        'resolved_by',q.resolved_by,
        'resolved_at',q.resolved_at,
        'updated_at',q.updated_at
      )
      order by case q.review_kind when 'IDENTITY' then 0 else 1 end,q.company_roll_display,q.source_record_id
    ) filter(where s='all' or q.review_status=s),'[]'::jsonb)
  ) into result
  from warehouse_v7.carpet_review_workbench_queue q
  where q.tenant_id=p_tenant;

  return result;
end
$list$;

create or replace function warehouse_v7.get_carpet_review_workbench_case(
  p_tenant uuid,
  p_source_dataset text,
  p_source_record_id text
)
returns jsonb
language plpgsql
security invoker
stable
as $get$
declare q warehouse_v7.carpet_review_workbench_queue;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;
  select * into q
  from warehouse_v7.carpet_review_workbench_queue
  where tenant_id=p_tenant
    and source_dataset=p_source_dataset
    and source_record_id=p_source_record_id;
  if not found then return null; end if;

  return jsonb_build_object(
    'tenant_id',p_tenant,
    'source_dataset',q.source_dataset,
    'source_record_id',q.source_record_id,
    'review_kind',q.review_kind,
    'legacy_instance_id',q.legacy_instance_id,
    'company_roll_display',q.company_roll_display,
    'reasons',q.reasons,
    'product_name',q.product_name,
    'colour',q.colour,
    'location_code',q.location_code,
    'length_text',q.length_text,
    'original_length_text',q.original_length_text,
    'measure_status',q.measure_status,
    'shared_legacy_roll_number',q.shared_legacy_roll_number,
    'review_status',q.review_status,
    'resolution_version',q.resolution_version,
    'resolution_payload',q.resolution_payload,
    'can_resolve',warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin']),
    'operational_cutover',false
  );
end
$get$;

create or replace function warehouse_v7.resolve_carpet_review(
  p_tenant uuid,
  p_source_dataset text,
  p_source_record_id text,
  p_expected_version bigint,
  p_resolution jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
as $resolve$
declare
  m warehouse_v7.migration_staging;
  r warehouse_v7.carpet_review_resolution;
  current_version bigint;
  reasons jsonb;
  reason text;
  clean jsonb;
  roll text;
  loc text;
  measure text;
  pname text;
  colour text;
  note text;
begin
  perform warehouse_v7.assert_admin_identity(p_tenant,p_actor);

  if jsonb_typeof(coalesce(p_resolution,'null'::jsonb))<>'object' then
    raise exception using errcode='22023',message='CARPET_REVIEW_RESOLUTION_OBJECT_REQUIRED';
  end if;
  if exists(
    select 1 from jsonb_object_keys(p_resolution) k
    where k not in ('company_roll_number','location_code','measure_status','product_name','colour','note')
  ) then
    raise exception using errcode='22023',message='CARPET_REVIEW_RESOLUTION_FIELD_UNSUPPORTED';
  end if;

  select * into m
  from warehouse_v7.migration_staging
  where tenant_id=p_tenant
    and source_dataset=p_source_dataset
    and source_record_id=p_source_record_id
  for update;
  if not found then raise exception using errcode='P0002',message='CARPET_REVIEW_CASE_NOT_FOUND'; end if;
  if not (
    (m.source_dataset='derived_carpet_review_v7' and m.classification='deferred')
    or (m.source_dataset='derived_carpet_identity_v7' and m.classification='conflict')
  ) then
    raise exception using errcode='22023',message='CARPET_REVIEW_CASE_NOT_REVIEWABLE';
  end if;

  select * into r
  from warehouse_v7.carpet_review_resolution
  where tenant_id=p_tenant and source_dataset=p_source_dataset and source_record_id=p_source_record_id
  for update;
  current_version:=case when found then r.version else 0 end;
  if p_expected_version is distinct from current_version then
    raise exception using errcode='40001',message='CARPET_REVIEW_VERSION_CONFLICT';
  end if;

  reasons:=case
    when m.source_dataset='derived_carpet_review_v7'
      then coalesce(m.normalized_payload->'reasons','[]'::jsonb)
    when nullif(m.exception_reason,'') is not null
      then jsonb_build_array(m.exception_reason)
    else '[]'::jsonb
  end;

  roll:=nullif(upper(btrim(coalesce(p_resolution->>'company_roll_number',''))),'');
  loc:=nullif(btrim(coalesce(p_resolution->>'location_code','')),'');
  measure:=nullif(upper(btrim(coalesce(p_resolution->>'measure_status',''))),'');
  pname:=nullif(btrim(coalesce(p_resolution->>'product_name','')),'');
  colour:=nullif(btrim(coalesce(p_resolution->>'colour','')),'');
  note:=nullif(btrim(coalesce(p_resolution->>'note','')),'');

  if measure is not null and measure not in ('FULL','CAL','TM') then
    raise exception using errcode='22023',message='CARPET_REVIEW_MEASURE_INVALID';
  end if;

  for reason in select upper(x) from jsonb_array_elements_text(reasons) x loop
    if reason='LOCATION_MISSING' and loc is null then
      raise exception using errcode='22023',message='CARPET_REVIEW_LOCATION_REQUIRED';
    elsif reason in ('MEASURE_REVIEW','MEASURE_INVALID','FULL_MISMATCH') and measure is null then
      raise exception using errcode='22023',message='CARPET_REVIEW_MEASURE_REQUIRED';
    elsif reason in ('PRODUCT_NAME_MISSING','PRODUCT_LABEL_HISTORY_VARIANT') and pname is null then
      raise exception using errcode='22023',message='CARPET_REVIEW_PRODUCT_NAME_REQUIRED';
    elsif reason in ('LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE','COMPANY_ROLL_REUSED_ACROSS_PHYSICAL_INSTANCES')
      and roll is null then
      raise exception using errcode='22023',message='CARPET_REVIEW_COMPANY_ROLL_REQUIRED';
    end if;
  end loop;

  clean:=jsonb_strip_nulls(jsonb_build_object(
    'company_roll_number',roll,
    'location_code',loc,
    'measure_status',measure,
    'product_name',pname,
    'colour',colour,
    'note',note
  ));
  if clean='{}'::jsonb then
    raise exception using errcode='22023',message='CARPET_REVIEW_EXPLICIT_RESOLUTION_REQUIRED';
  end if;

  if current_version=0 then
    insert into warehouse_v7.carpet_review_resolution(
      tenant_id,source_dataset,source_record_id,status,resolution_payload,version,resolved_by,resolved_at,updated_at)
    values(p_tenant,p_source_dataset,p_source_record_id,'resolved',clean,1,p_actor,now(),now())
    returning * into r;
  else
    update warehouse_v7.carpet_review_resolution
    set status='resolved',
        resolution_payload=clean,
        version=version+1,
        resolved_by=p_actor,
        resolved_at=now(),
        updated_at=now()
    where tenant_id=p_tenant and source_dataset=p_source_dataset and source_record_id=p_source_record_id
    returning * into r;
  end if;

  return jsonb_build_object(
    'status','resolved',
    'source_dataset',r.source_dataset,
    'source_record_id',r.source_record_id,
    'version',r.version,
    'resolution_payload',r.resolution_payload,
    'operational_inventory_writes',0,
    'promotion_performed',false
  );
end
$resolve$;

create or replace function warehouse_v7.reopen_carpet_review(
  p_tenant uuid,
  p_source_dataset text,
  p_source_record_id text,
  p_expected_version bigint,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
as $reopen$
declare r warehouse_v7.carpet_review_resolution;
begin
  perform warehouse_v7.assert_admin_identity(p_tenant,p_actor);
  select * into r
  from warehouse_v7.carpet_review_resolution
  where tenant_id=p_tenant and source_dataset=p_source_dataset and source_record_id=p_source_record_id
  for update;
  if not found then raise exception using errcode='P0002',message='CARPET_REVIEW_RESOLUTION_NOT_FOUND'; end if;
  if r.version<>p_expected_version then
    raise exception using errcode='40001',message='CARPET_REVIEW_VERSION_CONFLICT';
  end if;

  update warehouse_v7.carpet_review_resolution
  set status='open',version=version+1,resolved_by=null,resolved_at=null,updated_at=now()
  where tenant_id=p_tenant and source_dataset=p_source_dataset and source_record_id=p_source_record_id
  returning * into r;

  return jsonb_build_object(
    'status','open','source_dataset',r.source_dataset,'source_record_id',r.source_record_id,
    'version',r.version,'operational_inventory_writes',0,'promotion_performed',false
  );
end
$reopen$;
