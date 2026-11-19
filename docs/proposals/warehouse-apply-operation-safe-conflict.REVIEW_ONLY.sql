-- REVIEW ONLY. Not deployed. Requires isolated integration tests, backup, and approval.
-- Derived from current production warehouse_apply_operation function definition.
-- Differences: no silent carpet discard; no delete of incomplete rows;
-- collision => structured conflict; catch proposed trigger P0001.
-- REVIEW NOTE: SQL exception handlers roll back inner changes; trigger conflicts
-- returned here are not mutation-logged. Never interpret these as success.
-- WARNING: this is a candidate migration, not approved production SQL.
BEGIN;
CREATE OR REPLACE FUNCTION public.warehouse_apply_operation(p_operation_id uuid, p_dataset_key text, p_record_id text, p_payload jsonb DEFAULT '{}'::jsonb, p_base_version bigint DEFAULT NULL::bigint, p_delete boolean DEFAULT false, p_device_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_existing public.warehouse_mutations%rowtype; v_result jsonb; v_status text; v_result_version bigint;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not public.runlu_can_use_warehouse_cloud() then raise exception 'Warehouse OS access required'; end if;
 if p_operation_id is null then raise exception 'operation_id is required'; end if;
 select * into v_existing from public.warehouse_mutations where user_id=v_uid and operation_id=p_operation_id;
 if found then return jsonb_build_object('status','duplicate','operation_id',p_operation_id,'original',v_existing.result); end if;

 -- Validate only NEW physical records; updates to an existing record must still
 -- pass warehouse_apply_mutation's optimistic-version check.
 -- Review failures are recorded as blocked/conflict (never applied).
 if p_dataset_key='runlu_carpet_inventory_v52' and p_delete=false then
   if btrim(coalesce(p_payload->>'status',''))='' or btrim(coalesce(p_payload->>'length',''))='' then
     v_result:=jsonb_build_object('status','blocked','reason','incomplete_carpet_record_requires_review','record',null);
   elsif not exists (
     select 1 from public.warehouse_records r
     where r.user_id=v_uid and r.dataset_key=p_dataset_key and r.record_id=p_record_id
       and r.deleted_at is null
   ) and exists (
     select 1 from public.warehouse_records r
     where r.user_id=v_uid and r.dataset_key=p_dataset_key and r.deleted_at is null
       and r.record_id<>p_record_id
       and (
         (nullif(btrim(coalesce(p_payload->>'physicalKey','')),'') is not null
          and r.payload->>'physicalKey'=p_payload->>'physicalKey')
         or
         (upper(btrim(coalesce(r.payload->>'roll','')))=upper(btrim(coalesce(p_payload->>'roll','')))
          and nullif(btrim(coalesce(p_payload->>'roll','')),'') is not null
          and (
            upper(btrim(coalesce(r.payload->>'manufacturerRoll','')))=upper(btrim(coalesce(p_payload->>'manufacturerRoll','')))
            or upper(btrim(coalesce(r.payload->>'manufacturerRoll',''))) in ('','0000','N/A','NA','UNKNOWN','NONE','-')
            or upper(btrim(coalesce(p_payload->>'manufacturerRoll',''))) in ('','0000','N/A','NA','UNKNOWN','NONE','-')
          ))
       )
   ) then
     v_result:=jsonb_build_object('status','conflict','reason','possible_duplicate_physical_roll','requires_review',true,'record',null);
   end if;
 end if;

 if v_result is null then
   v_result:=public.warehouse_apply_mutation(p_dataset_key,p_record_id,p_payload,p_base_version,p_delete,p_device_id);
 end if;
 v_status:=coalesce(v_result->>'status','blocked'); v_result_version:=nullif(v_result#>>'{record,version}','')::bigint;
 insert into public.warehouse_mutations(user_id,operation_id,dataset_key,record_id,device_id,mutation_kind,base_version,result_version,status,result)
 values(v_uid,p_operation_id,p_dataset_key,p_record_id,p_device_id,case when p_delete then 'delete' else 'upsert' end,p_base_version,v_result_version,case when v_status='ok' then 'applied' when v_status='conflict' then 'conflict' else 'blocked' end,v_result);
 return v_result||jsonb_build_object('operation_id',p_operation_id);
exception when raise_exception then
 if SQLERRM='possible_duplicate_physical_roll' then
   return jsonb_build_object('status','conflict','reason','possible_duplicate_physical_roll','requires_review',true,'operation_id',p_operation_id);
 elsif SQLERRM='carpet_identity_requires_review' then
   return jsonb_build_object('status','blocked','reason','carpet_identity_requires_review','requires_review',true,'operation_id',p_operation_id);
 end if;
 raise;
when unique_violation then
 select * into v_existing from public.warehouse_mutations where user_id=v_uid and operation_id=p_operation_id;
 if found then
   return jsonb_build_object('status','duplicate','operation_id',p_operation_id,'original',v_existing.result);
 end if;
 raise;
end $function$

COMMIT;
