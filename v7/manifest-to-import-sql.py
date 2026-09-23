#!/usr/bin/env python3
import argparse,json

def q(v): return "'" + str(v).replace("'","''") + "'"
def j(v): return q(json.dumps(v,separators=(",",":"),ensure_ascii=False))+"::jsonb"

ap=argparse.ArgumentParser(); ap.add_argument("manifest"); ap.add_argument("--output",required=True); a=ap.parse_args()
m=json.load(open(a.manifest,encoding="utf-8"))
tenant="e2d45722-186b-4b4f-af16-38709a0113ee"; actor="b360c5a0-1736-4e17-b82c-22ea720603c1"
lines=[
"""delete from warehouse_v7.migration_staging
where tenant_id='e2d45722-186b-4b4f-af16-38709a0113ee'::uuid
  and classification<>'imported'
  and source_dataset in (
    'runlu_product_master_v21','derived_carpet_product_v6','derived_location_v6',
    'runlu_inventory_records_v21','derived_inventory_item_v6',
    'runlu_carpet_inventory_v52','derived_carpet_roll_v6'
  );"""
]
def emit(item,derived=False):
    if derived:
        t=item.get("transformed") or {}; ev=item.get("evidence") or []; src=t.get("source_code") or item["record_id"].replace("CARPET_SOURCE:","",1)
        if ev:
            for e in ev: lines.append(f"select warehouse_v7.stage_derived_carpet_product({q(tenant)}::uuid,{q(src)},{q(e.get('name') or '')},{q(e.get('colour') or '')});")
        else: lines.append(f"select warehouse_v7.stage_derived_carpet_product({q(tenant)}::uuid,{q(src)},{q(t.get('name') or '')},{q(t.get('colour') or '')});")
        sid=f"(select id from warehouse_v7.migration_staging where tenant_id={q(tenant)}::uuid and source_dataset='derived_carpet_product_v6' and source_record_id={q(item['record_id'])})"
    else:
        lines.append(f"select warehouse_v7.stage_legacy_record({q(tenant)}::uuid,{q(item['dataset'])},{q(item['record_id'])},{j(item.get('source_payload') or {})},{j(item.get('transformed') or {})});")
        sid=f"(select id from warehouse_v7.migration_staging where tenant_id={q(tenant)}::uuid and source_dataset={q(item['dataset'])} and source_record_id={q(item['record_id'])})"
    lines.append(f"""select warehouse_v7.classify_legacy_record({q(tenant)}::uuid,{sid},{q(item['classification'])},{q(item.get('reason',''))},{q(actor)}::uuid)
where exists (
  select 1 from warehouse_v7.migration_staging
  where tenant_id={q(tenant)}::uuid and id={sid} and classification<>'imported'
);""")
    if item["classification"]=="valid":
        ds=item["dataset"]
        fn="import_valid_product" if ds in ("runlu_product_master_v21","derived_carpet_product_v6") else "import_valid_location" if ds=="derived_location_v6" else "import_valid_stock_item" if ds in ("runlu_inventory_records_v21","derived_inventory_item_v6") else "import_valid_carpet_roll"
        lines.append(f"select warehouse_v7.{fn}({q(tenant)}::uuid,{sid},{q(actor)}::uuid);")
for x in m["products"]: emit(x)
for x in m["derived_carpet_products"]: emit(x,True)
for x in m["locations"]: emit(x)
for x in m["inventory"]: emit(x)
for x in m.get("derived_inventory_items",[]): emit(x)
for x in m["carpet"]: emit(x)
for x in m.get("derived_carpet_rolls",[]): emit(x)
open(a.output,"w",encoding="utf-8").write("\n".join(lines)+"\n")
print("opening import SQL generated:",len(lines),"statements")
