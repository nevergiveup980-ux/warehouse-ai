# V6 -> V7 Migration Map

| V6 dataset | V7 destination | Rule |
|---|---|---|
| runlu_product_master_v21 | product_master_v7 | preserve legacy record_id; canonicalize exact identity |
| runlu_carpet_inventory_v52 | carpet_roll_v7 | one physical roll = one UUID; `physical_key` is the tenant-unique physical identity; legacy roll number is a non-unique display/business label |
| runlu_inventory_records_v21 | stock_item_v7 + opening movements | stage first; duplicates/orphans never auto-import |
| runlu_receiving_v50 | warehouse_event_v7 | historical provenance |
| runlu_cutting_log_v52 | warehouse_event_v7 | historical CUT events; no balance mutation during import |
| runlu_operations_log_v52 | warehouse_event_v7 | historical operations |
| runlu_orders_v20 | warehouse_event_v7 / future order tables | preserve legacy identity |
| runlu_special_orders_v51 | warehouse_event_v7 / future order tables | preserve legacy identity |
| runlu_event_history_v52 | warehouse_event_v7 | dedupe by source identity, not display fields |

Current core migration snapshot (verified read-only audit 2026-09-19): carpet 530 live + 10 tombstones; inventory 189 live + 190 tombstones; products 68 live + 8 tombstones. Order/Special Order lineage is audited separately before canonical Wave 2 import.
