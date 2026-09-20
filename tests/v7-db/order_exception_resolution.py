import json,os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,A,OP,CASE,C1,C2,C3=[str(uuid.uuid4()) for _ in range(7)]

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
 ('{T}','{A}','admin','active'),
 ('{T}','{OP}','operator','active');

insert into warehouse_v7.order_exception_case(
 tenant_id,id,case_key,source_dataset,reason,status,group_fingerprint,
 evidence_count,required_confirmation,display_context,version
) values(
 '{T}','{CASE}','v6:test-case','runlu_orders_v20',
 'STRUCTURED_STATUS_MISSING','open','0123456789abcdef0123456789abcdef',
 2,'["lifecycle","fulfillment_status","resolution_note"]'::jsonb,
 '{{"purchase_order_number":"PO-TEST","product_label":"Test Product"}}'::jsonb,1
);

insert into warehouse_v7.order_source_evidence(
 tenant_id,id,order_id,exception_case_id,source_dataset,source_record_id,
 recovery_key,evidence_class,source_fingerprint,exception_reason,source_payload
) values(
 '{T}','{uuid.uuid4()}',null,'{CASE}','runlu_orders_v20','source-a',
 'rk-test','deferred','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 'STRUCTURED_STATUS_MISSING','{{"status":null}}'::jsonb
),(
 '{T}','{uuid.uuid4()}',null,'{CASE}','runlu_orders_v20','source-b',
 'rk-test','deferred','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 'STRUCTURED_STATUS_MISSING','{{"status":null}}'::jsonb
);
""")

def resolve(user,command,expected):
    return json.loads(val(run(f"""
      set request.jwt.claim.sub='{user}';
      select warehouse_v7.resolve_order_exception_create_order(
        '{T}','{command}','{CASE}',{expected},
        'STANDARD','in_progress','pending',
        '{{"recovery_key":"rk-test","purchase_order_number":"PO-TEST",
           "customer_label":"Customer","product_label":"Test Product",
           "source_location":"33A","quantity":"4","unit":"box"}}'::jsonb,
        'Human verified the missing structured status from the source paperwork.',
        '{user}','TEST'
      )::text;
    """)))

# Operator cannot resolve review cases.
unauth=run(f"""
set request.jwt.claim.sub='{OP}';
select warehouse_v7.resolve_order_exception_create_order(
  '{T}','{C3}','{CASE}',1,'STANDARD','in_progress','pending',
  '{{"product_label":"Test Product"}}'::jsonb,'operator attempt','{OP}','TEST'
)::text;
""",ok=False)
assert unauth.returncode!=0,(unauth.stdout,unauth.stderr)
assert 'ORDER_EXCEPTION_REVIEW_ROLE_REQUIRED' in (unauth.stdout+unauth.stderr),(unauth.stdout,unauth.stderr)

first=resolve(A,C1,1)
assert first['status']=='committed',first
assert first['case_status']=='resolved',first
assert int(first['new_case_version'])==2,first
ORDER=first['order_id']

state=json.loads(val(run(f"""
select jsonb_build_object(
 'case_status',(select status from warehouse_v7.order_exception_case where tenant_id='{T}' and id='{CASE}'),
 'case_version',(select version from warehouse_v7.order_exception_case where tenant_id='{T}' and id='{CASE}'),
 'resolved_order',(select resolved_order_id::text from warehouse_v7.order_exception_case where tenant_id='{T}' and id='{CASE}'),
 'orders',(select count(*) from warehouse_v7.order_record where tenant_id='{T}'),
 'decisions',(select count(*) from warehouse_v7.order_exception_decision where tenant_id='{T}' and case_id='{CASE}'),
 'commands',(select count(*) from warehouse_v7.command where tenant_id='{T}' and id='{C1}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C1}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C1}'),
 'linked_evidence',(select linked_evidence_rows from warehouse_v7.order_exception_queue where tenant_id='{T}' and case_id='{CASE}')
)::text;
""")))
assert state['case_status']=='resolved' and state['case_version']==2,state
assert state['resolved_order']==ORDER,state
assert state['orders']==1 and state['decisions']==1 and state['commands']==1 and state['events']==1,state
assert state['movements']==0,state
assert state['linked_evidence']==2,state

order=json.loads(val(run(f"""
select jsonb_build_object(
 'kind',order_kind,'life',lifecycle,'fulfill',fulfillment_status,
 'po',purchase_order_number,'product',product_label,'qty',quantity::text,'unit',unit
)::text
from warehouse_v7.order_record where tenant_id='{T}' and id='{ORDER}';
""")))
assert order['kind']=='STANDARD' and order['life']=='in_progress' and order['fulfill']=='pending',order
assert order['po']=='PO-TEST' and order['product']=='Test Product',order
assert order['qty']=='4.000000' and order['unit']=='BOX',order

# Exact retry is idempotent.
second=resolve(A,C1,1)
assert second==first,(first,second)
counts=json.loads(val(run(f"""
select jsonb_build_object(
 'orders',(select count(*) from warehouse_v7.order_record where tenant_id='{T}'),
 'decisions',(select count(*) from warehouse_v7.order_exception_decision where tenant_id='{T}' and case_id='{CASE}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C1}')
)::text;
""")))
assert counts=={'orders':1,'decisions':1,'events':1},counts

# A different command cannot resolve an already resolved case.
again=resolve(A,C2,2)
assert again['status']=='rejected' and again['code']=='ORDER_EXCEPTION_ALREADY_RESOLVED',again

# Decision history is immutable.
decision_id=val(run(f"select id::text from warehouse_v7.order_exception_decision where tenant_id='{T}' and case_id='{CASE}';"))
u=run(f"update warehouse_v7.order_exception_decision set payload='{{}}' where tenant_id='{T}' and id='{decision_id}';",ok=False)
assert u.returncode!=0 and 'ORDER_EXCEPTION_DECISION_APPEND_ONLY' in (u.stdout+u.stderr),(u.stdout,u.stderr)
d=run(f"delete from warehouse_v7.order_exception_decision where tenant_id='{T}' and id='{decision_id}';",ok=False)
assert d.returncode!=0 and 'ORDER_EXCEPTION_DECISION_APPEND_ONLY' in (d.stdout+d.stderr),(d.stdout,d.stderr)

print('V7 order exception resolution regression: PASS')
