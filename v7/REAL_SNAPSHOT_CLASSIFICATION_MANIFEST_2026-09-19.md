# Warehouse OS V7 — Real V6 Snapshot Classification Manifest

Date: 2026-09-19
Mode: READ-ONLY production audit + offline migration planning.
Production V6 writes performed: **0**
Production V7 writes performed: **0**

This manifest is point-in-time. Re-read counts immediately before the first real dry run because V6 remains in daily use.

## Source datasets

| Source | Live | Tombstones |
|---|---:|---:|
| runlu_product_master_v21 | 68 | 8 |
| runlu_inventory_records_v21 | 189 | 190 |
| runlu_carpet_inventory_v52 | 530 | 10 |

Legacy warehouse data lives in `public.warehouse_records`; `dataset_key` identifies the logical V6 dataset.

## Product Master transform

Legacy `coverageUnit` is the canonical source for opening Product base unit:
- SF / Box -> BOX
- Box -> BOX
- Roll -> ROLL
- Gallon -> GAL
- Pail -> PAIL

Current read-only classification:
- VALID: 68
- CONFLICT: 0

Inventory unit history is evidence, not permission to silently rewrite Product base unit.

## Derived Broadloom Product transform

Broadloom Carpet Product identity is derived from source code:
`CARPET_SOURCE:<normalized sourceRoll / roll prefix>`.

Current source-code groups:
- VALID consistent source products: 241
- CONFLICT source products: 2
- Current conflicts: CHC022, CHC023

A conflicting source keeps every observed label in migration evidence. No label wins automatically.

## Location transform

The first real snapshot rehearsal produced 97 canonical Location identities.

Breakdown:
- 94 locations are referenced by live Inventory or Active Carpet after excluding the exception marker `PHYSICAL COUNT REQUIRED`.
- 3 additional identities are historical-reference locations used only by non-Active Carpet: `13B` (Used Up), `RAM Archive` (Split to RAM), and `Store` (At Store).
- Historical reference locations are preserved so old events/entities remain resolvable; they do not create opening inventory by themselves.

Location kind normalization is explicit for known non-rack concepts: Receiving -> `receiving`, Receiving / Put-away Pending -> `receiving_staging`, Store -> `store`, Store samples -> `sample_store`, RAM Archive -> `archive`; other labels remain `rack`.

No spelling/alias cleanup is destructive during snapshot transformation. Labels such as `Corner` and typo-looking `Cornet` remain distinct until explicit review.

## Inventory opening-stock classification

Unit normalization at the boundary:
- Box / Carton -> BOX
- Each / Piece -> EACH
- Pail -> PAIL
- Roll -> ROLL
- other unknown units -> CONFLICT

Conservative current classification of 189 live V6 inventory rows:
- VALID: 52
- DUPLICATE quarantine: 112
- CONFLICT: 15
- DEFERRED: 10
- ORPHAN: 0

Rules:
1. quantity <= 0 -> DEFERRED; it does not create opening balance.
2. missing Product -> ORPHAN.
3. unknown unit -> CONFLICT.
4. inventory unit != Product canonical base unit -> CONFLICT.
5. `PHYSICAL COUNT REQUIRED` / missing physical location -> DEFERRED.
6. repeated business tuple (Product + PO + Location + normalized unit + quantity) -> all members stay DUPLICATE quarantine; the transformer does **not** select a winner.
7. only the remainder becomes VALID opening-stock candidates.

The 15 current unit conflicts are intentionally not auto-converted. Examples include Piece/EACH against BOX-based products and PAIL against products whose legacy coverage unit says GAL.

## Carpet opening-roll classification

Physical identity precedence:
1. `physicalRollId` -> `physical:<id>`
2. `sourceRoll + manufacturerRoll` -> `source_mfg:<source>|<mfg>`
3. `roll + manufacturerRoll` -> `roll_mfg:<roll>|<mfg>`
4. otherwise -> weak identity. It stays DEFERRED unless it qualifies for the strict legacy-alias replay rule below.

`roll_number` is a display/business label and is **not unique**.

Conservative current classification of 530 live V6 carpet rows:
- VALID: 9
- DUPLICATE quarantine: 94
- CONFLICT: 32
- DEFERRED: 383
- ORPHAN: 12

Rules:
1. non-Active legacy status -> DEFERRED for opening inventory.
2. Carpet source Product conflict -> CONFLICT.
3. missing location -> ORPHAN.
4. blank / CAL* / noncanonical measure -> DEFERRED.
5. weak physical identity -> DEFERRED.
6. same physical key with divergent state -> CONFLICT.
7. same physical key with identical state replay -> DUPLICATE quarantine.
8. positive measure, remaining <= original, and FULL consistency are required before VALID.
9. RC2253 remains DEFERRED until physical verification; no migration rule may guess its measure.

### Strict legacy-alias replay recovery

A read-only forensic pass over the 332 Active rows without a strong physical key found a highly specific V6 alias pattern:
- 165 exact business-state pairs plus 2 singleton business states.
- All 165 pairs share one legacy payload id inside each pair.
- 153 pairs also share the same nonblank spreadsheet legacy key and migration source.
- After additionally rejecting any payload id that appears with divergent business state elsewhere, 152 groups qualify as strong replay evidence.
- Of those 152 groups, 143 currently pass Product, location, measure and bounds gates.

For a qualifying pair V7 does **not** choose or delete a source-row winner. Both original V6 rows remain staged as duplicate evidence. A separate derived record `CARPET_ALIAS:<legacy payload id>` represents the physical candidate and receives physical key `legacy_alias:<legacy payload id>`.

Any missing provenance, divergent state, conflicting source Product, missing location, or bad measure keeps the group out of automatic canonical import.

## Dry-run safety rule

The first real dry run completed successfully on 2026-09-19 against a disposable PostgreSQL database with zero Production V7 writes. Subsequent rehearsals must follow the same read-only source / disposable target rule.

It must produce:
- full per-record classification manifest,
- Product / Location / Stock / Carpet reconciliation counts,
- duplicate groups with every source record ID,
- orphan/conflict/deferred reports,
- opening movement/event counts,
- zero production writes.

Only after that report reconciles do we consider a controlled Production V7 migration.
