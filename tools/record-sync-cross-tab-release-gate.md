# Record-sync cross-tab concurrency gate (review only)

Status: **BLOCKED — do not enable queue isolation or deploy the recovery branch.**

## Verified code paths (2026-11-04)

- `queueRecordDeltaSave()` reads the outbox, appends operations in memory, and calls `setRecordSyncOutbox()` synchronously. Two tabs can read the same original queue and overwrite each other's additions. The data-set write and outbox append are also not a single atomic transaction.
- `recordSyncPush()` awaits the network, re-reads the outbox and checks the first operation ID before shifting. This protects against some same-tab queue changes, **not** concurrent read-modify-write by another tab.
- `isolateVerifiedOfflineQueue()` is disabled in this branch. Do not restore its former read/archive/clear sequence without coordinating *every* writer.

## Release gate

1. Inventory every writer of `RECORD_SYNC_OUTBOX_KEY`, including legacy and startup paths; add tests that fail if an uncoordinated writer remains.
2. Define a single serialization mechanism for enqueue, acknowledgement, and quarantine. Browser Web Locks are not universally supported; on unsupported devices, fail closed or use a tested durable alternative. A Web Lock held only by quarantine does not protect against uncoordinated writers.
3. Make inventory mutations and queue creation crash-safe; test interrupted writes and tab crashes. Do not infer successful backup from a download click.
4. Exercise two-tab simultaneous enqueue, enqueue-versus-acknowledgement, enqueue-versus-quarantine, stale tab, and iOS PWA fallback in browser-level tests.
5. Test recovery from backups and interrupted bootstrap on an isolated copy, and verify server inventory is unchanged before production rollout.

**No inventory rows or production configuration should be changed by this review.**
