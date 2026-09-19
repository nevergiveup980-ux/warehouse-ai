import json,os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,A,P,L,S,C=[str(uuid.uuid4()) for _ in range(6)]

def run(sql,ok=True):
    r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
    if ok and r.returncode!=0: raise RuntimeError(r.stderr or r.stdout)
    return r

def val(r):
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET']
    return xs[-1] if xs else ''

run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
values('{T}','{A}','admin','active');

insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle)
values('{T}','{P}','Supplier Return Regression','BOX','active');

insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
values('{T}','{L}','SUP-RET-WH','rack','active');

insert into warehouse_v7.stock_item(
 tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle
) values('{T}','{S}','{P}','{L}',11,'BOX',1,'active');
""")

def call():
    return json.loads(val(run(f"""
      set request.jwt.claim.sub='{A}';
      select warehouse_v7.return_stock_to_supplier(
        '{T}','{C}','{S}',1,7,'TAIGA-PO-TEST',
        '{{"regression":"supplier-return"}}','{A}','TEST'
      )::text;
    """)))

first=call()
assert first['status']=='committed',first
assert str(first['before']).startswith('11'),first
assert str(first['returned_to_supplier']).startswith('7'),first
assert str(first['remaining']).startswith('4'),first
assert first['supplier_ref']=='TAIGA-PO-TEST',first
assert int(first['new_version'])==2,first

state=json.loads(val(run(f"""
select jsonb_build_object(
 'qty',(select quantity::text from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'ver',(select version from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'life',(select lifecycle from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'commands',(select count(*) from warehouse_v7.command where tenant_id='{T}' and id='{C}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C}')
)::text;
""")))
assert state['qty']=='4.000000' and state['ver']==2 and state['life']=='active',state
assert state['commands']==1 and state['movements']==1 and state['events']==1,state

second=call()
assert second==first,(first,second)
state2=json.loads(val(run(f"""
select jsonb_build_object(
 'qty',(select quantity::text from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C}')
)::text;
""")))
assert state2['qty']=='4.000000',state2
assert state2['movements']==1 and state2['events']==1,state2

# Fresh command against stale version must reject, not mutate.
C2=str(uuid.uuid4())
stale=json.loads(val(run(f"""
  set request.jwt.claim.sub='{A}';
  select warehouse_v7.return_stock_to_supplier(
    '{T}','{C2}','{S}',1,1,'TAIGA-PO-TEST',
    '{{"regression":"stale"}}','{A}','TEST'
  )::text;
""")))
assert stale['status']=='rejected' and stale['code']=='STALE_VERSION',stale

# Fresh command cannot return more than remaining inventory.
C3=str(uuid.uuid4())
over=json.loads(val(run(f"""
  set request.jwt.claim.sub='{A}';
  select warehouse_v7.return_stock_to_supplier(
    '{T}','{C3}','{S}',2,5,'TAIGA-PO-TEST',
    '{{"regression":"over"}}','{A}','TEST'
  )::text;
""")))
assert over['status']=='rejected' and over['code']=='INSUFFICIENT_STOCK',over

print('V7 supplier return regression: PASS')
