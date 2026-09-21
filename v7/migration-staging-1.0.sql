-- V7 migration staging: legacy evidence enters quarantine, never operational tables directly.
alter table warehouse_v7.migration_staging
 add column if not exists reviewed_by uuid,
 add column if not exists reviewed_at timestamptz,
 add column if not exists source_fingerprint text,
 add column if not exists normalized_payload jsonb not null default '{}'::jsonb,
 add column if not exists normalized_fingerprint text,
 add column if not exists evidence jsonb not null default '[]'::jsonb;

alter table warehouse_v7.migration_staging
 drop constraint if exists migration_staging_evidence_array_check;
alter table warehouse_v7.migration_staging
 add constraint migration_staging_evidence_array_check check (jsonb_typeof(evidence)='array');

alter table warehouse_v7.migration_staging
 drop constraint if exists migration_staging_classification_check;
alter table warehouse_v7.migration_staging
 add constraint migration_staging_classification_check
 check (classification in ('unreviewed','valid','duplicate','orphan','conflict','deferred','imported','rejected'));

create or replace function warehouse_v7.guard_migration_source_evidence()
returns trigger language plpgsql set search_path='' as $guard$
begin
 if new.tenant_id is distinct from old.tenant_id
    or new.id is distinct from old.id
    or new.source_dataset is distinct from old.source_dataset
    or new.source_record_id is distinct from old.source_record_id
    or new.source_payload is distinct from old.source_payload
    or new.source_fingerprint is distinct from old.source_fingerprint
    or new.normalized_payload is distinct from old.normalized_payload
    or new.normalized_fingerprint is distinct from old.normalized_fingerprint
    or new.staged_at is distinct from old.staged_at then
   raise exception using errcode='55000',message='MIGRATION_SOURCE_EVIDENCE_IMMUTABLE';
 end if;
 return new;
end
$guard$;

drop trigger if exists migration_source_evidence_immutable on warehouse_v7.migration_staging;
create trigger migration_source_evidence_immutable
before update on warehouse_v7.migration_staging
for each row execute function warehouse_v7.guard_migration_source_evidence();

create or replace function warehouse_v7.normalize_legacy_unit(p_unit text)
returns text language sql immutable set search_path='' as $unit$
 select case lower(btrim(coalesce(p_unit,'')))
   when 'box' then 'BOX'
   when 'carton' then 'BOX'
   when 'piece' then 'EACH'
   when 'each' then 'EACH'
   when 'pail' then 'PAIL'
   when 'bucket' then 'BUCKET'
   when 'tube' then 'TUBE'
   when 'roll' then 'ROLL'
   when 'gal' then 'GAL'
   when 'gallon' then 'GAL'
   when '1/16_in' then '1/16_IN'
   else null
 end
$unit$;

create or replace function warehouse_v7.stage_legacy_record(
 p_tenant uuid,p_source_dataset text,p_source_record_id text,p_source_payload jsonb,p_normalized_payload jsonb)
returns uuid language plpgsql security invoker set search_path='' as $stage$
declare sid uuid; fp text; nfp text;
begin
 if p_source_dataset is null or btrim(p_source_dataset)='' or p_source_record_id is null or btrim(p_source_record_id)='' then
  raise exception using errcode='22023',message='MIGRATION_SOURCE_ID_REQUIRED';
 end if;
 fp:=md5(coalesce(p_source_payload,'{}'::jsonb)::text);
 nfp:=md5(coalesce(p_normalized_payload,'{}'::jsonb)::text);
 insert into warehouse_v7.migration_staging(
   tenant_id,source_dataset,source_record_id,source_payload,source_fingerprint,
   normalized_payload,normalized_fingerprint)
 values(
   p_tenant,p_source_dataset,p_source_record_id,coalesce(p_source_payload,'{}'::jsonb),fp,
   coalesce(p_normalized_payload,'{}'::jsonb),nfp)
 on conflict(tenant_id,source_dataset,source_record_id) do nothing
 returning id into sid;
 if sid is null then
  select id into sid from warehouse_v7.migration_staging
   where tenant_id=p_tenant and source_dataset=p_source_dataset and source_record_id=p_source_record_id;
  if exists(select 1 from warehouse_v7.migration_staging
            where tenant_id=p_tenant and id=sid and source_fingerprint<>fp) then
   raise exception using errcode='23505',message='MIGRATION_SOURCE_CHANGED';
  end if;
  if exists(select 1 from warehouse_v7.migration_staging
            where tenant_id=p_tenant and id=sid and normalized_fingerprint<>nfp) then
   raise exception using errcode='23505',message='MIGRATION_NORMALIZATION_CHANGED';
  end if;
 end if;
 return sid;
end
$stage$;

create or replace function warehouse_v7.stage_legacy_record(
 p_tenant uuid,p_source_dataset text,p_source_record_id text,p_payload jsonb)
returns uuid language sql security invoker set search_path='' as $stage4$
 select warehouse_v7.stage_legacy_record($1,$2,$3,$4,$4)
$stage4$;

create or replace function warehouse_v7.stage_derived_carpet_product(
 p_tenant uuid,p_source_code text,p_collection text,p_colour text)
returns uuid language plpgsql security invoker set search_path='' as $derived$
declare sid uuid; source_id text; payload jsonb; fp text; existing_fp text;
begin
 if nullif(btrim(p_source_code),'') is null then
  raise exception using errcode='22023',message='CARPET_SOURCE_CODE_REQUIRED';
 end if;
 source_id:='CARPET_SOURCE:'||upper(btrim(p_source_code));
 payload:=jsonb_build_object(
   'source_code',upper(btrim(p_source_code)),
   'name',nullif(btrim(coalesce(p_collection,'')),''),
   'colour',nullif(btrim(coalesce(p_colour,'')),''),
   'base_unit','1/16_IN',
   'lifecycle','active');
 fp:=md5(jsonb_build_object(
   'source_code',upper(btrim(p_source_code)),
   'name_key',lower(btrim(coalesce(p_collection,''))),
   'colour_key',lower(btrim(coalesce(p_colour,''))))::text);

 insert into warehouse_v7.migration_staging(
   tenant_id,source_dataset,source_record_id,source_payload,source_fingerprint,
   normalized_payload,normalized_fingerprint,evidence)
 values(p_tenant,'derived_carpet_product_v6',source_id,payload,fp,payload,md5(payload::text),jsonb_build_array(payload))
 on conflict(tenant_id,source_dataset,source_record_id) do nothing
 returning id into sid;

 if sid is not null then return sid; end if;

 select id,source_fingerprint into sid,existing_fp
 from warehouse_v7.migration_staging
 where tenant_id=p_tenant and source_dataset='derived_carpet_product_v6' and source_record_id=source_id
 for update;

 if existing_fp<>fp then
  update warehouse_v7.migration_staging
  set classification='conflict',
      exception_reason='CARPET_SOURCE_LABEL_VARIANT',
      evidence=case when evidence @> jsonb_build_array(payload) then evidence
                    else evidence||jsonb_build_array(payload) end
  where tenant_id=p_tenant and id=sid and classification<>'imported';
 end if;
 return sid;
end $derived$;

create or replace function warehouse_v7.classify_legacy_record(
 p_tenant uuid,p_stage_id uuid,p_classification text,p_reason text,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform warehouse_v7.assert_admin_identity(p_tenant,p_actor);
 if p_classification not in ('valid','duplicate','orphan','conflict','deferred','rejected') then
  raise exception using errcode='22023',message='MIGRATION_CLASSIFICATION_INVALID';
 end if;
 update warehouse_v7.migration_staging
 set classification=p_classification,exception_reason=nullif(btrim(coalesce(p_reason,'')),''),
     reviewed_by=p_actor,reviewed_at=now()
 where tenant_id=p_tenant and id=p_stage_id and classification<>'imported';
 if not found then raise exception using errcode='P0002',message='MIGRATION_STAGE_NOT_REVIEWABLE'; end if;
end $$;

create or replace function warehouse_v7.import_valid_product(
 p_tenant uuid,p_stage_id uuid,p_actor uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare st warehouse_v7.migration_staging; pid uuid; pname text; punit text; pcoverage text; plifecycle text;
begin
 perform warehouse_v7.assert_admin_identity(p_tenant,p_actor);

 select * into st from warehouse_v7.migration_staging
 where tenant_id=p_tenant and id=p_stage_id for update;
 if not found then raise exception using errcode='P0002',message='MIGRATION_STAGE_NOT_FOUND'; end if;

 if st.classification='imported' and st.imported_entity_type='product' and st.imported_entity_id is not null then
  return st.imported_entity_id;
 end if;
 if st.classification<>'valid' then
  raise exception using errcode='22023',message='MIGRATION_NOT_VALID';
 end if;
 if st.source_dataset not in ('runlu_product_master_v21','derived_carpet_product_v6') then
  raise exception using errcode='22023',message='MIGRATION_WRONG_DATASET_FOR_PRODUCT';
 end if;

 pname:=nullif(btrim(st.normalized_payload->>'name'),'');
 punit:=warehouse_v7.normalize_legacy_unit(st.normalized_payload->>'base_unit');
 pcoverage:=nullif(btrim(st.normalized_payload->>'coverage_unit'),'');
 plifecycle:=coalesce(nullif(btrim(st.normalized_payload->>'lifecycle'),''),'active');
 if pname is null or punit is null then
  raise exception using errcode='22023',message='MIGRATION_PRODUCT_REQUIRED_FIELDS';
 end if;
 if plifecycle not in ('active','retired') then
  raise exception using errcode='22023',message='MIGRATION_PRODUCT_LIFECYCLE_INVALID';
 end if;
 if exists(select 1 from warehouse_v7.product p where p.tenant_id=p_tenant and p.legacy_record_id=st.source_record_id) then
  raise exception using errcode='23505',message='MIGRATION_CANONICAL_CONFLICT';
 end if;

 insert into warehouse_v7.product(tenant_id,legacy_record_id,sku,name,colour,base_unit,coverage_unit,lifecycle)
 values(p_tenant,st.source_record_id,nullif(btrim(st.normalized_payload->>'sku'),''),
        pname,nullif(btrim(st.normalized_payload->>'colour'),''),punit,pcoverage,plifecycle)
 returning id into pid;

 update warehouse_v7.migration_staging
 set classification='imported',imported_entity_type='product',imported_entity_id=pid,
     reviewed_by=p_actor,reviewed_at=now()
 where tenant_id=p_tenant and id=p_stage_id;
 return pid;
end $$;

create or replace function warehouse_v7.import_valid_location(
 p_tenant uuid,p_stage_id uuid,p_actor uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare st warehouse_v7.migration_staging; lid uuid; lcode text; lkind text; llifecycle text;
begin
 perform warehouse_v7.assert_admin_identity(p_tenant,p_actor);

 select * into st from warehouse_v7.migration_staging
 where tenant_id=p_tenant and id=p_stage_id for update;
 if not found then raise exception using errcode='P0002',message='MIGRATION_STAGE_NOT_FOUND'; end if;

 if st.classification='imported' and st.imported_entity_type='location' and st.imported_entity_id is not null then
  return st.imported_entity_id;
 end if;
 if st.classification<>'valid' then
  raise exception using errcode='22023',message='MIGRATION_NOT_VALID';
 end if;
 if st.source_dataset<>'derived_location_v6' then
  raise exception using errcode='22023',message='MIGRATION_WRONG_DATASET_FOR_LOCATION';
 end if;

 lcode:=nullif(btrim(st.normalized_payload->>'code'),'');
 lkind:=coalesce(nullif(btrim(st.normalized_payload->>'kind'),''),'rack');
 llifecycle:=coalesce(nullif(btrim(st.normalized_payload->>'lifecycle'),''),'active');
 if lcode is null then raise exception using errcode='22023',message='MIGRATION_LOCATION_CODE_REQUIRED'; end if;
 if llifecycle not in ('active','retired') then
  raise exception using errcode='22023',message='MIGRATION_LOCATION_LIFECYCLE_INVALID';
 end if;
 if exists(select 1 from warehouse_v7.location l where l.tenant_id=p_tenant and l.code=lcode) then
  raise exception using errcode='23505',message='MIGRATION_CANONICAL_CONFLICT';
 end if;

 insert into warehouse_v7.location(tenant_id,code,kind,lifecycle)
 values(p_tenant,lcode,lkind,llifecycle) returning id into lid;

 update warehouse_v7.migration_staging
 set classification='imported',imported_entity_type='location',imported_entity_id=lid,
     reviewed_by=p_actor,reviewed_at=now()
 where tenant_id=p_tenant and id=p_stage_id;
 return lid;
end $$;

create or replace function warehouse_v7.import_valid_stock_item(
 p_tenant uuid,p_stage_id uuid,p_actor uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 st warehouse_v7.migration_staging;
 sid uuid; pid uuid; lid uuid; cmd warehouse_v7.command;
 product_legacy text; location_code text; qty_text text; u text; q numeric;
begin
 perform warehouse_v7.assert_admin_identity(p_tenant,p_actor);

 select * into st from warehouse_v7.migration_staging
 where tenant_id=p_tenant and id=p_stage_id for update;
 if not found then raise exception using errcode='P0002',message='MIGRATION_STAGE_NOT_FOUND'; end if;

 if st.classification='imported' and st.imported_entity_type='stock_item' and st.imported_entity_id is not null then
  return st.imported_entity_id;
 end if;
 if st.classification<>'valid' then
  raise exception using errcode='22023',message='MIGRATION_NOT_VALID';
 end if;
 if st.source_dataset not in ('runlu_inventory_records_v21','derived_inventory_item_v6') then
  raise exception using errcode='22023',message='MIGRATION_WRONG_DATASET_FOR_STOCK';
 end if;

 product_legacy:=nullif(btrim(st.normalized_payload->>'product_legacy_record_id'),'');
 location_code:=nullif(btrim(st.normalized_payload->>'location_code'),'');
 qty_text:=nullif(btrim(st.normalized_payload->>'quantity'),'');
 u:=warehouse_v7.normalize_legacy_unit(st.normalized_payload->>'unit');
 if product_legacy is null or location_code is null or qty_text is null then
  raise exception using errcode='22023',message='MIGRATION_STOCK_REQUIRED_FIELDS';
 end if;
 if u is null then
  raise exception using errcode='22023',message='MIGRATION_STOCK_UNIT_INVALID';
 end if;
 if qty_text !~ '^[0-9]+([.][0-9]+)?$' then
  raise exception using errcode='22023',message='MIGRATION_STOCK_QUANTITY_INVALID';
 end if;
 q:=qty_text::numeric;
 if q<=0 then raise exception using errcode='22023',message='MIGRATION_STOCK_QUANTITY_INVALID'; end if;

 select p.id into pid from warehouse_v7.product p
 where p.tenant_id=p_tenant and p.legacy_record_id=product_legacy and p.lifecycle='active';
 if pid is null then raise exception using errcode='23503',message='MIGRATION_PRODUCT_LINK_NOT_FOUND'; end if;

 select l.id into lid from warehouse_v7.location l
 where l.tenant_id=p_tenant and l.code=location_code and l.lifecycle='active';
 if lid is null then raise exception using errcode='23503',message='MIGRATION_LOCATION_LINK_NOT_FOUND'; end if;

 if exists(select 1 from warehouse_v7.stock_item s where s.tenant_id=p_tenant and s.legacy_record_id=st.source_record_id) then
  raise exception using errcode='23505',message='MIGRATION_CANONICAL_CONFLICT';
 end if;

 insert into warehouse_v7.stock_item(tenant_id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id)
 values(p_tenant,pid,lid,q,u,1,'active',st.source_record_id)
 returning id into sid;

 cmd:=warehouse_v7.begin_command(
   p_tenant,st.id,'MIGRATION_OPENING_STOCK','stock_item',sid,0,
   jsonb_build_object('source_dataset',st.source_dataset,'source_record_id',st.source_record_id,
                      'quantity',q,'unit',u,'location_code',location_code,'product_legacy_record_id',product_legacy),
   p_actor,'MIGRATION');

 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,stock_item_id,movement_type,quantity,unit,to_location_id)
 values(p_tenant,st.id,pid,sid,'OPENING_IMPORT',q,u,lid);

 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,st.id,'stock_item',sid,'MIGRATED_OPENING_STOCK',1,
   jsonb_build_object('source_dataset',st.source_dataset,'source_record_id',st.source_record_id,
                      'quantity',q,'unit',u,'location_id',lid,'product_id',pid));

 perform warehouse_v7.commit_command(
   p_tenant,st.id,jsonb_build_object('status','committed','stock_item_id',sid,'opening_quantity',q,'unit',u));

 update warehouse_v7.migration_staging
 set classification='imported',imported_entity_type='stock_item',imported_entity_id=sid,
     reviewed_by=p_actor,reviewed_at=now()
 where tenant_id=p_tenant and id=p_stage_id;
 return sid;
end $$;

create or replace function warehouse_v7.import_valid_carpet_roll(
 p_tenant uuid,p_stage_id uuid,p_actor uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 st warehouse_v7.migration_staging;
 rid uuid; pid uuid; lid uuid; cmd warehouse_v7.command;
 product_legacy text; location_code text; roll_no text; physical_key_text text;
 manufacturer_roll_text text; source_roll_text text; status_text text;
 original_text text; remaining_text text; original_units bigint; remaining_units bigint;
begin
 perform warehouse_v7.assert_admin_identity(p_tenant,p_actor);

 select * into st from warehouse_v7.migration_staging
 where tenant_id=p_tenant and id=p_stage_id for update;
 if not found then raise exception using errcode='P0002',message='MIGRATION_STAGE_NOT_FOUND'; end if;

 if st.classification='imported' and st.imported_entity_type='carpet_roll' and st.imported_entity_id is not null then
  return st.imported_entity_id;
 end if;
 if st.classification<>'valid' then
  raise exception using errcode='22023',message='MIGRATION_NOT_VALID';
 end if;
 if st.source_dataset not in ('runlu_carpet_inventory_v52','derived_carpet_roll_v6') then
  raise exception using errcode='22023',message='MIGRATION_WRONG_DATASET_FOR_CARPET';
 end if;

 product_legacy:=nullif(btrim(st.normalized_payload->>'product_legacy_record_id'),'');
 location_code:=nullif(btrim(st.normalized_payload->>'location_code'),'');
 roll_no:=nullif(btrim(st.normalized_payload->>'roll_number'),'');
 physical_key_text:=nullif(btrim(st.normalized_payload->>'physical_key'),'');
 manufacturer_roll_text:=nullif(btrim(st.normalized_payload->>'manufacturer_roll'),'');
 source_roll_text:=nullif(btrim(st.normalized_payload->>'source_roll'),'');
 status_text:=upper(nullif(btrim(st.normalized_payload->>'measure_status'),''));
 original_text:=nullif(btrim(st.normalized_payload->>'original_sixteenths'),'');
 remaining_text:=nullif(btrim(st.normalized_payload->>'remaining_sixteenths'),'');

 if product_legacy is null or location_code is null or roll_no is null or status_text is null
    or original_text is null or remaining_text is null then
  raise exception using errcode='22023',message='MIGRATION_CARPET_REQUIRED_FIELDS';
 end if;
 if physical_key_text is null then
  raise exception using errcode='22023',message='MIGRATION_CARPET_PHYSICAL_KEY_REQUIRED';
 end if;
 if original_text !~ '^[0-9]+$' or remaining_text !~ '^[0-9]+$' then
  raise exception using errcode='22023',message='MIGRATION_CARPET_MEASURE_INVALID';
 end if;

 original_units:=original_text::bigint;
 remaining_units:=remaining_text::bigint;
 if original_units<=0 or remaining_units<=0 or remaining_units>original_units then
  raise exception using errcode='22023',message='MIGRATION_CARPET_MEASURE_INVALID';
 end if;
 if status_text not in ('FULL','CAL','TM') then
  raise exception using errcode='22023',message='MIGRATION_CARPET_STATUS_INVALID';
 end if;
 if status_text='FULL' and remaining_units<>original_units then
  raise exception using errcode='22023',message='MIGRATION_CARPET_FULL_MISMATCH';
 end if;

 select p.id into pid from warehouse_v7.product p
 where p.tenant_id=p_tenant and p.legacy_record_id=product_legacy and p.lifecycle='active';
 if pid is null then raise exception using errcode='23503',message='MIGRATION_PRODUCT_LINK_NOT_FOUND'; end if;

 select l.id into lid from warehouse_v7.location l
 where l.tenant_id=p_tenant and l.code=location_code and l.lifecycle='active';
 if lid is null then raise exception using errcode='23503',message='MIGRATION_LOCATION_LINK_NOT_FOUND'; end if;

 if exists(select 1 from warehouse_v7.carpet_roll r
           where r.tenant_id=p_tenant and
             (r.legacy_record_id=st.source_record_id or r.physical_key=physical_key_text)) then
  raise exception using errcode='23505',message='MIGRATION_CANONICAL_CONFLICT';
 end if;

 insert into warehouse_v7.carpet_roll(
   tenant_id,roll_number,physical_key,manufacturer_roll,source_roll,
   product_id,location_id,original_sixteenths,remaining_sixteenths,
   measure_status,version,lifecycle,legacy_record_id)
 values(p_tenant,roll_no,physical_key_text,manufacturer_roll_text,source_roll_text,
        pid,lid,original_units,remaining_units,status_text,1,'active',st.source_record_id)
 returning id into rid;

 cmd:=warehouse_v7.begin_command(
   p_tenant,st.id,'MIGRATION_OPENING_CARPET','carpet_roll',rid,0,
   jsonb_build_object('source_dataset',st.source_dataset,'source_record_id',st.source_record_id,
                      'roll_number',roll_no,'physical_key',physical_key_text,
                      'manufacturer_roll',manufacturer_roll_text,'source_roll',source_roll_text,
                      'original_sixteenths',original_units,'remaining_sixteenths',remaining_units,
                      'measure_status',status_text,'location_code',location_code,
                      'product_legacy_record_id',product_legacy),
   p_actor,'MIGRATION');

 insert into warehouse_v7.inventory_movement(
   tenant_id,command_id,product_id,carpet_roll_id,movement_type,quantity,unit,to_location_id)
 values(p_tenant,st.id,pid,rid,'OPENING_ROLL_IMPORT',remaining_units,'1/16_IN',lid);

 insert into warehouse_v7.event(
   tenant_id,command_id,entity_type,entity_id,event_type,entity_version,payload)
 values(p_tenant,st.id,'carpet_roll',rid,'MIGRATED_CARPET_ROLL',1,
   jsonb_build_object('source_dataset',st.source_dataset,'source_record_id',st.source_record_id,
                      'roll_number',roll_no,'physical_key',physical_key_text,
                      'manufacturer_roll',manufacturer_roll_text,'source_roll',source_roll_text,
                      'original_sixteenths',original_units,'remaining_sixteenths',remaining_units,
                      'measure_status',status_text,'location_id',lid,'product_id',pid));

 perform warehouse_v7.commit_command(
   p_tenant,st.id,jsonb_build_object('status','committed','carpet_roll_id',rid,
                                     'physical_key',physical_key_text,
                                     'remaining_sixteenths',remaining_units,'measure_status',status_text));

 update warehouse_v7.migration_staging
 set classification='imported',imported_entity_type='carpet_roll',imported_entity_id=rid,
     reviewed_by=p_actor,reviewed_at=now()
 where tenant_id=p_tenant and id=p_stage_id;
 return rid;
end $$;
