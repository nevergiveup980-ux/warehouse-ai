import os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,A,EVID,O=[str(uuid.uuid4()) for _ in range(4)]

def run(sql,ok=True):
    r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
    if ok and r.returncode!=0: raise RuntimeError(r.stderr or r.stdout)
    return r

run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
values('{T}','{A}','admin','active');

insert into warehouse_v7.order_record(
 tenant_id,id,order_kind,source_identity_key,lifecycle,fulfillment_status
) values('{T}','{O}','STANDARD','delete-guard','draft','unverified');

insert into warehouse_v7.order_source_evidence(
  tenant_id,id,order_id,exception_case_id,source_dataset,source_record_id,recovery_key,
  evidence_class,source_fingerprint,exception_reason,source_payload
) values(
  '{T}','{EVID}','{O}',null,'runlu_orders_v20','source-1','recovery-1',
  'replay_duplicate','0123456789abcdef0123456789abcdef',
  null,'{{"status":"source"}}'::jsonb
);
""")

u=run(f"""
update warehouse_v7.order_source_evidence
set evidence_class='identity_conflict'
where tenant_id='{T}' and id='{EVID}';
""",ok=False)
assert u.returncode!=0,(u.stdout,u.stderr)
assert 'ORDER_SOURCE_EVIDENCE_APPEND_ONLY' in (u.stdout+u.stderr),(u.stdout,u.stderr)

d=run(f"""
delete from warehouse_v7.order_source_evidence
where tenant_id='{T}' and id='{EVID}';
""",ok=False)
assert d.returncode!=0,(d.stdout,d.stderr)
assert 'ORDER_SOURCE_EVIDENCE_APPEND_ONLY' in (d.stdout+d.stderr),(d.stdout,d.stderr)

still=run(f"select count(*) from warehouse_v7.order_source_evidence where tenant_id='{T}' and id='{EVID}';")
assert still.stdout.strip()=='1',still.stdout

# Canonical order rows cannot be hard-deleted either.
r=run(f"delete from warehouse_v7.order_record where tenant_id='{T}' and id='{O}';",ok=False)
assert r.returncode!=0,(r.stdout,r.stderr)
assert 'ORDER_RECORD_DELETE_FORBIDDEN_USE_ARCHIVE' in (r.stdout+r.stderr),(r.stdout,r.stderr)

print('V7 order evidence immutability attack: PASS')
