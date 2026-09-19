-- V7 tenant identity / RLS foundation. Engineering only; production untouched.
create table if not exists warehouse_v7.tenant_member (
 tenant_id uuid not null,
 user_id uuid not null,
 role text not null check(role in ('owner','admin','operator','viewer')),
 lifecycle text not null default 'active' check(lifecycle in ('active','disabled')),
 created_at timestamptz not null default now(),
 primary key(tenant_id,user_id)
);

create or replace function warehouse_v7.current_user_id()
returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

create or replace function warehouse_v7.is_tenant_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path='' as $
 select exists(select 1 from warehouse_v7.tenant_member m
   where m.tenant_id=p_tenant and m.user_id=warehouse_v7.current_user_id() and m.lifecycle='active')
$;

create or replace function warehouse_v7.has_tenant_role(p_tenant uuid,p_roles text[])
returns boolean language sql stable security definer set search_path='' as $
 select exists(select 1 from warehouse_v7.tenant_member m
   where m.tenant_id=p_tenant and m.user_id=warehouse_v7.current_user_id()
     and m.lifecycle='active' and m.role=any(p_roles))
$;

do $$
declare t text;
begin
 foreach t in array array['location','product','stock_item','carpet_roll','command','event','inventory_movement','migration_staging'] loop
   execute format('alter table warehouse_v7.%I enable row level security',t);
   execute format('alter table warehouse_v7.%I force row level security',t);
   execute format('drop policy if exists tenant_member_select on warehouse_v7.%I',t);
   execute format('create policy tenant_member_select on warehouse_v7.%I for select using (warehouse_v7.is_tenant_member(tenant_id))',t);
 end loop;
end $$;
alter table warehouse_v7.tenant_member enable row level security;
alter table warehouse_v7.tenant_member force row level security;
drop policy if exists own_membership_select on warehouse_v7.tenant_member;
create policy own_membership_select on warehouse_v7.tenant_member for select
 using(user_id=warehouse_v7.current_user_id());

-- Role-aware write policies. Viewer is read-only.
-- Master/config + migration require owner/admin; operational records allow operator.
do $$
declare t text;
begin
 foreach t in array array['stock_item','carpet_roll','command','event','inventory_movement'] loop
   execute format('drop policy if exists tenant_member_insert on warehouse_v7.%I',t);
   execute format('drop policy if exists tenant_member_update on warehouse_v7.%I',t);
   execute format('drop policy if exists tenant_member_delete on warehouse_v7.%I',t);
   execute format('create policy tenant_member_insert on warehouse_v7.%I for insert with check (warehouse_v7.has_tenant_role(tenant_id,ARRAY[''owner'',''admin'',''operator'']))',t);
   execute format('create policy tenant_member_update on warehouse_v7.%I for update using (warehouse_v7.has_tenant_role(tenant_id,ARRAY[''owner'',''admin'',''operator''])) with check (warehouse_v7.has_tenant_role(tenant_id,ARRAY[''owner'',''admin'',''operator'']))',t);
   execute format('create policy tenant_member_delete on warehouse_v7.%I for delete using (warehouse_v7.has_tenant_role(tenant_id,ARRAY[''owner'',''admin'',''operator'']))',t);
 end loop;
 foreach t in array array['location','product','migration_staging'] loop
   execute format('drop policy if exists tenant_member_insert on warehouse_v7.%I',t);
   execute format('drop policy if exists tenant_member_update on warehouse_v7.%I',t);
   execute format('drop policy if exists tenant_member_delete on warehouse_v7.%I',t);
   execute format('create policy tenant_member_insert on warehouse_v7.%I for insert with check (warehouse_v7.has_tenant_role(tenant_id,ARRAY[''owner'',''admin'']))',t);
   execute format('create policy tenant_member_update on warehouse_v7.%I for update using (warehouse_v7.has_tenant_role(tenant_id,ARRAY[''owner'',''admin''])) with check (warehouse_v7.has_tenant_role(tenant_id,ARRAY[''owner'',''admin'']))',t);
   execute format('create policy tenant_member_delete on warehouse_v7.%I for delete using (warehouse_v7.has_tenant_role(tenant_id,ARRAY[''owner'',''admin'']))',t);
 end loop;
end $$;
