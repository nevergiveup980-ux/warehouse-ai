import json,os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,A,P,L,OIN,OOUT,SIN,SOUT=[str(uuid.uuid4()) for _ in range(8)]
B1,B2,R1,R2,R3,S1,S2=[str(uuid.uuid4()) for _ in range(7)]

def run(sql,ok=True):
    r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
    if ok and r.returncode!=0: raise RuntimeError(r.stderr or r.stdout)
    return r
def val(r):
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET']
    return xs[-1] if xs else ''
def j(sql): return json.loads(val(run(sql)))

run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
values('{T}','{A}','admin','active');

insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle)
values('{T}','{P}','ORDER-BRIDGE-P','Bridge Product','BOX','BOX','active');

insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
values('{T}','{L}','BRIDGE-A','rack','active');

insert into warehouse_v7.order_record(
 tenant_id,id,order_kind,source_identity_key,purchase_order_number,product_label,
 source_location,quantity,unit,lifecycle,fulfillment_status,version
) values
 ('{T}','{OIN}','STANDARD','bridge:in','PO-IN','Legacy Label Only','Legacy Rack',5,'BOX','in_progress','pending',1),
 ('{T}','{OOUT}','STANDARD','bridge:out','PO-OUT','Another Label','Somewhere',4,'BOX','in_progress','pending',1);

insert into warehouse_v7.stock_item(
 tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id
) values(
 '{T}','{SOUT}','{P}','{L}',4,'BOX',1,'active','ORDER-BRIDGE-OUT-STOCK'
);
""")

def bind(cmd,order,flow,stock,qty):
    stock_sql='null' if stock is None else f"'{stock}'::uuid"
    return j(f"""
      set request.jwt.claim.sub='{A}';
      select warehouse_v7.bind_order_execution(
        '{T}','{cmd}','{order}',1,'{flow}','{P}','{L}',{stock_sql},{qty},'box',
        '{{"test":"order-execution-bridge"}}'::jsonb,'{A}','TEST'
      )::text;
    """)

inbound=bind(B1,OIN,'INBOUND',None,5)
assert inbound['status']=='committed' and inbound['flow']=='INBOUND',inbound
assert inbound['stock_item_id'] is None,inbound
assert bind(B1,OIN,'INBOUND',None,5)==inbound

already=bind(B2,OIN,'INBOUND',None,5)
assert already['status']=='rejected' and already['code']=='ORDER_EXECUTION_ALREADY_BOUND',already

outbound=bind(str(uuid.uuid4()),OOUT,'OUTBOUND',SOUT,4)
assert outbound['status']=='committed' and outbound['stock_item_id']==SOUT,outbound

def receive(cmd,qty,stock_version):
    return j(f"""
      set request.jwt.claim.sub='{A}';
      select warehouse_v7.receive_bound_order_stock(
        '{T}','{cmd}','{OIN}',1,'{SIN}',{stock_version},{qty},
        '{{"source":"bridge-test"}}'::jsonb,'{A}','TEST'
      )::text;
    """)

first=receive(R1,2,0)
assert first['status']=='committed' and float(first['received'])==2,first
q1=j(f"""
select jsonb_build_object(
 'remaining',remaining_quantity::text,
 'executed',executed_quantity::text,
 'task',task_status,
 'next',next_action,
 'stock',stock_item_id::text,
 'binding_version',binding_version
)::text from warehouse_v7.order_execution_queue
where tenant_id='{T}' and order_id='{OIN}';
""")
assert q1['remaining']=='3.000000' and q1['executed']=='2.000000',q1
assert q1['task']=='open' and q1['next']=='RECEIVE_ORDER' and q1['stock']==SIN,q1
assert int(q1['binding_version'])==2,q1

replay=receive(R1,2,0)
assert replay==first,(first,replay)
counts=j(f"""
select jsonb_build_object(
 'actions',(select count(*) from warehouse_v7.order_fulfillment_action where tenant_id='{T}' and order_id='{OIN}'),
 'moves',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{R1}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{R1}')
)::text;
""")
assert counts['actions']==1 and counts['moves']==1 and counts['events']==2,counts

over=run(f"""
set request.jwt.claim.sub='{A}';
select warehouse_v7.receive_bound_order_stock(
 '{T}','{R3}','{OIN}',1,'{SIN}',1,4,
 '{{"source":"bridge-test"}}'::jsonb,'{A}','TEST'
)::text;
""",ok=False)
assert over.returncode!=0 and 'ORDER_EXECUTION_OVERFULFILLMENT' in (over.stdout+over.stderr),(over.stdout,over.stderr)

second=receive(R2,3,1)
assert second['status']=='committed' and float(second['received'])==3,second
q2=j(f"""
select jsonb_build_object(
 'remaining',remaining_quantity::text,'executed',executed_quantity::text,'task',task_status
)::text from warehouse_v7.order_execution_queue
where tenant_id='{T}' and order_id='{OIN}';
""")
assert q2=={'remaining':'0.000000','executed':'5.000000','task':'completed'},q2

def ship(cmd,qty,stock_version):
    return j(f"""
      set request.jwt.claim.sub='{A}';
      select warehouse_v7.ship_bound_order_stock(
        '{T}','{cmd}','{OOUT}',1,{stock_version},{qty},
        '{{"source":"bridge-test"}}'::jsonb,'{A}','TEST'
      )::text;
    """)

sh1=ship(S1,1.5,1)
assert sh1['status']=='committed' and float(sh1['shipped'])==1.5,sh1
sq1=j(f"""
select jsonb_build_object(
 'remaining',remaining_quantity::text,'executed',executed_quantity::text,
 'task',task_status,'next',next_action
)::text from warehouse_v7.order_execution_queue
where tenant_id='{T}' and order_id='{OOUT}';
""")
assert sq1=={'remaining':'2.500000','executed':'1.500000','task':'open','next':'SHIP_ORDER'},sq1
assert ship(S1,1.5,1)==sh1

sh2=ship(S2,2.5,2)
assert sh2['status']=='committed' and float(sh2['remaining'])==0,sh2
sq2=j(f"""
select jsonb_build_object(
 'remaining',remaining_quantity::text,'executed',executed_quantity::text,'task',task_status
)::text from warehouse_v7.order_execution_queue
where tenant_id='{T}' and order_id='{OOUT}';
""")
assert sq2=={'remaining':'0.000000','executed':'4.000000','task':'completed'},sq2

state=j(f"""
select jsonb_build_object(
 'in_qty',(select quantity::text from warehouse_v7.stock_item where tenant_id='{T}' and id='{SIN}'),
 'out_qty',(select quantity::text from warehouse_v7.stock_item where tenant_id='{T}' and id='{SOUT}'),
 'out_lifecycle',(select lifecycle from warehouse_v7.stock_item where tenant_id='{T}' and id='{SOUT}'),
 'in_order_status',(select lifecycle||':'||fulfillment_status from warehouse_v7.order_record where tenant_id='{T}' and id='{OIN}'),
 'out_order_status',(select lifecycle||':'||fulfillment_status from warehouse_v7.order_record where tenant_id='{T}' and id='{OOUT}')
)::text;
""")
assert state['in_qty']=='5.000000',state
assert state['out_qty']=='0.000000' and state['out_lifecycle']=='consumed',state
assert state['in_order_status']=='in_progress:pending' and state['out_order_status']=='in_progress:pending',state

aid=val(run(f"select id::text from warehouse_v7.order_fulfillment_action where tenant_id='{T}' and command_id='{R1}';"))
u=run(f"update warehouse_v7.order_fulfillment_action set quantity=999 where tenant_id='{T}' and id='{aid}';",ok=False)
assert u.returncode!=0 and 'ORDER_FULFILLMENT_ACTION_APPEND_ONLY' in (u.stdout+u.stderr),(u.stdout,u.stderr)
d=run(f"delete from warehouse_v7.order_fulfillment_action where tenant_id='{T}' and id='{aid}';",ok=False)
assert d.returncode!=0 and 'ORDER_FULFILLMENT_ACTION_APPEND_ONLY' in (d.stdout+d.stderr),(d.stdout,d.stderr)

print('V7 order execution bridge regression: PASS')
