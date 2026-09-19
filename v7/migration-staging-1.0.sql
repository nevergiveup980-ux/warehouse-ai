-- V7 migration staging: legacy evidence enters quarantine, never operational tables directly.
alter table warehouse_v7.migration_staging
 add column if not exists reviewed_by uuid,
 add column if not exists reviewed_at timestamptz,
 add column if not exists source_fingerprint text;

alter table warehouse_v7.migration_staging
 drop constraint if exists migration_staging_classification_check;
alter table warehouse_v7.migration_staging
 add constraint migration_staging_classification_check
 check (classification in ('unreviewed','valid','duplicate','orphan','conflict','deferred','imported','rejected'));

create or replace function warehouse_v7.stage_legacy_record(
 p_tenant uuid,p_source_dataset text,p_source_record_id text,p_payload jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid; fp text;
begin
 if p_source_dataset is null or btrim(p_source_dataset)='' or p_source_record_id is null or btrim(p_source_record_id)='' then
  raise exception using errcode='22023',message='MIGRATION_SOURCE_ID_REQUIRED';
 end if;
 fp:=md5(coalesce(p_payload,'{}'::jsonb)::text);
 insert into warehouse_v7.migration_staging(tenant_id,source_dataset,source_record_id,source_payload,source_fingerprint)
 values(p_tenant,p_source_dataset,p_source_record_id,coalesce(p_payload,'{}'::jsonb),fp)
 on conflict(tenant_id,source_dataset,source_record_id) do nothing
 returning id into sid;
 if sid is null then
  select id into sid from warehouse_v7.migration_staging
   where tenant_id=p_tenant and source_dataset=p_source_dataset and source_record_id=p_source_record_id;
  if exists(select 1 from warehouse_v7.migration_staging where tenant_id=p_tenant and id=sid and source_fingerprint<>fp) then
   raise exception using errcode='23505',message='MIGRATION_SOURCE_CHANGED';
  end if;
 end if;
 return sid;
end $$;

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
