-- Deployed via migration warehouse_v8_authenticated_cut_bridge on 2026-10-05.
-- Both RPCs are SECURITY INVOKER; existing tenant RLS remains active.
grant usage on schema warehouse_v7 to authenticated;
grant select, update on warehouse_v7.carpet_roll to authenticated;
grant select, insert, update on warehouse_v7.command to authenticated;
grant select, insert on warehouse_v7.inventory_movement, warehouse_v7.event to authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_v8_cut_commit(p_tenant uuid, p_command uuid, p_roll uuid, p_expected_version bigint, p_deduct_sixteenths bigint, p_payload jsonb, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb; r warehouse_v7.carpet_roll; m public.warehouse_records; mirror_result jsonb; next_payload jsonb;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,auth.uid());
 -- A missing/deleted UI projection must stop BEFORE any cut. The whole RPC is atomic.
 select * into m from public.warehouse_records
 where user_id=auth.uid() and dataset_key='runlu_carpet_inventory_v52'
 and record_id=p_roll::text and deleted_at is null for update;
 if not found then raise exception 'CARPET_PROJECTION_MISSING'; end if;
 result:=warehouse_v7.cut_carpet_roll(p_tenant,p_command,p_roll,p_expected_version,
   p_deduct_sixteenths,p_payload,auth.uid(),p_device);
 if result->>'status'<>'committed' then return result; end if;
 -- On command replay publish the CURRENT balance, never the old command's balance.
 select * into strict r from warehouse_v7.carpet_roll where tenant_id=p_tenant and id=p_roll;
 next_payload:=m.payload || jsonb_build_object('remainingSixteenths',r.remaining_sixteenths,
   'length',r.remaining_sixteenths::numeric/192,'canonicalVersion',r.version,
   'lifecycleStatus',upper(r.lifecycle),'lifecycle',r.lifecycle,
   'status',case when r.lifecycle='consumed' then 'Used Up' else 'Active' end,
   'measureStatus',case when r.lifecycle='consumed' then 'TM' else 'CAL' end,
   'measure',case when r.lifecycle='consumed' then 'TM' else 'CAL' end,
   'tmRequired',r.remaining_sixteenths>0 and r.remaining_sixteenths<=9600);
 if next_payload is distinct from m.payload then
   mirror_result:=public.warehouse_apply_mutation(m.dataset_key,m.record_id,next_payload,m.version,false,p_device);
   if mirror_result->>'status'<>'ok' then raise exception 'CARPET_PROJECTION_UPDATE_FAILED'; end if;
 end if;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.warehouse_v8_cut_read(p_tenant uuid, p_roll uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r warehouse_v7.carpet_roll;
begin
 perform warehouse_v7.assert_command_identity(p_tenant,auth.uid());
 select * into r from warehouse_v7.carpet_roll where tenant_id=p_tenant and id=p_roll;
 if not found then raise exception 'ROLL_NOT_FOUND'; end if;
 return jsonb_build_object('id',r.id,'roll_number',r.roll_number,'version',r.version,
 'remaining_sixteenths',r.remaining_sixteenths,'lifecycle',r.lifecycle);
end $function$
;
revoke all on function public.warehouse_v8_cut_read(uuid,uuid) from public,anon;
grant execute on function public.warehouse_v8_cut_read(uuid,uuid) to authenticated;
revoke all on function public.warehouse_v8_cut_commit(uuid,uuid,uuid,bigint,bigint,jsonb,text) from public,anon;
grant execute on function public.warehouse_v8_cut_commit(uuid,uuid,uuid,bigint,bigint,jsonb,text) to authenticated;
notify pgrst,'reload schema';
