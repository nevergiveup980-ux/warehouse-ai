# Warehouse OS — Universal Edit & Permanent Delete: implementation contract (REVIEW ONLY)

## Product decision
Warehouse staff need to correct any business record and permanently remove erroneous entries, including records already completed. The app must not impose blanket “locked forever” rules. Access remains limited to authorized warehouse users.

## Current code findings
- `deleteCarpetRecord()` removes the selected carpet row locally and explicitly retains historical cutting logs.
- `removeInventory(id)` removes a general inventory row.
- `removeItem(id)` removes a product and all its general inventory rows.
- `deleteReceivingRecord(id)` currently blocks deletion if inventory was posted.
- `deleteSpecialOrder(id)` blocks certain linked or completed records.
- The existing carpet edit screen and Quick Correct can update an exact roll.
- Therefore universal edit/delete is **not implemented yet**; enabling delete buttons alone would risk inconsistent balances.

## Desired actions
Every business record detail: **Edit**, **Delete Permanently**. Allow completed records to be edited or removed through a reversible *business-effect correction* first, then permanent deletion of the record itself when permitted by dependency rules. If the user requests deletion of a posted receipt, reverse its exact posted inventory effect once, not twice. If an operation already has downstream cuts, returns, or transfers, display dependencies and offer an explicit guided resolution; never silently cascade unrelated records.

## Permanent deletion semantics
1. Confirm exact record ID/type and the effect on inventory and dependent records; require a second explicit confirmation for multi-record effects.
2. Local/offline deletion creates a durable queued tombstone; retain until the server acknowledges the exact operation. A refresh must not resurrect it.
3. Server applies idempotent delete; replay must not double-reverse inventory. Conflicts stay queued for review.
4. After confirmed server deletion, remove business payload from active records; keep only the minimum operation/tombstone metadata necessary for synchronization and integrity, with a documented retention policy. Do not falsely claim an immediate physical purge of backups, operation ledgers, or other copies.
5. Deleting a product with linked inventory is an explicit multi-record operation with an accurate preview; partial failure must not leave a false success state.
6. UI must distinguish **pending deletion**, **deleted in cloud**, and **needs review**.
7. No unrestricted direct SQL deletion, no RLS bypass, no implicit global delete permissions.

## Delivery slices
- Slice A: inventory and carpet records: edit/delete confirmation + offline replay and exact-record test.
- Slice B: receiving, orders, transfers, cuts, and returns: dependency graph + single-application reversal.
- Slice C: product master and other record types; end-to-end cleanup and mobile regression.

## Tests before merge
- Edit and permanently delete an isolated record, online and offline.
- Delete a posted receipt: inventory effect reversed exactly once across retries.
- Delete a carpet record with cutting history: user sees linked records and no orphaned misleading balances.
- Same business roll in multiple records: only selected record ID is deleted.
- Cloud conflict and failed deletion preserve pending intent; no silent loss.
- Authenticated users cannot delete another account's data.

**Status:** specification only. No production changes, no universal deletion enabled yet. PR #229 remains focused on software-generated duplicate prevention and sync safety; use a separate feature PR for this scope.
