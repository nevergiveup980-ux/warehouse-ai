# Warehouse OS V7 — Real V6 Dry-Run Checkpoint

Captured: 2026-09-19
Mode: READ-ONLY production V6 source inspection. Production writes: **0**.

This checkpoint records aggregate migration facts only. No warehouse row payloads or production credentials are committed to Git.

## Source scope

Live records inspected from:
- `runlu_product_master_v21`
- `runlu_inventory_records_v21`
- `runlu_carpet_inventory_v52`

Live source rows in these three datasets: **787**.
Latest source-row update observed before this checkpoint: **2026-09-18 16:42:16.062044+00**.

## Current classifier result

| Domain | Valid | Duplicate | Conflict | Deferred | Orphan | Total |
|---|---:|---:|---:|---:|---:|---:|
| Product Master | 68 | 0 | 0 | 0 | 0 | 68 |
| Inventory | 52 | 112 | 15 | 10 | 0 | 189 |
| Carpet Roll | 9 | 94 | 32 | 383 | 12 | 530 |

Derived carpet Product candidates:
- 243 nonblank source codes
- 241 valid
- 2 conflict
- 0 deferred

Distinct nonblank location strings discovered from Inventory + Carpet: **98**.
- 97 are current location candidates.
- 1 sentinel value, `PHYSICAL COUNT REQUIRED`, is explicitly excluded from canonical Location import.

## Conservative expected canonical import, if this exact snapshot were loaded

This is a pre-import expectation, not a production migration:
- Product rows: 68 Product Master + 241 derived carpet Products = **309**
- Location rows: **97** current candidates
- Stock Items: **52**
- Carpet Rolls: **9**
- Opening inventory commands/movements/events: **61** (52 Stock + 9 Carpet)

Quarantined/not auto-imported:
- Inventory: 137 rows
- Carpet: 521 rows
- Derived carpet Product: 2 source identities

No duplicate/conflict/deferred/orphan record is allowed to create a canonical entity or opening ledger entry.

## Safety status

- Production V6: read-only source.
- Production V7: no schema/data write.
- Disposable Postgres rehearsal pipeline: green.
- Migration source evidence immutability: green.
- Replay/idempotency rehearsal: green.

Next gate: feed a complete captured snapshot into an isolated disposable Postgres run, compare the actual reconciliation report against the conservative expectations above, then destroy the disposable database. The raw snapshot must not be committed to Git or stored as a workflow artifact.
