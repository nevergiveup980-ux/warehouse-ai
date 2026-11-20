-- Disposable integration fixture only: simulated auth identities, not Supabase JWT/RLS.
DO $tenant$
DECLARE
 a jsonb; b jsonb; v_error text;
 p jsonb:='{"roll":"RACE-RPC","manufacturerRoll":"MFR-1","status":"available","length":"70"}'::jsonb;
BEGIN
 PERFORM set_config('runlu.test_uid','22222222-2222-2222-2222-222222222222',true);
 a:=public.warehouse_apply_operation('aaaaaaaa-0000-0000-0000-000000000001','runlu_carpet_inventory_v52','tenant-2-record',p,NULL,false,'tenant-B');
 IF a->>'status'<>'ok' THEN RAISE EXCEPTION 'Second tenant must be able to write its own roll: %',a; END IF;
 b:=public.warehouse_apply_operation('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','runlu_carpet_inventory_v52','rpc-2',p,NULL,false,'tenant-B');
 IF b->>'status'<>'conflict' THEN RAISE EXCEPTION 'Second tenant own-roll collision must conflict: %',b; END IF;
 IF (SELECT count(*) FROM public.warehouse_mutations WHERE user_id=auth.uid())<>2 THEN RAISE EXCEPTION 'Second tenant ledger count incorrect'; END IF;
 PERFORM set_config('runlu.test_uid','',true);
 BEGIN
   PERFORM public.warehouse_apply_operation('aaaaaaaa-0000-0000-0000-000000000002','runlu_carpet_inventory_v52','no-auth',p,NULL,false,'no-auth');
   RAISE EXCEPTION 'Missing authentication was accepted';
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
   IF v_error<>'Authentication required' THEN RAISE EXCEPTION 'Unexpected unauthenticated response: %',v_error; END IF;
 END;
 PERFORM set_config('runlu.test_uid','11111111-1111-1111-1111-111111111111',true);
 IF (SELECT count(*) FROM public.warehouse_records WHERE user_id='22222222-2222-2222-2222-222222222222')<>1 THEN RAISE EXCEPTION 'Tenant inventory isolation count incorrect'; END IF;
 RAISE NOTICE 'PASS simulated tenant-scoped RPC collision, tenant ledger and missing auth rejection';
END $tenant$;
