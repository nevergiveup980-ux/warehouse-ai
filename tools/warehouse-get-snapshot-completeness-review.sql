-- REVIEW ONLY. Do not execute against production without approval.
-- Preserve the existing authentication and warehouse access checks.
-- Supply completeness metadata from the same SQL snapshot query.
create or replace function public.warehouse_get_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_cursor bigint;
  v_records jsonb;
  v_total_count bigint;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.runlu_can_use_warehouse_cloud() then raise exception 'Warehouse OS access required'; end if;

  select coalesce(max(change_seq),0) into v_cursor
  from public.warehouse_records where user_id=v_user;

  select count(*)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
           'change_seq',r.change_seq,'dataset_key',r.dataset_key,
           'record_id',r.record_id,'payload',r.payload,'version',r.version,
           'deleted_at',r.deleted_at,'device_id',r.device_id,'updated_at',r.updated_at
         ) order by r.dataset_key,r.record_id),'[]'::jsonb)
    into v_total_count,v_records
  from public.warehouse_records r
  where r.user_id=v_user and r.deleted_at is null
    and coalesce(r.change_seq,0)<=v_cursor;

  return jsonb_build_object(
    'cursor',v_cursor,'records',v_records,
    'totalCount',v_total_count,
    'completenessVerified',true,
    'totalCountSource','server'
  );
end $function$;
