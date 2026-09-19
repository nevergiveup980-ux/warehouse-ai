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

ps=stage('runlu_product_master_v21','CARPET_SOURCE:CHC022','{"name":"Classic Cut - Frosted Slate","base_unit":"1/16_IN"}'); classify(ps,'valid')
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{ps}','{AD}');"); assert r.returncode==0,r.stderr
ls=stage('derived_location_v6','LOC-CARPET','{"code":"14D","kind":"rack"}'); classify(ls,'valid')
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_location('{T}','{ls}','{AD}');"); assert r.returncode==0,r.stderr

good=stage('runlu_carpet_inventory_v52','RC-MIG-1','{"product_legacy_record_id":"CARPET_SOURCE:CHC022","location_code":"14D","roll_number":"CHC022","physical_key":"source_mfg:CHC022|9692","manufacturer_roll":"9692","source_roll":"CHC022","original_sixteenths":1600,"remaining_sixteenths":600,"measure_status":"CAL"}')
same_display_other_physical=stage('runlu_carpet_inventory_v52','RC-MIG-2','{"product_legacy_record_id":"CARPET_SOURCE:CHC022","location_code":"14D","roll_number":"CHC022","physical_key":"source_mfg:CHC022|9716","manufacturer_roll":"9716","source_roll":"CHC022","original_sixteenths":1700,"remaining_sixteenths":1700,"measure_status":"FULL"}')
replay_duplicate=stage('runlu_carpet_inventory_v52','RC-REPLAY','{"product_legacy_record_id":"CARPET_SOURCE:CHC022","location_code":"14D","roll_number":"CHC022","physical_key":"source_mfg:CHC022|9692","manufacturer_roll":"9692","source_roll":"CHC022","original_sixteenths":1600,"remaining_sixteenths":600,"measure_status":"CAL"}')
weak_identity=stage('runlu_carpet_inventory_v52','RC-WEAK','{"product_legacy_record_id":"CARPET_SOURCE:CHC022","location_code":"14D","roll_number":"CHC022","original_sixteenths":1600,"remaining_sixteenths":600,"measure_status":"CAL"}')
deferred=stage('runlu_carpet_inventory_v52','RC2253','{"product_legacy_record_id":"CARPET_SOURCE:CHC022","location_code":"14D","roll_number":"RC2253","physical_key":"manual:RC2253","original_sixteenths":1600,"remaining_sixteenths":700,"measure_status":"TM"}')
missing_location=stage('runlu_carpet_inventory_v52','RC-NOLOC','{"product_legacy_record_id":"CARPET_SOURCE:CHC022","location_code":"NO-SUCH","roll_number":"RC-NOLOC","physical_key":"source_mfg:CHC022|NOLOC","original_sixteenths":1600,"remaining_sixteenths":600,"measure_status":"CAL"}')
full_mismatch=stage('runlu_carpet_inventory_v52','RC-FULLBAD','{"product_legacy_record_id":"CARPET_SOURCE:CHC022","location_code":"14D","roll_number":"RC-FULLBAD","physical_key":"source_mfg:CHC022|FULLBAD","original_sixteenths":1600,"remaining_sixteenths":1500,"measure_status":"FULL"}')
operator_try=stage('runlu_carpet_inventory_v52','RC-OP','{"product_legacy_record_id":"CARPET_SOURCE:CHC022","location_code":"14D","roll_number":"RC-OP","physical_key":"source_mfg:CHC022|OP","original_sixteenths":1600,"remaining_sixteenths":1600,"measure_status":"FULL"}')

for i,k in [(good,'valid'),(same_display_other_physical,'valid'),(replay_duplicate,'valid'),(weak_identity,'valid'),(deferred,'deferred'),(missing_location,'valid'),(full_mismatch,'valid'),(operator_try,'valid')]: classify(i,k)

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{good}','{AD}');")
assert r.returncode==0,r.stderr
rid=value(r)
r2=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{good}','{AD}');")
assert r2.returncode==0 and value(r2)==rid,(r2.stdout,r2.stderr)

# Same display roll code may represent a different physical roll.
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{same_display_other_physical}','{AD}');")
assert r.returncode==0,r.stderr
rid2=value(r)
assert rid2!=rid

# Replay of the same physical identity must be blocked.
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{replay_duplicate}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_CANONICAL_CONFLICT' in r.stderr,r.stderr

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{weak_identity}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_CARPET_PHYSICAL_KEY_REQUIRED' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{deferred}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_NOT_VALID' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{missing_location}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_LOCATION_LINK_NOT_FOUND' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_carpet_roll('{T}','{full_mismatch}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_CARPET_FULL_MISMATCH' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{OP}';select warehouse_v7.import_valid_carpet_roll('{T}','{operator_try}','{OP}');")
assert r.returncode!=0 and 'ADMIN_ROLE_REQUIRED' in r.stderr,r.stderr

state=run(f"select roll_number||'|'||physical_key||'|'||manufacturer_roll||'|'||source_roll||'|'||remaining_sixteenths||'|'||measure_status from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{rid}';")
assert value(state)=='CHC022|source_mfg:CHC022|9692|9692|CHC022|600|CAL',state.stdout
counts=run(f"""select
 (select count(*) from warehouse_v7.carpet_roll where tenant_id='{T}')||'|'||
 (select count(*) from warehouse_v7.command where tenant_id='{T}' and id in ('{good}','{same_display_other_physical}') and status='committed')||'|'||
 (select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id in ('{good}','{same_display_other_physical}') and movement_type='OPENING_ROLL_IMPORT')||'|'||
 (select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id in ('{good}','{same_display_other_physical}') and event_type='MIGRATED_CARPET_ROLL');""")
assert value(counts)=='2|2|2|2',counts.stdout
print('V7 physical-identity Carpet Roll migration attack: PASS')
