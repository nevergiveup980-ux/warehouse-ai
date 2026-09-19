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

V7 separates two meanings that V6 mixed together:
- `base_unit` = physical stock-counting unit.
- `coverage_unit` = coverage/display metadata and never authorizes quantity conversion.

Base-unit resolution is evidence-first:
1. one positive live Inventory unit -> use that unit;
2. multiple observed units -> legacy coverage may break the tie only when its mapped unit is one of the observed units;
3. no live Inventory for known rolled Underlay / Spill Blocker -> ROLL;
4. otherwise a recognized legacy coverage unit is a fallback;
5. unresolved evidence -> CONFLICT.

Current read-only classification:
- VALID: 68
- CONFLICT: 0

This correctly keeps examples such as PAIL-counted adhesive separate from GAL coverage semantics and preserves secondary EACH/Piece evidence without silently converting it.

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

Verified real-snapshot classification of 189 live V6 Inventory rows after identity and stock-unit hardening:
- VALID direct rows: 52
- DUPLICATE quarantine: 105
- CONFLICT: 22
- DEFERRED: 10
- ORPHAN imported opening rows: 0
- DERIVED INVENTORY alias candidates: 30 VALID

Rules:
1. quantity <= 0 -> DEFERRED; it does not create opening balance.
2. missing/uncanonical Product -> ORPHAN/CONFLICT depending on the earlier gate.
3. unknown unit -> CONFLICT.
4. inventory unit != Product physical `base_unit` -> CONFLICT; no implicit conversion.
5. `PHYSICAL COUNT REQUIRED` / missing physical location -> DEFERRED.
6. duplicate grouping includes Product + PO + Location + normalized unit + quantity + lot.
7. a repeated legacy payload `id` with different business states -> `INVENTORY_ID_STATE_DIVERGENCE` CONFLICT; a stale state is never allowed to masquerade as a second current stock item.
8. duplicate source rows never elect a winner.
9. a separate derived record `INVENTORY_ALIAS:<legacy payload id>` is created only when one explicit wrapper-to-peer alias edge is proven by matching business state, wrapper identity, ACTIVE lifecycle, zero transaction count, self-identifying target and no divergent target state.
10. only direct VALID rows plus VALID derived alias records become opening Stock Items.

The successful real rehearsal imported 52 direct Stock Items + 30 derived alias Stock Items = **82 canonical opening Stock Items**. The original duplicate/replay rows remain staged as evidence.

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

The latest verified real rehearsal after Inventory alias recovery and Product stock-unit separation reconciled:
- canonical Products: 309
- canonical Locations: 97
- canonical Stock Items: 82
- canonical Carpet Rolls: 152
- opening Commands / Movements / Events: 234 each
- invalid rows with canonical links: 0
- Production writes: 0

Only after quantity-level and identity-level reconciliation also remain green do we consider a controlled Production V7 migration.
