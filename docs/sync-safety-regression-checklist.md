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

## V8 carpet recovery release gate (RC2347 / RC2348)

- [x] PR #192 branch CI: 8/8 workflows succeeded at commit `fb90c0d1e929729a37badabfa965d9a196a9107e`.
- [x] Database metadata: `warehouse_v7` review gate, preview, resolve and promote RPCs exist; `authenticated` has EXECUTE; none is SECURITY DEFINER.
- [ ] Verify GitHub Pages / custom-domain deployment source and confirm a tested release path before merging this 52-commit branch.
- [ ] After deployment, sign in as the real tenant administrator and run Settings → V8 Carpet Recovery → Check V8 Review Access; capture gate and per-roll preview. Do not use the retired legacy migration.
- [ ] Resolve RC2347 from physical evidence: original 159′2″, cut 55′6″, remaining 103′8″; mark as cut/not FULL. Invoice product description differs from original receiving record and must be reviewed, not silently rewritten.
- [ ] Resolve RC2348 from physical label: FULL, uncut 136′2″. Confirm rack location (historical 6B vs observed 6A) before finalizing.
- [ ] Use authenticated version-checked review → preview → promote RPCs, never direct canonical table insert; verify canonical roll records and audit trail after each promotion.
- [ ] Confirm desktop/mobile show matching Cloud Master stock without importing old JSON or clearing browser storage.
