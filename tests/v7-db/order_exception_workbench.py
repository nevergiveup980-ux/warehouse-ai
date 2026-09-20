import json,os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T1,T2,A1,O1,A2,C1,C2,C3,E1,E2,E3=[str(uuid.uuid4()) for _ in range(11)]

def run(sql,ok=True):
    r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],
                     text=True,capture_output=True,env=E)
    if ok and r.returncode!=0:
        raise RuntimeError(r.stderr or r.stdout)
    return r

def val(r):
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET']
    return xs[-1] if xs else ''

run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
values
 ('{T1}','{A1}','admin','active'),
 ('{T1}','{O1}','operator','active'),
 ('{T2}','{A2}','admin','active');

insert into warehouse_v7.order_exception_case(
 tenant_id,id,case_key,source_dataset,reason,status,group_fingerprint,
 evidence_count,required_confirmation,display_context,version
) values
 ('{T1}','{C1}','wb:1','runlu_orders_v20','STRUCTURED_STATUS_MISSING','open',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',2,
  '["lifecycle","fulfillment_status","resolution_note"]'::jsonb,
  '{"order_kind":"STANDARD","purchase_order_number":"PO-WB-1","product_label":"Product A","quantity":"4","unit":"BOX"}'::jsonb,1),
 ('{T1}','{C2}','wb:2','runlu_special_orders_v51','IDENTITY_CRITICAL_FIELDS_CONFLICT','open',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1,
  '["canonical_identity","lifecycle","fulfillment_status","resolution_note"]'::jsonb,
  '{"order_kind":"SPECIAL","purchase_order_number":"PO-WB-2","product_label":"Product B","quantity":"1","unit":"EACH"}'::jsonb,1),
 ('{T2}','{C3}','wb:3','runlu_orders_v20','WEAK_SOURCE_IDENTITY','open',
  'cccccccccccccccccccccccccccccccc',1,
  '["canonical_identity","resolution_note"]'::jsonb,
  '{"order_kind":"STANDARD","product_label":"Secret Tenant 2","quantity":"2","unit":"BOX"}'::jsonb,1);

insert into warehouse_v7.order_source_evidence(
 tenant_id,id,order_id,exception_case_id,source_dataset,source_record_id,recovery_key,
 evidence_class,source_fingerprint,exception_reason,source_payload
) values
 ('{T1}','{E1}',null,'{C1}','runlu_orders_v20','wb-source-1','rk-wb-1',
  'deferred','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1','STRUCTURED_STATUS_MISSING',
  '{"status":null,"poNumber":"PO-WB-1","product":"Product A","quantity":"4","unit":"Box","customer":"Customer A","notes":"do not surface raw notes"}'::jsonb),
 ('{T1}','{E2}',null,'{C1}','runlu_orders_v20','wb-source-2','rk-wb-1',
  'deferred','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2','STRUCTURED_STATUS_MISSING',
  '{"status":null,"poNumber":"PO-WB-1","product":"Product A","quantity":"4","unit":"Box","customer":"Customer A"}'::jsonb),
 ('{T2}','{E3}',null,'{C3}','runlu_orders_v20','wb-source-3',null,
  'deferred','ccccccccccccccccccccccccccccccc1','WEAK_SOURCE_IDENTITY',
  '{"product":"Secret Tenant 2","quantity":"2","unit":"Box"}'::jsonb);
""")

def call(user,sql,ok=True):
    return run(f"set request.jwt.claim.sub='{user}'; {sql}",ok=ok)

admin=json.loads(val(call(A1,f"select warehouse_v7.list_order_exception_workbench('{T1}'::uuid,'open')::text;")))
assert admin['can_resolve'] is True,admin
assert admin['summary']['total']==2,admin
assert admin['summary']['status_missing']==1,admin
assert admin['summary']['identity_conflict']==1,admin
assert len(admin['cases'])==2,admin
assert admin['cases'][0]['reason']=='IDENTITY_CRITICAL_FIELDS_CONFLICT',admin['cases']
assert admin['cases'][1]['reason']=='STRUCTURED_STATUS_MISSING',admin['cases']
assert admin['cases'][1]['linked_evidence_rows']==2,admin['cases'][1]

operator=json.loads(val(call(O1,f"select warehouse_v7.list_order_exception_workbench('{T1}'::uuid,'open')::text;")))
assert operator['can_resolve'] is False,operator
assert operator['summary']['total']==2,operator

detail=json.loads(val(call(A1,f"select warehouse_v7.get_order_exception_workbench_case('{T1}'::uuid,'{C1}'::uuid)::text;")))
assert detail['case_id']==C1,detail
assert detail['can_resolve'] is True,detail
assert len(detail['evidence'])==2,detail
fields=detail['evidence'][0]['structured_fields']
assert fields['purchase_order_number']=='PO-WB-1',fields
assert fields['product_label']=='Product A',fields
assert fields['quantity']=='4',fields
assert 'notes' not in fields,fields

# Tenant membership gate prevents reading another tenant by UUID.
blocked=call(A1,f"select warehouse_v7.list_order_exception_workbench('{T2}'::uuid,'open')::text;",ok=False)
assert blocked.returncode!=0,(blocked.stdout,blocked.stderr)
assert 'TENANT_MEMBERSHIP_REQUIRED' in (blocked.stdout+blocked.stderr),(blocked.stdout,blocked.stderr)

# Invalid status filters are rejected rather than silently broadening scope.
bad=call(A1,f"select warehouse_v7.list_order_exception_workbench('{T1}'::uuid,'anything')::text;",ok=False)
assert bad.returncode!=0,(bad.stdout,bad.stderr)
assert 'INVALID_ORDER_EXCEPTION_STATUS' in (bad.stdout+bad.stderr),(bad.stdout,bad.stderr)

missing=val(call(A1,f"select coalesce(warehouse_v7.get_order_exception_workbench_case('{T1}'::uuid,'{uuid.uuid4()}'::uuid)::text,'null');"))
assert missing=='null',missing

print('V7 order exception workbench read-model regression: PASS')
