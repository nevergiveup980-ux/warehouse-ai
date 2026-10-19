# Customer-order completion: persistence safety gate (2026-10-18)

Status: **NO-GO / design review**. No production migration, replay, merge, or deployment is authorized.

## Confirmed paths

- `completeCurrentCustomerOrder()` calls `finalizeCustomerOrderInventory(o)`, then `save(ODB,rows)` without checking either persistence result.
- `finalizeCustomerOrderInventory()` writes `INVDB` without checking `save` return; its returned record count is not evidence of a successful save.
- `updateLinkedOrder(r,'Shipped')` also finalizes inventory and saves the order without checking persistence.
- Other completion entry points require separate review before implementation.

## Required behavior before enabling completion

1. Prepare order and inventory changes in memory without mutating persisted state.
2. Capture original raw values for both datasets and the record-sync outbox; preserve missing/null states exactly.
3. Validate local capacity and operation identity; do not silently replay or discard existing outbox entries.
4. Commit both datasets and their queued record deltas as one logical operation. Browser localStorage is not transactional, so any partial failure must attempt restoration of **all** captured keys, including the outbox.
5. If rollback fails, stop writes and show a prominent preservation/export instruction. Never report the order completed.
6. Confirm readback of persisted order, inventory, and outbox before showing success; ensure repeated completion cannot ship the same quantity twice.
7. Add fault-injection cases for first write, second write, outbox write, quota retry, rollback failure, and interrupted reload. Include the linked-shipping and workspace completion entry points.
8. For a stronger crash-safe design, prefer a durable transaction journal with recovery on startup, or a server-side transaction with idempotency keys. A series of localStorage calls alone cannot guarantee crash atomicity.

## Acceptance gate

- No change to real Supabase records or iPhone offline queues during tests.
- CI tests plus isolated browser failure injection must pass.
- Real-device verification and inventory/order reconciliation are required before merging PR #203 or PR #202.
