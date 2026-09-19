import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T,AD,OP=[str(uuid.uuid4()) for _ in range(3)]
def run(q): return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q],text=True,capture_output=True,env=E)
def value(r):
 lines=[x for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET']
 return lines[-1].strip() if lines else ''
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',f"insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T}','{AD}','admin'),('{T}','{OP}','operator');"],env=E)

def stage(rid,payload):
 r=run(f"select warehouse_v7.stage_legacy_record('{T}','derived_location_v6','{rid}','{payload}'::jsonb);")
 assert r.returncode==0,r.stderr
 return value(r)

good=stage('LOC-13C','{"code":"13C","kind":"rack"}')
defer=stage('LOC-DEFER','{"code":"99Z","kind":"rack"}')
bad=stage('LOC-BAD','{"kind":"rack"}')
conflict=stage('LOC-CONFLICT','{"code":"13C","kind":"rack"}')

def classify(i,k):
 r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.classify_legacy_record('{T}','{i}','{k}','review','{AD}');")
 assert r.returncode==0,r.stderr

for i,k in [(good,'valid'),(defer,'deferred'),(bad,'valid'),(conflict,'valid')]: classify(i,k)

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_location('{T}','{good}','{AD}');")
assert r.returncode==0,r.stderr
lid=value(r)
r2=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_location('{T}','{good}','{AD}');")
assert r2.returncode==0 and value(r2)==lid,(r2.stdout,r2.stderr)

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_location('{T}','{defer}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_NOT_VALID' in r.stderr,r.stderr

r=run(f"set request.jwt.claim.sub='{OP}';select warehouse_v7.import_valid_location('{T}','{bad}','{OP}');")
assert r.returncode!=0 and 'ADMIN_ROLE_REQUIRED' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_location('{T}','{bad}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_LOCATION_CODE_REQUIRED' in r.stderr,r.stderr

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_location('{T}','{conflict}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_CANONICAL_CONFLICT' in r.stderr,r.stderr

count=run(f"select count(*) from warehouse_v7.location where tenant_id='{T}';")
assert value(count)=='1',count.stdout
link=run(f"select classification||'|'||imported_entity_type||'|'||imported_entity_id from warehouse_v7.migration_staging where tenant_id='{T}' and id='{good}';")
assert value(link)==f'imported|location|{lid}',link.stdout
print('V7 valid-only Location import attack: PASS')
