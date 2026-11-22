# Cloud Master Recovery — integration gate (PR #222)

**Status:** Draft only. Do not load the recovery script into production, merge this PR, or clear a device queue until every gate passes.

## Confirmed main-app storage keys

- Outbox: `runlu_record_sync_outbox_v1`
- Cursor: `runlu_record_sync_cursor_v1`
- Bootstrap: `runlu_record_sync_bootstrapped_v1`
- Generation: `runlu_record_sync_generation_v1`
- Generation value: `20260927-hard-gate-212-v3`

Host must supply these constants; do not hardcode guessed names in the recovery module.

## Critical blockers before integration

1. **Backup verification:** iOS Safari's programmatic download click is not proof that a file was saved. Require the operator to open/verify the exported JSON file in Files before proceeding. Prefer a file-import verification step that checks a nonce and matching content hash rather than a checkbox.
2. **Concurrency:** `cloudSyncBusy` is an in-memory lock only. Every sync writer (recordSyncNow, recordSyncPush, recordSyncPull, cloudSmartSync, legacy cloudUploadAll, cloudDownloadAll) and local editing entry point must honor recovery lock; multi-tab storage events and crashes must be addressed. Do not claim the draft LOCK alone protects against concurrent tabs.
3. **Data integrity:** only replace precisely the synchronized DATA_KEYS; preserve drafts, authentication, settings not in DATA_KEYS, snapshots, and backups. Verify a full cloud snapshot was received and all rows were hydrated. A nonempty snapshot alone does not prove completeness.
4. **Atomicity:** localStorage writes are per-key, not transactional. A browser crash during multi-key replacement can leave mixed state. Need a durable recovery journal and restart/rollback procedure before production use.
5. **Quota:** preflight storage and backup availability; rollback itself can fail due to quota. No automatic deletion of saved business records.
6. **Race:** recheck local storage and cloud state immediately before committing; current prepare() cloud snapshot can become stale. Need cursor validation or retry.
7. **Post-recovery:** reload and test computer-to-phone, phone-to-computer, and explicit test deletion. Ensure no old queue is replayed.
8. **Legacy sync:** disable/retire conflicting dataset-level upload/download paths during record-level Cloud Master recovery. Do not overwrite cloud master from stale local state.

## Regression tests

- A conflict operation with server response `{status:'conflict',reason:'base_version_required'}` stays queued.
- A subsequent `{status:'duplicate',original:{status:'conflict',reason:'base_version_required'}}` **also stays queued**.
- Only `{status:'ok'}` or `{status:'duplicate',original:{status:'ok'}}` may dequeue.
- Empty/malformed/outdated cloud snapshot never clears local records.
- Malformed queue never gets silently cleared.
- Cancel, missing backup, editor open, sync active, changed local data, lost connectivity, storage quota error, and browser interruption all preserve recoverability.
- Reopen PWA and Safari separately: each has independent recovery state where applicable.

## Operator workflow (only after gates pass)

1. Close editors; stop editing on other devices.
2. Export backup; **verify file can be opened**.
3. Review cloud counts and queued operation count.
4. Confirm `CLOUD MASTER`.
5. Recover this device only; reload; verify sync.
6. Repeat independently for Safari/PWA/desktop only when necessary.

No production data changes are part of this PR.
