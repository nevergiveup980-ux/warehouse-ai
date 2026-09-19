import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T,AD,OP=[str(uuid.uuid4()) for _ in range(3)]
def run(q): return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q],text=True,capture_output=True,env=E)
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',f"insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T}','{AD}','admin'),('{T}','{OP}','operator');"],env=E)

def stage(rid,payload):
 r=run(f"select warehouse_v7.stage_legacy_record('{T}','runlu_product_master_v21','{rid}','{payload}'::jsonb);")
 assert r.returncode==0,r.stderr
 return r.stdout.strip()

good=stage('PRD-GOOD','{"name":"Good Product","base_unit":"BOX","sku":"GP-1"}')
dup=stage('PRD-DUP','{"name":"Dup Product","base_unit":"BOX"}')
orph=stage('PRD-ORPH','{"name":"Orphan Product","base_unit":"BOX"}')
conf=stage('PRD-CONF','{"name":"Conflict Product","base_unit":"BOX"}')
defer=stage('PRD-DEFER','{"name":"Deferred Product","base_unit":"BOX"}')
bad=stage('PRD-BAD','{"name":"Missing Unit"}')

def classify(i,k):
 r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.classify_legacy_record('{T}','{i}','{k}','review','{AD}');")
 assert r.returncode==0,r.stderr

for i,k in [(good,'valid'),(dup,'duplicate'),(orph,'orphan'),(conf,'conflict'),(defer,'deferred'),(bad,'valid')]: classify(i,k)

r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{good}','{AD}');")
assert r.returncode==0,r.stderr
pid=r.stdout.strip()
r2=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{good}','{AD}');")
assert r2.returncode==0 and r2.stdout.strip()==pid,(r2.stdout,r2.stderr)

for i in [dup,orph,conf,defer]:
 r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{i}','{AD}');")
 assert r.returncode!=0 and 'MIGRATION_NOT_VALID' in r.stderr,r.stderr

r=run(f"set request.jwt.claim.sub='{OP}';select warehouse_v7.import_valid_product('{T}','{bad}','{OP}');")
assert r.returncode!=0 and 'ADMIN_ROLE_REQUIRED' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{bad}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_PRODUCT_REQUIRED_FIELDS' in r.stderr,r.stderr

count=run(f"select count(*) from warehouse_v7.product where tenant_id='{T}';")
assert count.stdout.strip()=='1',count.stdout
link=run(f"select classification||'|'||imported_entity_type||'|'||imported_entity_id from warehouse_v7.migration_staging where tenant_id='{T}' and id='{good}';")
assert link.stdout.strip()==f'imported|product|{pid}',link.stdout
print('V7 valid-only Product import attack: PASS')
