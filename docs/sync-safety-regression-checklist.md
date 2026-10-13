# RUNLU Warehouse sync safety regression checklist

This PR is NOT a fix for the legacy `runlu_cloud_master_offline_queue_v80` quota error. That key is absent from the checked-in `index.html` at this revision. Do not clear browser storage or delete pending offline operations.

## Outbox acceptance tests (must run before merging)
1. Two identical operations with the same operation_id and identical full payload: keep one.
2. Same record_id with distinct operation_id values: keep both, including two legitimate stock cuts.
3. Same operation_id with different payloads: keep both and investigate the inconsistency.
4. Delete and update for the same record: preserve both.
5. Simulate QuotaExceededError on setItem: propagate failure, never mark local persistence as successful.
6. Simulate server 'ok' and 'duplicate': persist remaining queue before advancing in-memory cursor.
7. Simulate server timeout after accepting an operation: retry using the same operation_id.
8. Confirm no unacknowledged operations disappear across reload, offline/online, and two devices.
9. Confirm normal cut, return, receiving, and order completion inventory totals remain correct.
10. Verify all changes in a staging deployment with a backed-up sample database.

## Outstanding work
- Locate deployed source of legacy Cloud Master v80 queue and audit its writers/readers.
- Design an IndexedDB migration with read-back verification and a rollback path.
- Never automatically collapse distinct stock movement events merely because they share a record ID.
- Verify branch protection, required reviews/checks, and deployment configuration.

No live inventory data should be purged by this PR.
