import json,os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,A,P,L1,L2,S1,S2,C=[str(uuid.uuid4()) for _ in range(8)]

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
values('{T}','{P}','Transfer Quantity Regression','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,lifecycle) values
('{T}','{L1}','TQ-SRC','active'),('{T}','{L2}','TQ-DST','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle)
values('{T}','{S1}','{P}','{L1}',92,'BOX',1,'active');
""")

def transfer():
    return json.loads(val(run(f"""
    set request.jwt.claim.sub='{A}';
    select warehouse_v7.transfer_stock_quantity(
      '{T}','{C}','{S1}',1,'{S2}',0,57,'{L2}',
      '{{"regression":"partial-transfer"}}','{A}','TEST'
    )::text;
    """)))

first=transfer()
assert first['status']=='committed',first
assert str(first['source_before']).startswith('92')
assert str(first['source_remaining']).startswith('35')
assert str(first['destination_quantity']).startswith('57')
assert int(first['source_new_version'])==2
assert int(first['destination_new_version'])==1

state=json.loads(val(run(f"""
select jsonb_build_object(
 'src_qty',(select quantity::text from warehouse_v7.stock_item where tenant_id='{T}' and id='{S1}'),
 'src_ver',(select version from warehouse_v7.stock_item where tenant_id='{T}' and id='{S1}'),
 'dst_qty',(select quantity::text from warehouse_v7.stock_item where tenant_id='{T}' and id='{S2}'),
 'dst_ver',(select version from warehouse_v7.stock_item where tenant_id='{T}' and id='{S2}'),
 'commands',(select count(*) from warehouse_v7.command where tenant_id='{T}' and id='{C}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C}')
)::text;
""")))
assert state['src_qty']=='35.000000' and state['src_ver']==2,state
assert state['dst_qty']=='57.000000' and state['dst_ver']==1,state
assert state['commands']==1 and state['movements']==2 and state['events']==2,state

replay=transfer()
assert replay==first,(first,replay)
state2=json.loads(val(run(f"""
select jsonb_build_object(
 'src_qty',(select quantity::text from warehouse_v7.stock_item where tenant_id='{T}' and id='{S1}'),
 'dst_qty',(select quantity::text from warehouse_v7.stock_item where tenant_id='{T}' and id='{S2}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C}')
)::text;
""")))
assert state2['src_qty']=='35.000000' and state2['dst_qty']=='57.000000',state2
assert state2['movements']==2 and state2['events']==2,state2
print('V7 quantity-aware stock transfer regression: PASS')
