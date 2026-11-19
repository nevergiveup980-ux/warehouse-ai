-- Executed ONLY in disposable GitHub PostgreSQL.
DO $verify$
DECLARE
 v1 jsonb; v2 jsonb; v3 jsonb; v4 jsonb;
 p jsonb:='{"roll":"RACE-RPC","manufacturerRoll":"MFR-1","status":"available","length":"100"}'::jsonb;
BEGIN
 v1:=public.warehouse_apply_operation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','runlu_carpet_inventory_v52','rpc-1',p,NULL,false,'device-A');
 IF v1->>'status'<>'ok' THEN RAISE EXCEPTION 'First RPC must succeed: %',v1; END IF;
 v2:=public.warehouse_apply_operation('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','runlu_carpet_inventory_v52','rpc-2',p,NULL,false,'device-B');
 IF v2->>'status'<>'conflict' THEN RAISE EXCEPTION 'Second RPC must conflict: %',v2; END IF;
 v3:=public.warehouse_apply_operation('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','runlu_carpet_inventory_v52','rpc-2',p,NULL,false,'device-B');
 IF v3->>'status'<>'duplicate' OR v3->'original'->>'status'<>'conflict' THEN RAISE EXCEPTION 'Conflict replay must remain conflict: %',v3; END IF;
 v4:=public.warehouse_apply_operation('cccccccc-cccc-cccc-cccc-cccccccccccc','runlu_carpet_inventory_v52','rpc-3','{"roll":"RACE-RPC-NEW","manufacturerRoll":"MFR-3","status":"available"}'::jsonb,NULL,false,'device-C');
 IF v4->>'status'<>'blocked' THEN RAISE EXCEPTION 'Incomplete RPC must be blocked: %',v4; END IF;
 IF (SELECT count(*) FROM public.warehouse_records WHERE deleted_at IS NULL)<>1 THEN RAISE EXCEPTION 'Unexpected inventory row count'; END IF;
 IF (SELECT count(*) FROM public.warehouse_mutations WHERE status='applied')<>1 OR
    (SELECT count(*) FROM public.warehouse_mutations WHERE status='conflict')<>1 OR
    (SELECT count(*) FROM public.warehouse_mutations WHERE status='blocked')<>1
 THEN RAISE EXCEPTION 'Mutation ledger statuses incorrect'; END IF;
 RAISE NOTICE 'PASS RPC success, conflict, replayed conflict, blocked, and mutation ledger';
END $verify$;
