# Warehouse OS — duplicate cloud inventory incident (2026-11-18)

## Verified observations
- Supabase `public.warehouse_records` contains multiple live rows for RC2375–RC2378 with different `record_id` values but the same business roll and manufacturer roll.
- Device `DEV-MWDRYK99-SI7OCZ` wrote 20 carpet records in 3 seconds (16:57:20–16:57:23 UTC) and another 6 at 17:11:23–17:11:24 UTC.
- These records have `origin=cloud-master`, and no matching entries were found in `warehouse_mutations` for that time window.
- `warehouse_apply_operation` checks operation ID and some duplicate conditions, but RLS grants authenticated users direct INSERT to `warehouse_records`. Therefore direct writes can bypass the RPC duplicate guard.
- `physicalKey` is missing on inspected RC2375/RC2376 original and replay rows.
- The office and mobile UIs both show the impact. PR #228 is only a label-UI mitigation, not the root fix.

## Required implementation (not yet applied)
1. Identify all callers that directly POST/PATCH `warehouse_records` or call `warehouse_apply_mutation`; map cloud-master import/snapshot/legacy flows.
2. Capture an audited backup of affected rows, including record_id, user_id, payload, version, origin, device_id, change_seq, and deleted_at, before any changes.
3. Introduce a server-side identity conflict check for *new* carpet inserts across all write paths. Use normalized manufacturer roll plus appropriate supplier/product identity where reliable. Never collapse different manufacturer rolls merely because a business roll matches.
4. Prefer an atomic, transaction-safe enforcement method. Determine correct handling of old rows with missing `physicalKey`; avoid a unique index on business roll alone.
5. Prevent bulk legacy re-import on devices that have already adopted cloud-master; do not replay local queues without explicit reconciliation.
6. After tests, quarantine only verified duplicate replay rows using reversible soft-delete with audit trail; do not delete historical distinct physical rolls.
7. Verify snapshot/delta, mobile inventory, label picker, cutting history and two-sided printing.
8. Only then clear site-specific office browser storage, sign in, and bootstrap from cloud. Do not push old local data.

## Production safety
No DB schema, RLS, RPC, or inventory data changes are authorized by this investigation document. Do not deploy any blanket DELETE, truncate, or roll-only uniqueness rule.

## Root-cause evidence update (2026-11-18)

- Verified the complete definition of `public.warehouse_apply_mutation`. Its insert branch checks `(user_id,dataset_key,record_id)` only and then inserts a new row with `origin='cloud-master'`. It does **not** check the carpet business identity before inserting. Different record IDs can therefore create duplicate physical carpets.
- `warehouse_apply_operation` calls `warehouse_apply_mutation` after its own guards, but `warehouse_apply_mutation` is independently executable by the authenticated role. Consequently an older or alternate caller can bypass the higher-level guard.
- Both inspected original and replay copies of RC2375 and RC2376 lack `physicalKey`.
- Recommended next implementation: centralize insert identity protection inside `warehouse_apply_mutation`, with concurrency-safe locking and carefully chosen manufacturer/product identity. Preserve the existing version checks and explicit-delete intent. Distinct manufacturer rolls sharing a business roll must not be automatically discarded.
- Separate review required for direct table INSERT permissions and RLS policies; do not revoke access without verifying snapshot, legacy clients, and all production flows.
- This update is evidence and design guidance only. No database code or data has been changed.

## Identity design review (2026-11-18, read-only)

Cloud snapshot: 312 live carpet rows; 147 rows have a manufacturerRoll; 208 have a physicalKey. ManufacturerRoll alone is **not unique**: `0000` occurs on eight distinct business rolls; `60797078` occurs on SP011-1/2/3. Short identifiers such as `4232` are reused. A blanket unique index on manufacturerRoll would corrupt legitimate workflows.

### Proposed staged protection
- Introduce an **audit-only** duplicate-candidate report keyed by owner + normalized business roll + normalized manufacturer roll (when non-placeholder), optionally supplemented by supplier/product/lot/length; never auto-delete.
- For *new* records in the lower-level mutation function, compare against active rows of the same user. If the normalized business roll **and** credible manufacturer roll match but the internal record ID differs, return `status='conflict'`, `reason='possible_duplicate_physical_roll'` and details. If a legitimate split/rename is intended, require an explicit audited reconciliation workflow.
- When manufacturerRoll is blank or a placeholder (`0000`, `N/A`, `UNKNOWN`), do **not** silently deduplicate by business roll; flag for review and enforce an explicit resolution path.
- Ensure all write paths (RPC and direct table INSERT) share the same server-side invariant, ideally via a carefully scoped trigger or constrained write API after caller compatibility testing. Avoid non-atomic SELECT-then-INSERT; use transaction-safe serialization and regression tests.
- Keep reads working while write protection is introduced. Rollback plan must restore the previous function and trigger definitions without touching data.
- Test: same physical roll/different record ID; distinct manufacturer rolls sharing a business roll; same manufacturer roll across different products; placeholders; concurrent inserts; updates; soft-deleted records; mobile and office workflows.

No SQL patch has been deployed and no inventory records have been altered by this review.
