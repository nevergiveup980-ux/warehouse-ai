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
