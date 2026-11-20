# Warehouse OS — Practical Correction First (review only)

Status: product direction agreed in conversation; **not a deployment authorization**.

## Reality of the warehouse
Several people can access the warehouse independently. A physical movement may precede a system entry. Treat on-screen stock as the **last recorded balance**, not a guarantee of what is physically present.

## Existing code reviewed
- `editInventoryQuantity(id)` already supports **replace total** quantity, with confirmation and no additive adjustment.
- `adjust(id,d)` provides +/- quantity adjustments.
- `removeInventory(id)` currently permits direct deletion after confirmation.
- Historical carpet cutting repair has a specialized flow that updates the exact roll, cutting history and operation audit trail together.

Do not introduce a second generic quantity-correction feature that duplicates the existing `editInventoryQuantity` UI.

## Minimal next improvement (not implemented)
1. Add a small **Quick Correct** affordance on the carpet roll detail, distinct from the generic product quantity editor.
2. Show record ID, business roll, manufacturer roll, location, current length and **new actual measured length**; require confirmation and show before → after.
3. For carpet records with ambiguous identity (same roll, missing manufacturer roll), require choosing the exact record ID; never silently merge, deduplicate or delete.
4. Append a compact correction entry (record ID, previous/new value, timestamp, device, optional reason) using an existing durable audit channel, after verifying its persistence and sync behavior. Do not store an audit trail only in transient UI state.
5. Respect pending offline operations and server version conflicts. Never discard the outbox or claim cloud success when rejected. Surface **Pending / Synced / Needs review** honestly.
6. Permit users to correct real-world discrepancies without manager approval. Do not claim 100% physical stock accuracy.
7. Keep all changes behind an isolated preview; no production migration, schema change, merge or deletion without explicit approval.

## Acceptance
- Correct one identified roll, refresh, and confirm the revised value persists.
- Offline correction remains queued and is visible as pending.
- Cloud conflict preserves the user correction for review and does not overwrite a newer cloud record.
- Correcting one record never changes another record with the same business roll.
- No regression in carpet cutting history or operation audit trail.

## PR #229 scope
Keep this PR focused on preventing **software-generated** duplicates, silent discard and sync data loss. Quick Correct is a follow-up feature, not a reason to delay the essential safety fix or merge untested SQL.
