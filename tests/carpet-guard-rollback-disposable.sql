-- Disposable CI database only. Verifies the guard can be removed without
-- touching existing inventory rows. Transaction rolls back test changes.
BEGIN;
DO $pre$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  INSERT INTO public.warehouse_records(user_id,dataset_key,record_id,payload)
  VALUES ('11111111-1111-1111-1111-111111111111','runlu_carpet_inventory_v52',
          'rollback-conflict-before','{"roll":"RACE-RPC","manufacturerRoll":"MFR-1"}');
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='possible_duplicate_physical_roll' THEN rejected:=true; ELSE RAISE; END IF;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected guard to reject duplicate before rollback'; END IF;
END $pre$;
DROP TRIGGER IF EXISTS runlu_guard_new_carpet_identity_trg ON public.warehouse_records;
DROP FUNCTION IF EXISTS public.runlu_guard_new_carpet_identity();
DO $post$
DECLARE before_count bigint; after_count bigint;
BEGIN
 SELECT count(*) INTO before_count FROM public.warehouse_records;
 INSERT INTO public.warehouse_records(user_id,dataset_key,record_id,payload)
 VALUES ('11111111-1111-1111-1111-111111111111','runlu_carpet_inventory_v52',
         'rollback-conflict-after','{"roll":"RACE-RPC","manufacturerRoll":"MFR-1"}');
 SELECT count(*) INTO after_count FROM public.warehouse_records;
 IF after_count<>before_count+1 THEN RAISE EXCEPTION 'Unexpected inventory change after guard removal'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='runlu_guard_new_carpet_identity_trg' AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'Guard trigger still exists after rollback DDL'; END IF;
 RAISE NOTICE 'PASS disposable guard rollback: pre-drop rejection, trigger removal, inventory preserved';
END $post$;
ROLLBACK;
