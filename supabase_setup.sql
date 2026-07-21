-- Runlu Warehouse AI V5.4.0 cloud foundation
-- Run once in Supabase Dashboard > SQL Editor.

create table if not exists public.user_datasets (
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_key text not null,
  payload jsonb not null default '[]'::jsonb,
  device_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, dataset_key)
);

alter table public.user_datasets enable row level security;

drop policy if exists "users read own warehouse datasets" on public.user_datasets;
create policy "users read own warehouse datasets"
on public.user_datasets for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users insert own warehouse datasets" on public.user_datasets;
create policy "users insert own warehouse datasets"
on public.user_datasets for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own warehouse datasets" on public.user_datasets;
create policy "users update own warehouse datasets"
on public.user_datasets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own warehouse datasets" on public.user_datasets;
create policy "users delete own warehouse datasets"
on public.user_datasets for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.set_runlu_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_runlu_dataset_updated_at on public.user_datasets;
create trigger set_runlu_dataset_updated_at
before update on public.user_datasets
for each row execute function public.set_runlu_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('runlu-files', 'runlu-files', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false;

drop policy if exists "users read own runlu files" on storage.objects;
create policy "users read own runlu files"
on storage.objects for select to authenticated
using (bucket_id = 'runlu-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "users upload own runlu files" on storage.objects;
create policy "users upload own runlu files"
on storage.objects for insert to authenticated
with check (bucket_id = 'runlu-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "users update own runlu files" on storage.objects;
create policy "users update own runlu files"
on storage.objects for update to authenticated
using (bucket_id = 'runlu-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'runlu-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "users delete own runlu files" on storage.objects;
create policy "users delete own runlu files"
on storage.objects for delete to authenticated
using (bucket_id = 'runlu-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant select, insert, update, delete on public.user_datasets to authenticated;

