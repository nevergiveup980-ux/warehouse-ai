# Warehouse OS V7 — Real V6 Snapshot Preflight (2026-09-19)

Status: READ-ONLY production audit. No V7 schema or data was written to production Supabase.

## Current V6 cloud source

The legacy datasets are rows in `public.warehouse_records`, keyed by `dataset_key + record_id`; they are not standalone SQL tables.

| Dataset | Live rows | Tombstones |
|---|---:|---:|
| runlu_product_master_v21 | 68 | 8 |
| runlu_inventory_records_v21 | 189 | 190 |
| runlu_carpet_inventory_v52 | 530 | 10 |

Inventory's latest observed live-row update was 2026-09-18T16:42:16Z. Snapshot counts must therefore be re-read immediately before any real dry run.

## Inventory preflight

- 179 live rows have quantity > 0; 10 have quantity = 0.
- Lifecycle values include ACTIVE, USED_UP, and missing legacy lifecycle.
- 183/189 rows resolve `masterId` to a live Product Master record; the six unlinked rows reference PRD-0036 / PRD-0037 and are zero-quantity/deferred under the opening-balance gate.
- Legacy units currently observed: Box, Carton, Each, Pail, Piece, Roll.
- Product `coverageUnit` is not the same concept as physical stock unit. V7 now stores `base_unit` and `coverage_unit` separately.
- Read-only evidence resolves all 68 Product physical stock units under the conservative policy; 175 positive Inventory rows match the resolved stock unit and four remain secondary-unit evidence requiring an explicit conversion/packaging rule.
- Inventory duplicate/alias analysis is identity-aware: repeated business tuples are not enough to select a winner, and legacy payload IDs with divergent business state are conflicts.
- The verified real rehearsal produced 52 direct valid Inventory rows plus 30 strict derived alias candidates = 82 canonical Stock Items.
- No display-field duplicate group is allowed to auto-delete or auto-import blindly. Source identity/provenance remains authoritative.

## Carpet preflight — critical identity finding

Legacy `payload.roll` is NOT a physical-roll unique key.

Across 530 live rows:
- 258 duplicated display-roll groups / 264 extra rows exist.
- Example pattern: multiple real physical rolls can all display the same base roll code while manufacturer/physical IDs differ.
- Therefore V7 MUST NOT enforce uniqueness on `roll_number`.

V7 correction:
- `carpet_roll.roll_number` is a display/business label and may repeat.
- `carpet_roll.physical_key` is the migration/physical identity boundary and is tenant-unique.
- Replay rows with the same physical key must converge/quarantine; two different physical keys may share the same display roll code.

Strong legacy physical-key precedence for automatic migration:
1. nonblank `physicalRollId` -> `physical:<physicalRollId>`
2. nonblank `sourceRoll + manufacturerRoll` -> `source_mfg:<sourceRoll>|<manufacturerRoll>`
3. nonblank `roll + manufacturerRoll` -> `roll_mfg:<roll>|<manufacturerRoll>`
4. otherwise: weak identity. Default is DEFERRED. A later forensic rule may promote only a separately derived alias-group candidate when two rows have exact business state, the same nonblank legacy payload id, the same nonblank spreadsheet legacy key, the same nonblank migration source, and that payload id has no divergent business state anywhere else. The original rows remain duplicate evidence.

For the 469 rows whose legacy status is `Active`:
- 137 rows currently have a strong key, representing 71 distinct strong physical identities.
- 332 rows do not have a manufacturer/physical strong key.
- Of those 332, read-only provenance analysis found 152 strict alias-replay groups safe enough to represent as derived physical candidates; 143 currently pass the remaining Product/location/measure/bounds gates.
- The remaining weak rows/groups stay DEFERRED/CONFLICT/ORPHAN rather than being guessed into canonical V7.
- 62 strong-key duplicate groups account for 66 replay/duplicate extras.
- 14 Active rows have no location.
- 459 Active rows use canonical measure states FULL/CAL/TM; 10 use blank/CAL* and require normalization/review.

Legacy carpet status distribution across 530 live rows:
- Active: 469
- Used Up: 21
- Pending: 26
- At Store: 10
- Split to RAM: 4

Only operationally eligible rows may become V7 opening carpet inventory. Non-Active statuses remain staging/history until explicit migration rules exist.

## Carpet Product identity

The existing Product Master does not directly identify broadloom carpet rows by `collection + colour`; the read-only audit produced zero unique matches.

A safer derived product identity is the carpet source code:
- `sourceRoll` is present on 490/530 live carpet rows.
- A deterministic roll-prefix fallback gives a source code for the remainder; no live row is left without a derived source code in the current snapshot.
- 243 nonblank derived source codes exist in the current snapshot.
- 241 source codes have one consistent collection/colour label set suitable for automatic derived-Product candidacy.
- 2 source codes (CHC022 and CHC023) have material label variants and must be CONFLICT until reviewed.

Planned canonical derived legacy ID:
`CARPET_SOURCE:<normalized source code>`

These derived Product records must enter staging and pass the same valid-only Product import boundary before any Carpet Roll can reference them.

## Migration gate before first real dry run

A real V6 snapshot dry run may begin only when all are true:

1. Product import PASS.
2. Location import PASS.
3. Stock Item + opening ledger import PASS.
4. Carpet Roll + opening ledger import PASS.
5. Carpet physical identity uses `physical_key`, never display `roll_number`.
6. Derived broadloom Product staging is implemented.
7. Snapshot transformer classifies duplicate/orphan/conflict/deferred without destructive cleanup.
8. The dry run executes outside production and produces reconciliation counts before any production V7 write.

Multiple full real-data dry runs have now completed successfully outside production. The latest verified identity/unit rehearsal produced 309 Products, 97 Locations, 82 Stock Items and 152 Carpet Rolls with 234 opening Commands/Movements/Events and zero invalid canonical links. Production V6 data and Production V7 schema/data remained untouched; the same rule continues for all follow-up rehearsals.
