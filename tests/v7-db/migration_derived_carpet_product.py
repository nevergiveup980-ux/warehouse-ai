import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,AD=[str(uuid.uuid4()) for _ in range(2)]
def run(q): return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q],text=True,capture_output=True,env=E)
def value(r):
 lines=[x for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET']
 return lines[-1].strip() if lines else ''
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',f"insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T}','{AD}','admin');"],env=E)

def stage(code,collection,colour):
 r=run(f"select warehouse_v7.stage_derived_carpet_product('{T}','{code}','{collection}','{colour}');")
 assert r.returncode==0,r.stderr
 return value(r)

# Case-only label changes are the same canonical label.
a=stage('chc024','Classic Cut','Blue Stone')
b=stage('CHC024','CLASSIC CUT','BLUE STONE')
assert a==b,(a,b)
state=run(f"select classification||'|'||jsonb_array_length(evidence) from warehouse_v7.migration_staging where tenant_id='{T}' and id='{a}';")
assert value(state)=='unreviewed|1',state.stdout

# A materially different label on the same source code is quarantined as conflict.
c1=stage('CHC022','CLASSIC CUT','FROSTED SLATE(GREY)')
c2=stage('CHC022','Classic Update','935 - Frosted Slate')
assert c1==c2,(c1,c2)
state=run(f"select classification||'|'||exception_reason||'|'||jsonb_array_length(evidence) from warehouse_v7.migration_staging where tenant_id='{T}' and id='{c1}';")
assert value(state)=='conflict|CARPET_SOURCE_LABEL_VARIANT|2',state.stdout

# Conflict cannot cross the canonical Product boundary.
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{c1}','{AD}');")
assert r.returncode!=0 and 'MIGRATION_NOT_VALID' in r.stderr,r.stderr

# Consistent derived source may be reviewed and imported as a normal canonical Product.
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.classify_legacy_record('{T}','{a}','valid','consistent source labels','{AD}');")
assert r.returncode==0,r.stderr
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.import_valid_product('{T}','{a}','{AD}');")
assert r.returncode==0,r.stderr
pid=value(r)
prod=run(f"select legacy_record_id||'|'||name||'|'||colour||'|'||base_unit from warehouse_v7.product where tenant_id='{T}' and id='{pid}';")
assert value(prod)=='CARPET_SOURCE:CHC024|Classic Cut|Blue Stone|1/16_IN',prod.stdout
print('V7 derived Carpet Product staging/conflict attack: PASS')
