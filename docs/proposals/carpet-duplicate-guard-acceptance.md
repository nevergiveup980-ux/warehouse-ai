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
- Trigger protects INSERT only, not UPDATE that changes physical identifiers.
- Missing/placeholder manufacturerRoll is not protected; 165 of 312 live rows have no manufacturerRoll at the last check.
- The SQL proposal does not fix legacy bulk replay or reconcile the 27 existing duplicate candidate groups.
- SQLSTATE P0001 is not the same as a structured `status=conflict` response; frontend error handling needs integration testing.
- Do not merge the investigation PR as a substitute for applying a reviewed database migration.
