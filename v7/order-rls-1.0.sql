-- V7 Orders RLS 1.0 — apply after order-engine-1.0.sql.
-- Order records are operational; source evidence is migration/audit material.

alter table warehouse_v7.order_record enable row level security;
alter table warehouse_v7.order_record force row level security;
alter table warehouse_v7.order_source_evidence enable row level security;
alter table warehouse_v7.order_source_evidence force row level security;

drop policy if exists tenant_member_select on warehouse_v7.order_record;
create policy tenant_member_select on warehouse_v7.order_record
  for select using (warehouse_v7.is_tenant_member(tenant_id));

drop policy if exists tenant_member_insert on warehouse_v7.order_record;
drop policy if exists tenant_member_update on warehouse_v7.order_record;
drop policy if exists tenant_member_delete on warehouse_v7.order_record;
create policy tenant_member_insert on warehouse_v7.order_record
  for insert with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin','operator'])
  );
create policy tenant_member_update on warehouse_v7.order_record
  for update using (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin','operator'])
  ) with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin','operator'])
  );
-- No DELETE policy: orders are archived, never hard-deleted by application roles.

drop policy if exists tenant_member_select on warehouse_v7.order_source_evidence;
create policy tenant_member_select on warehouse_v7.order_source_evidence
  for select using (warehouse_v7.is_tenant_member(tenant_id));

drop policy if exists tenant_member_insert on warehouse_v7.order_source_evidence;
drop policy if exists tenant_member_update on warehouse_v7.order_source_evidence;
drop policy if exists tenant_member_delete on warehouse_v7.order_source_evidence;
create policy tenant_member_insert on warehouse_v7.order_source_evidence
  for insert with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin'])
  );
-- Source evidence is append-only: no UPDATE or DELETE policy.


alter table warehouse_v7.order_exception_case enable row level security;
alter table warehouse_v7.order_exception_case force row level security;
alter table warehouse_v7.order_exception_decision enable row level security;
alter table warehouse_v7.order_exception_decision force row level security;

drop policy if exists tenant_member_select on warehouse_v7.order_exception_case;
create policy tenant_member_select on warehouse_v7.order_exception_case
  for select using (warehouse_v7.is_tenant_member(tenant_id));

drop policy if exists tenant_admin_insert on warehouse_v7.order_exception_case;
drop policy if exists tenant_admin_update on warehouse_v7.order_exception_case;
drop policy if exists tenant_admin_delete on warehouse_v7.order_exception_case;
create policy tenant_admin_insert on warehouse_v7.order_exception_case
  for insert with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin'])
  );
create policy tenant_admin_update on warehouse_v7.order_exception_case
  for update using (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin'])
  ) with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin'])
  );
-- No DELETE policy: exception cases remain auditable.

drop policy if exists tenant_member_select on warehouse_v7.order_exception_decision;
create policy tenant_member_select on warehouse_v7.order_exception_decision
  for select using (warehouse_v7.is_tenant_member(tenant_id));

drop policy if exists tenant_admin_insert on warehouse_v7.order_exception_decision;
drop policy if exists tenant_admin_update on warehouse_v7.order_exception_decision;
drop policy if exists tenant_admin_delete on warehouse_v7.order_exception_decision;
create policy tenant_admin_insert on warehouse_v7.order_exception_decision
  for insert with check (
    warehouse_v7.has_tenant_role(tenant_id,ARRAY['owner','admin'])
  );
-- Decisions are append-only: no UPDATE or DELETE policy.
