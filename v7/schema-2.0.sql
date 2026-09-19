-- Warehouse OS V7 Schema 2.0 — engineering draft only.
create schema if not exists warehouse_v7;

create table warehouse_v7.location (
 tenant_id uuid not null, id uuid not null default gen_random_uuid(), code text not null,
 kind text not null default 'rack', lifecycle text not null default 'active',
 created_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,code)
);

create table warehouse_v7.product (
 tenant_id uuid not null, id uuid not null default gen_random_uuid(), legacy_record_id text,
 sku text, name text not null, colour text, base_unit text not null,
 version bigint not null default 1 check(version>0), lifecycle text not null default 'active',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,legacy_record_id)
);

create table warehouse_v7.stock_item (
 tenant_id uuid not null, id uuid not null default gen_random_uuid(),
 product_id uuid not null, location_id uuid, quantity numeric(18,6) not null default 0 check(quantity>=0),
 unit text not null, version bigint not null default 1 check(version>0),
 lifecycle text not null default 'active', legacy_record_id text,
 primary key(tenant_id,id),
 foreign key(tenant_id,product_id) references warehouse_v7.product(tenant_id,id) on delete restrict,
 foreign key(tenant_id,location_id) references warehouse_v7.location(tenant_id,id) on delete restrict,
 unique(tenant_id,legacy_record_id)
);

create table warehouse_v7.carpet_roll (
 tenant_id uuid not null, id uuid not null default gen_random_uuid(), roll_number text not null,
 physical_key text not null default ('v7:'||gen_random_uuid()::text), manufacturer_roll text, source_roll text,
 product_id uuid not null, location_id uuid,
 original_sixteenths bigint not null check(original_sixteenths>=0),
 remaining_sixteenths bigint not null check(remaining_sixteenths>=0 and remaining_sixteenths<=original_sixteenths),
 measure_status text not null check(measure_status in ('FULL','CAL','TM')),
 version bigint not null default 1 check(version>0), lifecycle text not null default 'active',
 legacy_record_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,physical_key), unique(tenant_id,legacy_record_id),
 foreign key(tenant_id,product_id) references warehouse_v7.product(tenant_id,id) on delete restrict,
 foreign key(tenant_id,location_id) references warehouse_v7.location(tenant_id,id) on delete restrict
);

create table warehouse_v7.command (
 tenant_id uuid not null, id uuid not null, command_type text not null, entity_type text not null,
 entity_id uuid, expected_version bigint, payload jsonb not null default '{}',
 payload_fingerprint text not null, status text not null default 'accepted'
 check(status in ('accepted','committed','rejected')), result jsonb, rejection_code text,
 actor_id uuid, device_id text, created_at timestamptz not null default now(), committed_at timestamptz,
 primary key(tenant_id,id)
);

create table warehouse_v7.event (
 tenant_id uuid not null, id uuid not null default gen_random_uuid(), command_id uuid not null,
 entity_type text not null, entity_id uuid not null, event_type text not null,
 entity_version bigint not null, payload jsonb not null default '{}', created_at timestamptz not null default now(),
 primary key(tenant_id,id),
 foreign key(tenant_id,command_id) references warehouse_v7.command(tenant_id,id) on delete restrict,
 unique(tenant_id,command_id,entity_type,entity_id,event_type)
);

create table warehouse_v7.inventory_movement (
 tenant_id uuid not null, id uuid not null default gen_random_uuid(), command_id uuid not null,
 product_id uuid, stock_item_id uuid, carpet_roll_id uuid, movement_type text not null,
 quantity numeric(18,6) not null, unit text not null, from_location_id uuid, to_location_id uuid,
 created_at timestamptz not null default now(), primary key(tenant_id,id),
 check(product_id is not null or stock_item_id is not null or carpet_roll_id is not null),
 check(not (stock_item_id is not null and carpet_roll_id is not null)),
 foreign key(tenant_id,command_id) references warehouse_v7.command(tenant_id,id) on delete restrict,
 foreign key(tenant_id,product_id) references warehouse_v7.product(tenant_id,id) on delete restrict,
 foreign key(tenant_id,stock_item_id) references warehouse_v7.stock_item(tenant_id,id) on delete restrict,
 foreign key(tenant_id,carpet_roll_id) references warehouse_v7.carpet_roll(tenant_id,id) on delete restrict,
 foreign key(tenant_id,from_location_id) references warehouse_v7.location(tenant_id,id) on delete restrict,
 foreign key(tenant_id,to_location_id) references warehouse_v7.location(tenant_id,id) on delete restrict,
 unique(tenant_id,command_id,movement_type,stock_item_id,carpet_roll_id)
);

create unique index if not exists inventory_movement_stock_cause_uq
 on warehouse_v7.inventory_movement(tenant_id,command_id,movement_type,stock_item_id)
 where stock_item_id is not null and carpet_roll_id is null;

create unique index if not exists inventory_movement_roll_cause_uq
 on warehouse_v7.inventory_movement(tenant_id,command_id,movement_type,carpet_roll_id)
 where carpet_roll_id is not null and stock_item_id is null;

create unique index if not exists inventory_movement_product_only_cause_uq
 on warehouse_v7.inventory_movement(tenant_id,command_id,movement_type,product_id)
 where product_id is not null and stock_item_id is null and carpet_roll_id is null;

create table warehouse_v7.migration_staging (
 tenant_id uuid not null, id uuid not null default gen_random_uuid(),
 source_dataset text not null, source_record_id text not null, source_payload jsonb not null,
 classification text not null default 'unreviewed', canonical_key text, exception_reason text,
 imported_entity_type text, imported_entity_id uuid, staged_at timestamptz not null default now(),
 primary key(tenant_id,id), unique(tenant_id,source_dataset,source_record_id)
);

-- No operational table cascades deletes. No global pause/state table exists.
