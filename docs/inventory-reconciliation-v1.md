# Warehouse OS — Inventory Reconciliation v1 (design and acceptance contract)

Status: DESIGN ONLY. No production inventory mutation is authorized by this document.

## Context
Warehouse downtime, staff absence and multi-key access cause legitimate discrepancies. Treat physical observation as evidence, not automatically as a completed stock transaction. Never silently overwrite existing inventory or cutting history.

## Verified implementation facts
- Main UI lives in index.html.
- carpetRecords() reads CARPETDB and normalizes length/status.
- saveCarpetEdit() changes records and calls save(CARPETDB, a).
- save() writes localStorage and queues record delta synchronization.
- Inventory UI uses renderCarpetInventory().
- Current statuses include Active/Pending/Used Up and external-transfer statuses.
- A REM field alone is not yet a dedicated UI filter or transaction type.

## Proposed reconciliation data
id, roll, recordId, observedAt, observedBy, source (physical count/photo/document), observedCollection, observedColour, observedLengthFeet, observedLocation, existingSnapshot, differences, reason, evidenceRefs, decision (pending/approved/rejected), reviewedAt, reviewedBy, appliedAt, beforeVersion, afterVersion, linkedOperationId.

## Workflow
1. Capture observed data and original source; accept feet + inches (0..11), store decimal feet without rounding away inches.
2. Match internal roll, source roll and manufacturer roll separately; flag ambiguous duplicate matches.
3. Show side-by-side BEFORE / OBSERVED and explicit field differences.
4. Save a draft reconciliation without changing inventory.
5. Authorized user approves; re-check live version and require re-review if changed.
6. Apply only explicitly approved fields; write immutable before/after audit evidence and operation identifier. If any step fails, do not report success.
7. REM classification must not imply transfer. Store transfer only on separate completed transfer transaction with destination and date.
8. Preserve historical cutting logs and original roll identifiers.

## Real acceptance cases
- RC1876: source list says 10 ft 0 in; historical length differed. Show both and reason.
- RC2268: source list conflicts with cloud product and length. Hold for manual identity review; no overwrite.
- RC2122: no matching cloud record. Offer provisional finding, not silent insert.
- SP011-1/2/3: separate physical rolls share special-order parent SP011; do not merge them.
- RC2359..RC2375: Pending incoming rolls must remain available for labels, without becoming Active.
- REM pending store transfer: remains in warehouse inventory until actual transfer completion.

## Acceptance gates
- Draft never changes stock.
- Concurrent edit conflicts block approval.
- Approved correction creates retrievable before/after audit.
- Unknown/ambiguous roll does not overwrite another record.
- REM and transfer statuses remain separate.
- Mobile and desktop checks pass; cloud refresh preserves audit and edits.
- No production data migration or bulk correction without explicit review.
