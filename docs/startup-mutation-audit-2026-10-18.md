# Startup mutation audit — 2026-10-18

Read-only code review. No production or cloud records were changed.

## Confirmed automatic startup paths (index.html)

- `repairMissingCarpetRollsFromReceiving(true)`: when the one-time marker is missing, completed linked receiving operations may reconstruct carpet rolls and append events. It calls `save(CARPETDB, carpets)`, then `save(EVENTDB, events)`; second save success is not checked.
- `reconcileCompletedCustomerOrderInventory(true)`: on every startup, matching completed-order PO records may have quantity set to zero and shippedQuantity incremented; `save(INVDB,inv)` return is not checked. Needs carefully isolated business-case tests before any changes.
- `reconcileTransferredCarpetStatuses(false)`: can change carpet scope/status and save CARPETDB; save return is not checked. Startup calls this function.
- `recoverOrderLibraries(false)`: reads legacy order libraries, appends missing orders, and saves both customer and special orders on startup; neither save result is checked.
- `restoreConversationOrders(false)`: startup recovery path; requires detailed follow-up review.

## Recommendations

1. Preserve these existing operational behaviors for now; do not disable without evaluating impacts on receiving, shipped-order accounting, and transfer history.
2. Add read-only regression tests that use copies of realistic fixtures, including deliberately deleted rolls and completed-order PO collisions.
3. Add explicit success checks and recoverable atomic/compensating migration designs before permitting startup writes.
4. Do not merge draft PR #202 or replay the offline queue until iPhone Safari and data reconciliation are reviewed.

The separate historical seed/V5.16/V5.5.15/V5.5.22 startup safety changes are in draft PR #202, not production.
