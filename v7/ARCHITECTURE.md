# RUNLU Warehouse OS V7 — Foundation Contract

## Non-negotiable architecture
1. Supabase/Postgres is the only system of record. Browser storage is never authoritative.
2. Commands are small immutable business intents; never save whole warehouse datasets.
3. Every command has a client-generated UUID idempotency key. The database accepts it once.
4. Business entities have stable UUID identity plus human keys (for example RC2291).
5. Inventory quantity/balance is derived from an append-only movement ledger, not overwritten arrays.
6. Every mutation is one database transaction: validate preconditions, append event/movement, update projection, commit.
7. Optimistic concurrency uses entity version numbers. A stale client receives a conflict response; it never silently overwrites.
8. Offline work uses a bounded IndexedDB outbox containing commands only. localStorage is UI preferences only.
9. Deletes are lifecycle states/tombstones. Historical events are immutable.
10. Migration from V6 is read-only source -> staging -> validation -> canonical V7. No V6 production row is edited by migration.
11. Carpet rolls are first-class entities. CUT consumes one roll state exactly once per command and creates an auditable remainder state.
12. Product, roll, PO, operation and inventory identities are explicit foreign keys, never inferred from display labels.
13. Server constraints protect invariants even if the UI has a bug.
14. RLS scopes every warehouse row to its owner/tenant.
15. Observability: command status, event id, actor/device, timestamps and migration provenance are retained.

## Initial V7 core
product_master_v7
carpet_roll_v7
stock_item_v7
warehouse_command_v7
inventory_movement_v7
warehouse_event_v7
migration_staging_v7

## Command lifecycle
RECEIVE -> PUT_AWAY -> CUT -> TRANSFER -> SHIP -> RETURN

Each command returns: command_id, status, affected entity ids, new entity versions.
Repeated submission of the same command_id returns the original result and performs zero additional business mutation.

## Migration gate
V6 remains untouched. Import is prohibited until staging reports:
- stable source identity
- duplicate classification
- orphan classification
- referential-integrity result
- row-count reconciliation
- explicit exceptions list

RC2253 remains migration-deferred until physical verification.
