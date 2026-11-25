create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email', current_setting('test.email',true)) $$;
grant usage on schema auth to authenticated;
create table public.warehouse_records(
 user_id uuid not null references auth.users(id), dataset_key text not null, record_id text not null,
 payload jsonb not null, version bigint not null, deleted_at timestamptz,
 primary key(user_id,dataset_key,record_id)
);
alter table public.warehouse_records enable row level security;
grant select,insert,update on public.warehouse_records to authenticated;
create policy own_records on public.warehouse_records for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Synthetic implementation of the existing versioned mutation contract.
create function public.warehouse_apply_mutation(k text, id text, p jsonb, v bigint, d boolean, device text)
returns jsonb language plpgsql as $$
begin
 if d and p->>'_runluDeleteIntent' <> 'explicit-user-delete' then return '{"status":"blocked"}'; end if;
 if exists(select 1 from public.warehouse_records where user_id=auth.uid() and dataset_key=k and record_id=id) then
   update public.warehouse_records
   set payload=case when d then warehouse_records.payload else p end,
       version=warehouse_records.version+1, deleted_at=case when d then now() end
   where user_id=auth.uid() and dataset_key=k and record_id=id and version=v;
 else
   insert into public.warehouse_records values(auth.uid(),k,id,p,1,null);
 end if;
 return jsonb_build_object('status',case when found then 'ok' else 'conflict' end);
end;
$$;
create schema warehouse_v7;
create table warehouse_v7.location(tenant_id uuid,id uuid primary key,code text,lifecycle text default 'active');
create table warehouse_v7.product(tenant_id uuid,id uuid primary key,name text,colour text,lifecycle text default 'active');
create function warehouse_v7.assert_command_identity(t uuid, u uuid) returns void language plpgsql as $$
begin if u is distinct from auth.uid() then raise exception 'Actor mismatch'; end if; end; $$;
create table warehouse_v7.carpet_roll(tenant_id uuid,id uuid primary key,roll_number text,manufacturer_roll text,source_roll text,product_id uuid,location_id uuid,remaining_sixteenths bigint,version bigint,original_sixteenths bigint default 9600,measure_status text default 'CAL',lifecycle text default 'active',updated_at timestamptz default now());
grant usage on schema warehouse_v7 to authenticated;
grant select,update on warehouse_v7.carpet_roll to authenticated;
-- Synthetic implementation of the paired cut RPC contract.
create function warehouse_v7.cut_carpet_roll(t uuid, cmd uuid, roll uuid, expected bigint, deduct bigint, p jsonb, actor uuid, device text)
returns jsonb language sql as $$
 update warehouse_v7.carpet_roll set remaining_sixteenths=remaining_sixteenths-deduct,version=version+1
 where id=roll and tenant_id=t and version=expected and remaining_sixteenths>=deduct
 returning jsonb_build_object('status','committed','remaining_sixteenths',remaining_sixteenths,'new_version',version)
$$;
