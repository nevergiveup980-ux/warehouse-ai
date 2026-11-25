# Warehouse carpet duplicate review

This read-only audit covers the warehouse account's `runlu_carpet_inventory_v52` dataset in `warehouse_records` on 2026-11-24 UTC. The cloud has 299 non-deleted rows (237 with payload status Active) and 14 tombstones. These are raw cloud counts, before inventory display and label eligibility filters.

| Duplicate key among non-deleted rows | Groups | Rows in groups | Rows beyond one per group |
| --- | ---: | ---: | ---: |
| Normalized business roll number | 14 | 32 | 18 |
| Canonical `record_id` | 0 | 0 | 0 |
| Legacy payload `id` | 0 | 0 | 0 |
| Normalized manufacturer roll | 14 | 38 | 24 |

Normalization removes non-alphanumeric characters and uppercases values. Manufacturer counts omit blank and known placeholder values including 0, UNKNOWN and PENDING. Scopes overlap. Excess counts describe group sizes and are not deletion recommendations.

RC2358 has two non-deleted Pending rows with distinct canonical and payload IDs. RC2388 has one non-deleted Active row. RC2388 contains 2358 in historical `sourceRoll`, `rollNumber` and review text. Current roll-number searches use the displayed business roll and label selection uses canonical `record_id`. The duplicate RC2358 rows remain visible and their labels are blocked.

## Separate cleanup approval

1. Export a private read-only review list keyed by canonical record ID with normalized roll, manufacturer roll, create/update provenance and version. Reconcile with receiving, cuts, transfers, returns, prior tombstones and any held device operations.
2. Have a warehouse operator distinguish physical rolls, intentional shared roll numbers, exact replays and conflicting copies. Select the survivor per replay group and document which dependent records require remapping. Retain groups with unresolved provenance.
3. Agree on backup and rollback conditions before any writes. Rehearse remapping and version-checked tombstones against an isolated database, verify quantities, lineage, label eligibility and idempotency, then request separate approval and a separate change.

This draft applies no production cleanup or database migration.
