# RUNLU Offline Queue Audit — operator guide

**Status: diagnostic only. This is not a recovery, merge, or synchronization tool.**

## Preconditions
1. Keep the original `RUNLU_OFFLINE_QUEUE_EMERGENCY_*.json` and the separate full warehouse backup unchanged, preferably in two safe locations.
2. Do not select **Restore JSON Backup**, **Upload All**, **Sync Now**, or clear Safari site data to use this tool.
3. Open `tools/offline-queue-audit.html` as a standalone local file in a compatible browser; it is not wired into the production Warehouse OS navigation.
4. Select the emergency queue JSON using the file picker. Do **not** upload the file to a third-party site or commit it to GitHub.

## What the results mean
- Operations count: queue entries, **not** distinct business edits.
- Record groups: distinct `(dataset_key, record_id)` pairs.
- Delete/write transitions: changes of intent in **export array order**, not independently verified chronological order.
- Missing base version: operations that cannot be safely reconciled solely by optimistic version comparison.
- Risk index CSV: metadata only; it excludes operation payloads, but record IDs may still be sensitive. Keep the CSV private.
- The page **does not** compare with current Supabase data. Never treat its last-intent column as permission to restore, delete, or resurrect a record.

## Safety and acceptance checklist
- [ ] GitHub Actions `Offline Queue Audit Safety` passes for the candidate commit.
- [ ] Chromium and WebKit synthetic-file tests pass.
- [ ] On a real iPhone Safari, file picker opens and the original emergency export is read without network upload.
- [ ] Expected reference totals for the October 18 preserved export: 1,476 operations; 123 groups; 12 groups with deletes; 9 groups with delete/write transitions.
- [ ] CSV downloads correctly on iPhone, contains no payloads, and remains private.
- [ ] Invalid JSON shows `Audit stopped` and offers no results or CSV.
- [ ] No device storage, cloud records, or pending queue entries change during the test.

## Hard stop
If the audit reports a different operation count or cannot read the file, **stop**. Do not repair the original backup in place, re-export over it, or replay any queue entries. Preserve the error message and investigate separately.

## Scope
This page uses a browser file picker and an in-memory parse. It does not use network APIs, warehouse localStorage, IndexedDB, Supabase, or cloud credentials. Automated tests are not a substitute for real-device acceptance.
