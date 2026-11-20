# Warehouse OS: silent carpet discard risk (2026-11-18)

## Verified from current production function definition (read-only)
The public.warehouse_apply_operation function has two early-return paths for carpet upserts:
1. If incoming physicalKey matches another active record, it returns status=ok, reason=duplicate_carpet_record_discarded, discarded=true.
2. If incoming physicalKey is empty and incoming business roll matches another active record, it returns **the same success/discard response without comparing manufacturerRoll**.

Both paths write warehouse_mutations with status=applied. Therefore a caller can believe an operation succeeded even though the incoming inventory row was not inserted.

This is **not** evidence that a particular legitimate roll was lost; it is a verified risk in the current function logic.

Current read-only census: 312 active carpet rows, 104 without physicalKey, 147 with nonempty manufacturerRoll.

## Required change before any deployment
- Do not treat roll-only collision as a successful duplicate discard.
- For same business roll but different credible manufacturerRoll, allow legitimate distinct physical rolls after checking product and workflow invariants; otherwise return a structured conflict requiring user review.
- For same business roll and same credible manufacturerRoll, return a structured `status='conflict'` (e.g. `possible_duplicate_physical_roll`), not `status='ok',discarded=true`.
- For blank/placeholder manufacturerRoll, require review or another trusted physical identity; never silently mark an ambiguous candidate as successfully uploaded.
- Retain idempotency for a repeated **operation_id** only; that is a different concept from physical-roll deduplication.
- Ensure clients show conflicts and stop indefinite retries without erasing local unacknowledged operations.
- Review the existing incomplete-carpet-record branch: it performs a direct DELETE of incomplete existing rows. Preserve user data until separately audited.
- Keep concurrency guard at the table write boundary. Reconcile the proposed P0001 error with RPC/client response handling.
- Add explicit regression cases: same business roll with distinct manufacturer rolls; same physical roll under a new record ID; blank physicalKey; placeholder manufacturer; repeated operation ID; two concurrent uploads; explicit deletion and update.

## Release gate
No production SQL, table permissions, triggers, cloud records, or local browser storage should be changed before a tested migration, rollback plan, backup, and explicit approval.
