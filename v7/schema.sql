-- RUNLU Warehouse OS V7 schema draft. Engineering only; not applied to production.
create schema if not exists warehouse_v7;

create table warehouse_v7.product (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, legacy_record_id text,
 sku text, name text not null, colour text, unit text not null,
 version bigint not null default 1 check(version>0), lifecycle text not null default 'active',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,id), unique(tenant_id,legacy_record_id)
);

create table warehouse_v7.carpet_roll (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, roll_number text not null,
 product_id uuid, original_inches integer not null check(original_inches>=0),
 remaining_inches integer not null check(remaining_inches>=0 and remaining_inches<=original_inches),
 measure_status text not null check(measure_status in ('FULL','CAL','TM')),
 location text, version bigint not null default 1 check(version>0),
 lifecycle text not null default 'active', legacy_record_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,roll_number), unique(tenant_id,id),
 foreign key(tenant_id,product_id) references warehouse_v7.product(tenant_id,id)
);

create table warehouse_v7.command (
 id uuid primary key, tenant_id uuid not null, command_type text not null,
 entity_type text not null, entity_id uuid, expected_version bigint,
 payload jsonb not null default '{}', status text not null default 'accepted'
 check(status in ('accepted','committed','rejected')),
 result jsonb, actor_id uuid, device_id text,
 created_at timestamptz not null default now(), committed_at timestamptz,
 unique(tenant_id,id)
);

create table warehouse_v7.event (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
 command_id uuid not null, entity_type text not null, entity_id uuid not null,
 event_type text not null, entity_version bigint not null, payload jsonb not null default '{}',
 created_at timestamptz not null default now(),
 unique(tenant_id,command_id,entity_type,entity_id,event_type),
 foreign key(tenant_id,command_id) references warehouse_v7.command(tenant_id,id)
);

create table warehouse_v7.inventory_movement (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, command_id uuid not null,
 product_id uuid, carpet_roll_id uuid, movement_type text not null,
 quantity numeric not null, unit text not null, from_location text, to_location text,
 created_at timestamptz not null default now(),
 check(product_id is not null or carpet_roll_id is not null),
 unique(tenant_id,command_id,movement_type,product_id,carpet_roll_id,from_location,to_location),
 foreign key(tenant_id,command_id) references warehouse_v7.command(tenant_id,id),
 foreign key(tenant_id,product_id) references warehouse_v7.product(tenant_id,id),
 foreign key(tenant_id,carpet_roll_id) references warehouse_v7.carpet_roll(tenant_id,id)
);

create table warehouse_v7.migration_staging (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
 source_dataset text not null, source_record_id text not null, source_payload jsonb not null,
 source_deleted_at timestamptz, classification text not null default 'unreviewed',
 canonical_key text, exception_reason text, imported_entity_type text, imported_entity_id uuid,
 staged_at timestamptz not null default now(),
 unique(tenant_id,source_dataset,source_record_id)
);

-- Server-only CUT contract: command id is idempotency key; row lock + expected version
-- + nonnegative remainder must be enforced in one transaction/function.
