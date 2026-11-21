# Receiving and operations persistence trace — 2026-11-21

Status: source inspection, not a deployed fix.
Source: index.html on feature/record-edit-delete-inventory-20261120

## Verified receiving flow
- saveReceiving() creates a receipt with Date.now() ID and inventoryPosted=false.
- For Received, Put Away, Completed, it loads INVDB, finds an inventory row by masterId, location, lotNumber (excluding external), increments quantity, and saves INVDB.
- It then marks inventoryPosted=true and saves the receipt to RCVDB. The second save's return value is not checked before displaying success.
- autoTaskFromReceiving() then creates tasks.
- renderReceivingHistory() shows 'Locked after inventory update' for posted receipts.
- deleteReceivingRecord() explicitly blocks posted receipts; non-posted deletion saves RCVDB only.

## Verified operation flow
- saveOperation() calls applyOperationImpact(x) for applicable operations, and separately saves LOGDB.
- It explicitly warns that inventory processing may already have occurred if the work-order save fails.
- A canonical carpet cutting path calls v8CommitCutOperation() and then attempts recordSyncPull(); it has separate completion and reconciliation concerns.
- Do not use a generic local delta write for canonical carpet cuts without tracing the server transaction and revision logic.

## Correctness risks
1. INVDB write succeeds but RCVDB write fails: orphan inventory increase.
2. Receipt is merged into an inventory row shared by multiple receipts, so its original effect cannot safely be inferred from current balance.
3. An existing receipt lacks an immutable server revision and mutation ID.
4. Location/lot/product changes may require two stock-row effects, not a single quantity delta.
5. Cloud sync may replay a stale local dataset; do not claim transactional cloud correction from a local-only change.
6. Operation completion can apply impact before LOGDB persistence; cannot safely unlock edits without reconciliation.
7. Existing records with incomplete source metadata require an explicit manual reconciliation path, not inferred reversal.

## Implementation gate
- Identify authoritative cloud schema/RPC for inventory and record mutations.
- Implement one atomic server-side operation that validates expected revision, checks dependencies, records mutation ID, applies old/new effects, and commits the record change.
- Make UI show pending until cloud acknowledgment; no local optimistic permanent deletion of posted records.
- Add migration/backfill policy for legacy posted receipts with missing effect IDs.
- Preserve current posted-receipt deletion lock until the above is tested.

## Next acceptance criteria
- Forced failure between inventory and receipt persistence must leave no partial cloud commit.
- Legacy receipt with ambiguous merged inventory must block deletion and show reconciliation instructions.
- Double request with identical mutation ID must not reapply stock.
- Conflict on revision must not mutate stock.
- Cutting operation path must retain canonical roll/version checks.
