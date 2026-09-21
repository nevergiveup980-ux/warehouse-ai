import json,os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,A,P,L,S,C1,C2=[str(uuid.uuid4()) for _ in range(7)]

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
values('{T}','{P}','Receive Create Regression','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,lifecycle)
values('{T}','{L}','RCV-REG','active');
""")

def receive(command,qty,expected):
    r=run(f"""
    set request.jwt.claim.sub='{A}';
    select warehouse_v7.receive_stock(
      '{T}'::uuid,'{command}'::uuid,'{P}'::uuid,'{L}'::uuid,
      {qty},'BOX',{expected},'{S}'::uuid,'{{}}'::jsonb,
      '{A}'::uuid,'RECEIVE_REGRESSION'
    )::text;
    """)
    return json.loads(val(r))

first=receive(C1,5,0)
assert first['status']=='committed' and int(first['new_version'])==1,first
state=json.loads(val(run(f"""
select jsonb_build_object(
 'qty',(select quantity from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'version',(select version from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'event_version',(select entity_version from warehouse_v7.event where tenant_id='{T}' and command_id='{C1}'),
 'commands',(select count(*) from warehouse_v7.command where tenant_id='{T}' and id='{C1}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C1}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C1}')
)::text;
""")))
assert str(state['qty']).startswith('5') and int(state['version'])==1,state
assert int(state['event_version'])==1,state
assert state['commands']==1 and state['movements']==1 and state['events']==1,state

replay=receive(C1,5,0)
assert replay==first,(first,replay)
state2=json.loads(val(run(f"""
select jsonb_build_object(
 'qty',(select quantity from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'version',(select version from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'commands',(select count(*) from warehouse_v7.command where tenant_id='{T}' and id='{C1}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C1}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C1}')
)::text;
""")))
assert str(state2['qty']).startswith('5') and int(state2['version'])==1,state2
assert state2['commands']==1 and state2['movements']==1 and state2['events']==1,state2

second=receive(C2,2,1)
assert second['status']=='committed' and int(second['new_version'])==2,second
state3=json.loads(val(run(f"""
select jsonb_build_object(
 'qty',(select quantity from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'version',(select version from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}'),
 'event_version',(select entity_version from warehouse_v7.event where tenant_id='{T}' and command_id='{C2}')
)::text;
""")))
assert str(state3['qty']).startswith('7') and int(state3['version'])==2,state3
assert int(state3['event_version'])==2,state3

print('V7 RECEIVE create/update event-version regression: PASS')
