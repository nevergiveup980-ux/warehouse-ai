import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,AD,OP=[str(uuid.uuid4()) for _ in range(3)]
def run(q): return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q],text=True,capture_output=True,env=E)
def value(r):
 lines=[x for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET']
 return lines[-1].strip() if lines else ''
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',f"insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T}','{AD}','admin'),('{T}','{OP}','operator');"],env=E)

def stage(dataset,rid,payload):
 r=run(f"select warehouse_v7.stage_legacy_record('{T}','{dataset}','{rid}','{payload}'::jsonb);")
 assert r.returncode==0,r.stderr
 return value(r)
def classify(i,k):
 r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.classify_legacy_record('{T}','{i}','{k}','review','{AD}');")
 assert r.returncode==0,r.stderr

# Canonical dependencies must exist first.
ps=stage('runlu_product_master_v21','PRD-STOCK','{"name":"Stock Product","base_unit":"BOX"}'); classify(ps,'valid')
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{ps}','{AD}');"); assert r.returncode==0,r.stderr
ls=stage('derived_location_v6','LOC-STOCK','{"code":"8B","kind":"rack"}'); classify(ls,'valid')
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_location('{T}','{ls}','{AD}');"); assert r.returncode==0,r.stderr

good=stage('runlu_inventory_records_v21','INV-GOOD','{"product_legacy_record_id":"PRD-STOCK","location_code":"8B","quantity":12,"unit":"BOX"}')
missing_product=stage('runlu_inventory_records_v21','INV-NOPROD','{"product_legacy_record_id":"PRD-MISSING","location_code":"8B","quantity":4,"unit":"BOX"}')
missing_location=stage('runlu_inventory_records_v21','INV-NOLOC','{"product_legacy_record_id":"PRD-STOCK","location_code":"NO-SUCH","quantity":4,"unit":"BOX"}')
bad_qty=stage('runlu_inventory_records_v21','INV-BADQ','{"product_legacy_record_id":"PRD-STOCK","location_code":"8B","quantity":0,"unit":"BOX"}')
defer=stage('runlu_inventory_records_v21','INV-DEFER','{"product_legacy_record_id":"PRD-STOCK","location_code":"8B","quantity":2,"unit":"BOX"}')
operator_try=stage('runlu_inventory_records_v21','INV-OP','{"product_legacy_record_id":"PRD-STOCK","location_code":"8B","quantity":2,"unit":"BOX"}')
for i,k in [(good,'valid'),(missing_product,'valid'),(missing_location,'valid'),(bad_qty,'valid'),(defer,'deferred'),(operator_try,'valid')]: classify(i,k)

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_stock_item('{T}','{good}','{AD}');")
assert r.returncode==0,r.stderr
sid=value(r)
r2=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_stock_item('{T}','{good}','{AD}');")
assert r2.returncode==0 and value(r2)==sid,(r2.stdout,r2.stderr)

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_stock_item('{T}','{missing_product}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_PRODUCT_LINK_NOT_FOUND' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_stock_item('{T}','{missing_location}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_LOCATION_LINK_NOT_FOUND' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_stock_item('{T}','{bad_qty}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_STOCK_QUANTITY_INVALID' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_stock_item('{T}','{defer}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_NOT_VALID' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{OP}';select warehouse_v7.import_valid_stock_item('{T}','{operator_try}','{OP}');")
assert r.returncode!=0 and 'ADMIN_ROLE_REQUIRED' in r.stderr,r.stderr

state=run(f"select quantity||'|'||unit||'|'||version||'|'||lifecycle from warehouse_v7.stock_item where tenant_id='{T}' and id='{sid}';")
assert value(state)=='12.000000|BOX|1|active',state.stdout
counts=run(f"""select
 (select count(*) from warehouse_v7.stock_item where tenant_id='{T}')||'|'||
 (select count(*) from warehouse_v7.command where tenant_id='{T}' and id='{good}' and status='committed')||'|'||
 (select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{good}' and movement_type='OPENING_IMPORT')||'|'||
 (select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{good}' and event_type='MIGRATED_OPENING_STOCK');""")
assert value(counts)=='1|1|1|1',counts.stdout
link=run(f"select classification||'|'||imported_entity_type||'|'||imported_entity_id from warehouse_v7.migration_staging where tenant_id='{T}' and id='{good}';")
assert value(link)==f'imported|stock_item|{sid}',link.stdout
print('V7 valid-only Stock Item import + opening ledger attack: PASS')
