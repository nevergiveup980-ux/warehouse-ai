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

-- Additional real-RPC boundary cases, each with unique operation IDs.
DO $extended$
DECLARE
 x jsonb; y jsonb;
BEGIN
 x:=public.warehouse_apply_operation('dddddddd-dddd-dddd-dddd-dddddddddddd','runlu_carpet_inventory_v52','rpc-4','{"roll":"RACE-RPC","manufacturerRoll":"MFR-2","status":"available","length":"50"}'::jsonb,NULL,false,'device-D');
 IF x->>'status'<>'ok' THEN RAISE EXCEPTION 'Distinct manufacturer roll should succeed: %',x; END IF;
 x:=public.warehouse_apply_operation('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','runlu_carpet_inventory_v52','rpc-5','{"roll":"RACE-RPC","manufacturerRoll":"","status":"available","length":"50"}'::jsonb,NULL,false,'device-E');
 IF x->>'status'<>'conflict' THEN RAISE EXCEPTION 'Ambiguous manufacturer roll must conflict: %',x; END IF;
 y:=public.warehouse_apply_operation('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','runlu_carpet_inventory_v52','rpc-5','{"roll":"RACE-RPC","manufacturerRoll":"","status":"available","length":"50"}'::jsonb,NULL,false,'device-E');
 IF y->>'status'<>'duplicate' OR y->'original'->>'status'<>'conflict' THEN RAISE EXCEPTION 'Ambiguous conflict replay must remain conflict: %',y; END IF;
 x:=public.warehouse_apply_operation('ffffffff-ffff-ffff-ffff-ffffffffffff','runlu_carpet_inventory_v52','rpc-6','{"roll":"","manufacturerRoll":"MFR-6","status":"available","length":"50"}'::jsonb,NULL,false,'device-F');
 IF x->>'status'<>'blocked' OR x->>'reason'<>'carpet_identity_requires_review' THEN RAISE EXCEPTION 'Blank roll must be blocked by trigger: %',x; END IF;
 y:=public.warehouse_apply_operation('ffffffff-ffff-ffff-ffff-ffffffffffff','runlu_carpet_inventory_v52','rpc-6','{"roll":"","manufacturerRoll":"MFR-6","status":"available","length":"50"}'::jsonb,NULL,false,'device-F');
 IF y->>'status'<>'duplicate' OR y->'original'->>'status'<>'blocked' THEN RAISE EXCEPTION 'Blocked trigger replay must remain blocked: %',y; END IF;
 IF (SELECT count(*) FROM public.warehouse_records WHERE deleted_at IS NULL)<>2 THEN RAISE EXCEPTION 'Extended RPC inventory count incorrect'; END IF;
 IF (SELECT count(*) FROM public.warehouse_mutations WHERE status='applied')<>2 OR
    (SELECT count(*) FROM public.warehouse_mutations WHERE status='conflict')<>2 OR
    (SELECT count(*) FROM public.warehouse_mutations WHERE status='blocked')<>2 THEN RAISE EXCEPTION 'Extended RPC ledger statuses incorrect'; END IF;
 RAISE NOTICE 'PASS RPC distinct manufacturer, ambiguous conflict replay, empty-roll trigger block replay, and ledger';
END $extended$;
