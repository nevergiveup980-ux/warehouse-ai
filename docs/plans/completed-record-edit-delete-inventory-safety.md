# Completed-record edit/delete: inventory safety contract (draft)

Status: design and test contract only. No production behavior changed.
Branch: feature/record-edit-delete-inventory-20261120

## Scope
- Receiving records, completed operation records, cutting and pickup/shipping records.
- Allow editing and permanent deletion where the user explicitly confirms.
- Keep current record-sync outbox behavior and cloud/local consistency; do not claim cloud success before acknowledgment.

## Non-negotiable rules
1. Before mutating a stock-affecting record, resolve its stable record ID, stock item/roll ID, previous quantity and unit, previous stock effect, and sync revision.
2. Missing original effect, unknown units, conflicting revisions, or unresolved dependent records must block automatic stock adjustment and present a clear correction path.
3. For edit: calculate the delta as **new effect minus old effect**, applied once atomically; do not separately reverse and replay through two independently retryable writes.
4. For delete: apply the inverse of the previously committed effect once. A deleted record must not be replayed from an old offline outbox.
5. Use an immutable mutation ID/idempotency key, expected record revision, and a transaction or equivalent server-side concurrency guard. Repeated clicks, retries and multi-device races cannot duplicate effects.
6. A cloud-confirmed record must not be permanently removed from the UI until the corresponding cloud mutation is acknowledged. Offline deletes remain pending and visibly labeled.
7. A record with downstream cuts, allocations, linked customer orders, or conflicting movements must not be silently deleted; surface affected references and require explicit resolution.
8. Never derive inventory by adjusting an already stale local balance; reconcile against authoritative movement ledger/cloud state. Reject negative balances unless a separately approved business rule explicitly permits them.
9. Permanent deletion removes the business record from normal views, but preserve minimal non-sensitive transaction/idempotency metadata needed to prevent replays and reconcile inventory. Any audit retention policy requires separate approval.

## Acceptance matrix (must be implemented and executed)
- Edit a received quantity 100 -> 80: exactly -20 net stock, including refresh/relogin.
- Delete a completed receipt 100: exactly -100 net stock if no dependent movements.
- Edit a completed cut 30 -> 25: exactly +5 net remaining roll length.
- Delete a completed cut 30: exactly +30 net remaining length if dependencies permit.
- Change product/roll on a completed movement: old item effect reversed and new item effect applied as one atomic transaction.
- Double-tap delete and repeat the same network request: exactly one adjustment.
- Offline edit then reconnect: pending status until cloud acknowledgment; exactly one adjustment.
- Two devices edit the same revision: one succeeds; the other sees a conflict and reloads.
- Delete a receipt with later cuts/allocations: blocked with clear references, no inventory change.
- Cloud failure during mutation: neither record nor stock is partially committed.
- Local cache contains stale record after cloud deletion: cannot recreate deleted stock movement.
- Wrong unit (LF/SF/SYD), missing original quantity, or missing roll ID: block and report.
- Verify both mobile and desktop, and run automated regression tests before merge.

## Implementation investigation
The production entry point is index.html, which includes record sync outbox logic and receiving/operations/cutting flows. Before implementing, trace the actual persistence and mutation paths, including any worker/cloud RPCs, and identify which operation types currently affect inventory. This document does not authorize a migration or live data mutation.

## Deployment gate
Feature branch -> automated tests -> staging browser/mobile acceptance -> review -> explicit approval -> merge. No direct main writes.
