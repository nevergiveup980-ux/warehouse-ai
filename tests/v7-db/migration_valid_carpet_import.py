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

# Canonical dependencies first.
ps=stage('runlu_product_master_v21','PRD-CARPET','{"name":"Carpet Product","base_unit":"1/16_IN"}'); classify(ps,'valid')
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{ps}','{AD}');"); assert r.returncode==0,r.stderr
ls=stage('derived_location_v6','LOC-CARPET','{"code":"13C","kind":"rack"}'); classify(ls,'valid')
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_location('{T}','{ls}','{AD}');"); assert r.returncode==0,r.stderr

good=stage('runlu_carpet_inventory_v52','RC-MIG-1','{"product_legacy_record_id":"PRD-CARPET","location_code":"13C","roll_number":"RC-MIG-1","original_sixteenths":1600,"remaining_sixteenths":600,"measure_status":"CAL"}')
deferred=stage('runlu_carpet_inventory_v52','RC2253','{"product_legacy_record_id":"PRD-CARPET","location_code":"13C","roll_number":"RC2253","original_sixteenths":1600,"remaining_sixteenths":700,"measure_status":"TM"}')
missing_product=stage('runlu_carpet_inventory_v52','RC-NOPROD','{"product_legacy_record_id":"PRD-MISSING","location_code":"13C","roll_number":"RC-NOPROD","original_sixteenths":1600,"remaining_sixteenths":600,"measure_status":"CAL"}')
missing_location=stage('runlu_carpet_inventory_v52','RC-NOLOC','{"product_legacy_record_id":"PRD-CARPET","location_code":"NO-SUCH","roll_number":"RC-NOLOC","original_sixteenths":1600,"remaining_sixteenths":600,"measure_status":"CAL"}')
bad_measure=stage('runlu_carpet_inventory_v52','RC-BADMEASURE','{"product_legacy_record_id":"PRD-CARPET","location_code":"13C","roll_number":"RC-BADMEASURE","original_sixteenths":500,"remaining_sixteenths":600,"measure_status":"CAL"}')
full_mismatch=stage('runlu_carpet_inventory_v52','RC-FULLBAD','{"product_legacy_record_id":"PRD-CARPET","location_code":"13C","roll_number":"RC-FULLBAD","original_sixteenths":1600,"remaining_sixteenths":1500,"measure_status":"FULL"}')
operator_try=stage('runlu_carpet_inventory_v52','RC-OP','{"product_legacy_record_id":"PRD-CARPET","location_code":"13C","roll_number":"RC-OP","original_sixteenths":1600,"remaining_sixteenths":1600,"measure_status":"FULL"}')
dup_roll=stage('runlu_carpet_inventory_v52','RC-DUP-SOURCE','{"product_legacy_record_id":"PRD-CARPET","location_code":"13C","roll_number":"RC-MIG-1","original_sixteenths":1600,"remaining_sixteenths":600,"measure_status":"CAL"}')

for i,k in [(good,'valid'),(deferred,'deferred'),(missing_product,'valid'),(missing_location,'valid'),(bad_measure,'valid'),(full_mismatch,'valid'),(operator_try,'valid'),(dup_roll,'valid')]: classify(i,k)

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{good}','{AD}');")
assert r.returncode==0,r.stderr
rid=value(r)
r2=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{good}','{AD}');")
assert r2.returncode==0 and value(r2)==rid,(r2.stdout,r2.stderr)

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{deferred}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_NOT_VALID' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{missing_product}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_PRODUCT_LINK_NOT_FOUND' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{missing_location}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_LOCATION_LINK_NOT_FOUND' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{bad_measure}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_CARPET_MEASURE_INVALID' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{full_mismatch}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_CARPET_FULL_MISMATCH' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{OP}';select warehouse_v7.import_valid_carpet_roll('{T}','{operator_try}','{OP}');")
assert r.returncode!=0 and 'ADMIN_ROLE_REQUIRED' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{dup_roll}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_CANONICAL_CONFLICT' in r.stderr,r.stderr

state=run(f"select roll_number||'|'||original_sixteenths||'|'||remaining_sixteenths||'|'||measure_status||'|'||version||'|'||lifecycle from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{rid}';")
assert value(state)=='RC-MIG-1|1600|600|CAL|1|active',state.stdout
counts=run(f"""select
 (select count(*) from warehouse_v7.carpet_roll where tenant_id='{T}')||'|'||
 (select count(*) from warehouse_v7.command where tenant_id='{T}' and id='{good}' and status='committed')||'|'||
 (select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{good}' and movement_type='OPENING_ROLL_IMPORT')||'|'||
 (select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{good}' and event_type='MIGRATED_CARPET_ROLL');""")
assert value(counts)=='1|1|1|1',counts.stdout
link=run(f"select classification||'|'||imported_entity_type||'|'||imported_entity_id from warehouse_v7.migration_staging where tenant_id='{T}' and id='{good}';")
assert value(link)==f'imported|carpet_roll|{rid}',link.stdout
print('V7 valid-only Carpet Roll import + opening ledger attack: PASS')
