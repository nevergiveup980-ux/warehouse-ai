-- READ-ONLY fingerprint for the V6 datasets that feed the V7 migration rehearsal.
-- This query changes no Production state.
with src as (
  select dataset_key,record_id,payload,updated_at
  from public.warehouse_records
  where dataset_key in (
    'runlu_product_master_v21',
    'runlu_inventory_records_v21',
    'runlu_carpet_inventory_v52'
  )
    and deleted_at is null
),
per_dataset as (
  select dataset_key,
         count(*)::bigint live_rows,
         min(updated_at) min_updated_at,
         max(updated_at) max_updated_at,
         md5(string_agg(record_id||':'||payload::text,E'\n' order by record_id)) content_md5
  from src
  group by dataset_key
),
all_rows as (
  select md5(string_agg(dataset_key||':'||record_id||':'||payload::text,E'\n'
                        order by dataset_key,record_id)) snapshot_md5,
         count(*)::bigint live_rows
  from src
)
select
  (select jsonb_agg(per_dataset order by dataset_key) from per_dataset) datasets,
  (select snapshot_md5 from all_rows) snapshot_md5,
  (select live_rows from all_rows) total_live_rows,
  now() audited_at;
