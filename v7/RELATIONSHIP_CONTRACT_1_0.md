# V7 Relationship Contract 1.0

tenant -> products, orders, receipts, stock_items, carpet_rolls, locations, commands, events, movements.
product -> stock_items/carpet_rolls/order execution bindings by tenant-scoped FK.
order -> order_execution_binding -> explicit INBOUND/OUTBOUND execution -> immutable fulfillment action -> command/event/movement lineage.
location -> physical entities/movements by stable UUID.
command -> events/movements by immutable causal FK.
shipment -> return by reference; return never deletes shipment.
carpet_roll -> remnant by lineage; remainder identity is explicit.
migration_staging -> canonical entity only after validated import.

## FK policy
All operational cross-table references include tenant_id in composite keys/FKs.
Retirement uses lifecycle state; operational history uses RESTRICT, not cascade delete.
Migration staging may contain unresolved legacy references because it is quarantine, not production.

## Projection policy
Inventory balance, dashboards, maps and alerts are rebuildable projections.
They can lag or fail without invalidating committed commands/events/movements.


## Order execution identity policy
Order execution never matches inventory by free-text product or location labels.
No execution binding may be inferred from product_label, source_location, PO notes,
or other legacy display text. A binding requires explicit tenant-scoped product_id
and location_id UUIDs; OUTBOUND also requires an existing stock_item_id. INBOUND
may attach its stock_item_id only after a successful RECEIVE command creates or
updates that exact canonical stock identity.

The order execution queue is a rebuildable projection. It derives RECEIVE_ORDER
or SHIP_ORDER tasks from the explicit flow plus immutable fulfillment actions.
Completing the projected quantity does not silently change the order lifecycle or
fulfillment status; those remain explicit order-domain transitions.
