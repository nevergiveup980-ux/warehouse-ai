-- Draft migration for atomic corrections of legacy user_datasets rows.
-- NOT applied to any Supabase environment. Requires review of dataset ownership and migration.
-- RPC is intentionally NOT granted to authenticated until server-side inventory/receipt
-- identity and dependency checks are implemented. This is a schema prerequisite only.
create table if not exists public.warehouse_record_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  record_type text not null,
  record_id text not null,
  expected_revision text not null,
  request_hash text not null,
  committed_at timestamptz not null default now(),
  result jsonb not null,
  primary key (user_id, mutation_id),
  constraint warehouse_record_mutations_record_type_chk
    check (record_type in ('receiving','operation','cutting','shipping'))
);
alter table public.warehouse_record_mutations enable row level security;
-- No client INSERT/UPDATE/DELETE policy: only a future security-invoker RPC,
-- with validated authenticated ownership, may write these rows.
drop policy if exists "warehouse mutations read own" on public.warehouse_record_mutations;
create policy "warehouse mutations read own" on public.warehouse_record_mutations
for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.warehouse_record_mutations to authenticated;
revoke insert, update, delete on public.warehouse_record_mutations from authenticated;
create index if not exists warehouse_mutations_record_lookup
  on public.warehouse_record_mutations (user_id,record_type,record_id,committed_at desc);
