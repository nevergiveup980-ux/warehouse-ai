# V7 Relationship Contract 1.0

tenant -> products, orders, receipts, stock_items, carpet_rolls, locations, commands, events, movements.
product -> stock_items/carpet_rolls/order_lines by tenant-scoped FK.
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
