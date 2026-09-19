-- V7 immutable ledger guards — Event and Inventory Movement are append-only.
create or replace function warehouse_v7.reject_ledger_mutation()
returns trigger language plpgsql security invoker as $$
begin
 raise exception using errcode='55000', message='V7_LEDGER_APPEND_ONLY';
end $$;

drop trigger if exists event_append_only on warehouse_v7.event;
create trigger event_append_only before update or delete on warehouse_v7.event
for each row execute function warehouse_v7.reject_ledger_mutation();

drop trigger if exists movement_append_only on warehouse_v7.inventory_movement;
create trigger movement_append_only before update or delete on warehouse_v7.inventory_movement
for each row execute function warehouse_v7.reject_ledger_mutation();
