# Warehouse OS — release readiness gates (2026-10-18)

**Status: NO-GO for merging PR #202.** Passing CI is not equivalent to validating actual warehouse workflows.

## Verified by current automated checks
- Seed and historical startup mutation holds.
- Pending outbox blocks record bootstrap/pull, direct replay, and legacy dataset overwrite routes.
- Local save rollback code exists and is covered by existing safety workflows.
- Read-only queue audit reports conflicts without modifying its input.

## Unresolved blockers
1. **Normal editing with pending queue:** `queueRecordDeltaSave` appends new operations to the same held outbox; no approved safe route exists to sync new writes independently. Do not assume multi-device visibility.
2. **Existing-device generation migration:** `recordSyncPrepareGeneration` refuses reset whenever any DATA_KEYS are populated. This protects records but may strand older devices until explicit migration is developed.
3. **Legacy startup migrations disabled:** verify on disposable copies that records already stored under old keys remain accessible. Do not auto-import historical data to resolve this.
4. **Manual business flows:** verify receiving, carpet selection, PO edit-return, transfer, cancel, and inventory search in browser and on iPhone Safari.
5. **Backup and rollback:** validate a restorable production snapshot, offline queue export, and rollback steps before deployment.
6. **Cloud-vs-local reconciliation:** review high-risk 30001–30009 groups against an authenticated read-only cloud snapshot. No queue replay or cloud mutation.

## Safe next engineering milestones
- Add an explicit read-only sync health/status panel showing held outbox count and 'local changes not synced'.
- Build isolated fixture-based tests for startup, normal local save, failed storage save, and cloud read when queue is empty.
- Design a separate, explicitly approved reconciliation protocol with per-record identity/version checks and no silent queue truncation.

Do not merge, deploy, clear, dedupe, or replay production data based on this checklist alone.
