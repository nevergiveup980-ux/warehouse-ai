#!/usr/bin/env python3
import json,subprocess,tempfile,pathlib
m={"products":[],"derived_carpet_products":[],"locations":[],"inventory":[],"derived_inventory_items":[],"carpet":[],"derived_carpet_rolls":[{"dataset":"derived_carpet_roll_v6","record_id":"CARPET_PHYSICAL:source_mfg:RC2245|7594","source_payload":{"physical_key":"source_mfg:RC2245|7594","member_record_ids":["A","B"]},"classification":"valid","reason":"CARPET_PHYSICAL_REPLAY_GROUP_READY","transformed":{"product_legacy_record_id":"CARPET_SOURCE:RC2245","location_code":"3D","roll_number":"RC2245","physical_key":"source_mfg:RC2245|7594","manufacturer_roll":"7594","source_roll":"RC2245","original_sixteenths":26000,"remaining_sixteenths":25936,"measure_status":"CAL"}}]}
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d); src=p/"m.json"; out=p/"o.sql"; src.write_text(json.dumps(m))
 subprocess.run(["python3","v7/manifest-to-import-sql.py",str(src),"--output",str(out)],check=True)
 sql=out.read_text()
 assert "delete from warehouse_v7.migration_staging" in sql
 assert "classification<>'imported'" in sql
 assert "CARPET_PHYSICAL:source_mfg:RC2245|7594" in sql
 assert "import_valid_carpet_roll" in sql
 lines=[x for x in sql.splitlines() if x.strip()]
 assert len(lines)==4
 assert lines[0].startswith("delete from warehouse_v7.migration_staging ")
 assert all("\n" not in x for x in lines)
print("V7 opening reconciliation rerun SQL contract: PASS")
