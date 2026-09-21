-- Warehouse V7 incremental shadow control state.
-- Control-plane metadata only: no production inventory/business writes.

create schema if not exists warehouse_v7_shadow;

create table if not exists warehouse_v7_shadow.watermark (
  feed_key text primary key,
  committed_updated_at timestamptz not null,
  committed_dataset_key text not null,
  committed_record_id text not null,
  version bigint not null default 0 check (version >= 0),
  last_batch_fingerprint text,
  last_row_count integer not null default 0 check (last_row_count >= 0),
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into warehouse_v7_shadow.watermark(
  feed_key, committed_updated_at, committed_dataset_key, committed_record_id
) values (
  'warehouse-live',
  '1970-01-01 00:00:00+00'::timestamptz,
  '',
  ''
)
on conflict (feed_key) do nothing;

revoke all on schema warehouse_v7_shadow from public, anon, authenticated;
revoke all on table warehouse_v7_shadow.watermark from public, anon, authenticated;
