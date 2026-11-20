-- Disposable PostgreSQL service ONLY: actual PostgreSQL RLS enforcement.
-- This is a simplified policy fixture, not a copy of production policies.
BEGIN;
CREATE ROLE runlu_rls_test LOGIN;
GRANT USAGE ON SCHEMA public TO runlu_rls_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_records TO runlu_rls_test;
ALTER TABLE public.warehouse_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY runlu_fixture_own_records ON public.warehouse_records
 FOR ALL TO runlu_rls_test
 USING (user_id = nullif(current_setting('runlu.test_uid',true),'')::uuid)
 WITH CHECK (user_id = nullif(current_setting('runlu.test_uid',true),'')::uuid);
INSERT INTO public.warehouse_records(user_id,dataset_key,record_id,payload)
VALUES
 ('11111111-1111-1111-1111-111111111111','rls_fixture','rls-a','{}'),
 ('22222222-2222-2222-2222-222222222222','rls_fixture','rls-b','{}');
SET ROLE runlu_rls_test;
SELECT set_config('runlu.test_uid','11111111-1111-1111-1111-111111111111',true);
DO $rls$
DECLARE n integer; denied boolean:=false;
BEGIN
 SELECT count(*) INTO n FROM public.warehouse_records WHERE dataset_key='rls_fixture';
 IF n<>1 THEN RAISE EXCEPTION 'RLS select leaked rows: %',n; END IF;
 UPDATE public.warehouse_records SET payload='{"changed":true}'::jsonb WHERE record_id='rls-b';
 IF FOUND THEN RAISE EXCEPTION 'RLS allowed update of another tenant'; END IF;
 DELETE FROM public.warehouse_records WHERE record_id='rls-b';
 IF FOUND THEN RAISE EXCEPTION 'RLS allowed delete of another tenant'; END IF;
 BEGIN
  INSERT INTO public.warehouse_records(user_id,dataset_key,record_id,payload)
  VALUES('22222222-2222-2222-2222-222222222222','rls_fixture','rls-forged','{}');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'RLS allowed forged tenant insert'; END IF;
 RAISE NOTICE 'PASS disposable PostgreSQL RLS select/update/delete isolation and forged insert rejection';
END $rls$;
RESET ROLE;
ROLLBACK;
