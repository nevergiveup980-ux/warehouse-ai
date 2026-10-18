# Cloud sync bypass review — 2026-10-18

Static review of draft PR #202, not a production test.

## Confirmed entry points

- `recordSyncNow` is invoked by Sync Now UI, initial session bootstrap, post-save timer, polling timer, online/focus/visibility handlers. The draft hold blocks its call to `recordSyncPush` if an outbox is pending.
- `recordSyncPush` has only its own definition in the current index.html after the draft patch; no other direct caller was found by literal search.
- `recordSyncBootstrap` and `recordSyncPull` explicitly refuse to proceed while the outbox is nonempty.
- **Separate legacy dataset sync remains:** `cloudSmartSync` can call `flushCloudDirty` and `applyCloudRows`; `cloudUploadAll` can upload every local dataset; `cloudResolveConflictsFromDevice` can upload conflicting datasets. These are independent of record outbox replay and need review before merging.
- `recordSyncPrepareGeneration` blocks reset when an outbox exists or any warehouse data is present. It can clear storage only on the empty-device path; verify carefully with fixtures.

## Unresolved

1. Trace all `cloudSyncNow` / legacy dataset sync call sites and their guards.
2. Ensure manual legacy upload and conflict resolution cannot bypass pending-outbox protection.
3. Audit automatic startup migration writes and `dedupeOpenOperationDrafts`, which can remove open operation drafts.
4. Test a real iPhone Safari offline/online cycle with an exported backup before any production deployment.

No production data, queue, or cloud records were touched.
