import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,AD=[str(uuid.uuid4()) for _ in range(2)]
def run(q): return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q],text=True,capture_output=True,env=E)
def value(r):
 lines=[x for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET']
 return lines[-1].strip() if lines else ''
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',f"insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T}','{AD}','admin');"],env=E)

r=run(f"select warehouse_v7.stage_legacy_record('{T}','runlu_product_master_v21','PRD-IMM','{{\"legacyName\":\"Raw Immutable\",\"coverageUnit\":\"SF / Box\"}}'::jsonb,'{{\"name\":\"Immutable\",\"base_unit\":\"BOX\"}}'::jsonb);")
assert r.returncode==0,r.stderr
sid=value(r)

# Review metadata may change through the formal API.
r=run(f"set request.jwt.claim.sub='{AD}';select warehouse_v7.classify_legacy_record('{T}','{sid}','valid','reviewed','{AD}');")
assert r.returncode==0,r.stderr

# Raw source evidence may not be rewritten, even by database owner/admin paths.
for expr in [
 "source_record_id='PRD-HACK'",
 "source_dataset='other_dataset'",
 "source_payload='{\"name\":\"HACK\",\"base_unit\":\"BOX\"}'::jsonb",
 "source_fingerprint='deadbeef'",
 "normalized_payload='{\"name\":\"HACK\",\"base_unit\":\"BOX\"}'::jsonb",
 "normalized_fingerprint='deadbeef'",
 "staged_at=now()+interval '1 day'"
]:
 r=run(f"update warehouse_v7.migration_staging set {expr} where tenant_id='{T}' and id='{sid}';")
 assert r.returncode!=0 and 'MIGRATION_SOURCE_EVIDENCE_IMMUTABLE' in r.stderr,r.stderr

state=run(f"select source_dataset||'|'||source_record_id||'|'||classification||'|'||(source_payload->>'legacyName')||'|'||(normalized_payload->>'name') from warehouse_v7.migration_staging where tenant_id='{T}' and id='{sid}';")
assert value(state)=='runlu_product_master_v21|PRD-IMM|valid|Raw Immutable|Immutable',state.stdout
print('V7 migration source evidence immutability attack: PASS')
