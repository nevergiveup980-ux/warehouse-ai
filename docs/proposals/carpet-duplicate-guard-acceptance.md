# Duplicate guard acceptance checklist — REVIEW ONLY

## Current read-only baseline
- 312 active carpet rows at last census.
- 27 duplicate candidate groups by owner + normalized business roll + normalized manufacturerRoll, representing 27 extra candidate rows.
- 24 groups have a non-placeholder manufacturerRoll. None are automatically approved for deletion.
- RC2375–RC2378 are examples with a different internal record ID but the same physical identifiers.
- The proposed trigger raises SQLSTATE P0001, not 23505, to avoid collision with the existing warehouse_apply_operation unique_violation handler.

## Predeployment gates
1. Export verified backup of all warehouse_records and warehouse_mutations (with row counts and restoration instructions).
2. Confirm function definitions, RLS, trigger order and exact client write paths in production.
3. Run the proposed SQL against a disposable database populated with representative fixtures; **never test inserts against production inventory**.
4. Confirm same roll + same non-placeholder manufacturerRoll + new record ID is rejected.
5. Confirm different manufacturerRoll values under same business roll remain allowed (subject to workflow).
6. Confirm same manufacturerRoll used for different business rolls is allowed.
7. Confirm placeholders and missing manufacturerRoll are not silently discarded; raise follow-up review requirement.
8. Confirm UPDATE of existing rows, explicit delete, snapshots, delta polling, label picker, cut log, mobile and office editing still work.
9. Concurrent insertion: exactly one of two simultaneous inserts succeeds; no deadlocks.
10. Confirm RPC caller receives an actionable error and queue does not retry indefinitely or mislabel the error as duplicate operation.
11. Review rollback script, change window, and explicit approval before production execution.

## Known limitations
- Current REVIEW_ONLY trigger draft covers INSERT, identity-changing UPDATE and reactivation; single-session isolated tests have run. Real concurrent writers have not been verified.
- Current REVIEW_ONLY trigger draft blocks collisions involving missing/placeholder manufacturerRoll when a business roll already exists; unique business rolls with missing manufacturerRoll remain allowed for legacy compatibility. Last read-only census: 312 active carpet records, 173 with blank or placeholder manufacturerRoll, and 104 without physicalKey.
- The SQL proposal does not fix legacy bulk replay or reconcile the 27 existing duplicate candidate groups.
- Draft RPC maps known trigger P0001 errors to structured conflict/blocked results; real authenticated RPC and frontend integration remain unverified.
- Do not merge the investigation PR as a substitute for applying a reviewed database migration.

## CI verification — 2026-11-19
- GitHub commit `b14723a936e13b8e6633c9e0ae38a57ebca47595`: 13/13 reported workflow runs completed successfully, including `Production Record Outbox Truthful Status` and `Warehouse sync safety (isolated)`.
- CI success does **not** satisfy gate 9 (two concurrent database transactions), gate 10 (authenticated RPC integration), or gate 1 (verified backup).
