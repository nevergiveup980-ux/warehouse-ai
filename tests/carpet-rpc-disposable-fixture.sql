-- Disposable PostgreSQL only. Do not execute against production.
-- Integration fixture exercises the actual draft RPC function, with isolated
-- stub auth.uid(), access control and warehouse_apply_mutation().
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('runlu.test_uid', true),'')::uuid
$$;
SELECT set_config('runlu.test_uid','11111111-1111-1111-1111-111111111111',false);
CREATE TABLE public.warehouse_mutations(
 user_id uuid NOT NULL, operation_id uuid NOT NULL, dataset_key text,
 record_id text, device_id text, mutation_kind text, base_version bigint,
 result_version bigint, status text, result jsonb,
 PRIMARY KEY(user_id,operation_id)
);
CREATE OR REPLACE FUNCTION public.runlu_can_use_warehouse_cloud()
RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE OR REPLACE FUNCTION public.warehouse_apply_mutation(
 p_dataset_key text,p_record_id text,p_payload jsonb,
 p_base_version bigint,p_delete boolean,p_device_id text
) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF p_delete THEN
  UPDATE public.warehouse_records SET deleted_at=now()
  WHERE user_id=auth.uid() AND record_id=p_record_id;
  RETURN jsonb_build_object('status','ok','record',jsonb_build_object('version',1));
 END IF;
 INSERT INTO public.warehouse_records(user_id,dataset_key,record_id,payload,deleted_at)
 VALUES(auth.uid(),p_dataset_key,p_record_id,p_payload,NULL);
 RETURN jsonb_build_object('status','ok','record',jsonb_build_object('version',1));
END $$;
