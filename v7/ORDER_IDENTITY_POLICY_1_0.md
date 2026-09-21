# RUNLU Warehouse OS V7 — Order Identity & Lifecycle Policy 1.0

Wave 2 begins with evidence classification, not automatic conversion of every V6 row into a V7 order.

## Identity boundary

A V6 `recoveryKey` is a lineage/grouping key, not an unconditional canonical business key. Rows sharing one recovery key may be collapsed only after identity-critical fields agree.

Identity-critical fields:

- Standard order: type, SO number, PO number, customer label, product label, quantity, unit.
- Special order: PO number, customer label, product label, quantity, unit.

Location and explicit status are state/evidence fields, not identity fields.

When `recoveryKey` is absent, a standard row may use a conservative structured business composite only when PO, type, product, quantity, unit, and location are all present. Otherwise the source row remains weak-identity evidence and is deferred.

## Duplicate classification

A repeated identity group is classified as one of:

- `replay_duplicate`: identity and presentation state are the same.
- `lifecycle_evidence`: identity is stable and structured state changes without a backward explicit lifecycle transition.
- `lifecycle_regression`: explicit lifecycle evidence moves backward in source time.
- `identity_conflict`: identity-critical fields disagree inside one lineage group.
- `deferred_weak_identity`: source identity is not strong enough for canonical import.

Conflict, regression, and weak-identity evidence is quarantined. It does not block unrelated warehouse work and it does not auto-create a canonical V7 order.

## Lifecycle contract

Order lifecycle:

`draft -> in_progress -> completed -> archived`

Fulfillment lifecycle:

- `unverified -> pending | received | ready_for_pickup`
- `pending -> received | backorder | ready_for_pickup | completed`
- `backorder -> pending | received`
- `received -> ready_for_pickup | completed`
- `ready_for_pickup -> picked_up`
- `picked_up -> completed`

A transition may keep one axis unchanged while advancing the other. Backward transitions are rejected.

## Source-status rules

Only structured status fields are status evidence.

Free-text notes such as "Waiting for Pickup" are not promoted to structured lifecycle state. A missing V6 status remains unknown/unverified until structured evidence or human verification exists.

For Special Orders, `Ready for Pickup -> Picked Up` is monotonic evidence. A later source row returning to `Ready for Pickup` is a lifecycle regression and is quarantined rather than silently chosen as "latest".

## Inventory boundary

Orders describe business intent/allocation. They do not directly overwrite saleable inventory.

Receiving, Shipping, Transfer, Return, Supplier Return, and Carpet lifecycle commands remain the only inventory mutation paths. Order completion can reference those commands later, but it cannot manufacture a stock balance.

## Audit rule

The Wave 2 source audit writes zero V6 rows and zero canonical V7 order rows. Its first job is to prove that every source row is classified and every unsafe identity/lifecycle case is explicitly quarantined.
