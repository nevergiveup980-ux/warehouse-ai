import json,os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,A,O,C1,C2,C3,C4=[str(uuid.uuid4()) for _ in range(7)]

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

insert into warehouse_v7.order_record(
 tenant_id,id,order_kind,source_identity_key,recovery_key,
 sales_order_number,customer_label,product_label,source_location,
 quantity,unit,lifecycle,fulfillment_status,version
) values(
 '{T}','{O}','SPECIAL','recovery:test-special','test-special',
 'SO-TEST','Order Test','Curate Plank','33A',
 51,'BOX','in_progress','ready_for_pickup',1
);
""")

def transition(command,expected,lifecycle,fulfillment):
    return json.loads(val(run(f"""
      set request.jwt.claim.sub='{A}';
      select warehouse_v7.transition_order(
        '{T}','{command}','{O}',{expected},
        '{lifecycle}','{fulfillment}',
        '{{"regression":"order"}}','{A}','TEST'
      )::text;
    """)))

first=transition(C1,1,'in_progress','picked_up')
assert first['status']=='committed',first
assert first['lifecycle']=='in_progress'
assert first['fulfillment_status']=='picked_up'
assert int(first['new_version'])==2

state=json.loads(val(run(f"""
select jsonb_build_object(
 'life',(select lifecycle from warehouse_v7.order_record where tenant_id='{T}' and id='{O}'),
 'fulfill',(select fulfillment_status from warehouse_v7.order_record where tenant_id='{T}' and id='{O}'),
 'version',(select version from warehouse_v7.order_record where tenant_id='{T}' and id='{O}'),
 'commands',(select count(*) from warehouse_v7.command where tenant_id='{T}' and id='{C1}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C1}')
)::text;
""")))
assert state['life']=='in_progress' and state['fulfill']=='picked_up' and state['version']==2,state
assert state['commands']==1 and state['events']==1,state

# Same UUID returns exactly the committed result and adds no event.
second=transition(C1,1,'in_progress','picked_up')
assert second==first,(first,second)
state2=json.loads(val(run(f"""
select jsonb_build_object(
 'version',(select version from warehouse_v7.order_record where tenant_id='{T}' and id='{O}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C1}')
)::text;
""")))
assert state2['version']==2 and state2['events']==1,state2

# Fulfillment cannot move backward.
bad=transition(C2,2,'in_progress','ready_for_pickup')
assert bad['status']=='rejected' and bad['code']=='INVALID_ORDER_FULFILLMENT_TRANSITION',bad

# A fresh command cannot create a meaningless same-state event/version bump.
noop=transition(C4,2,'in_progress','picked_up')
assert noop['status']=='rejected' and noop['code']=='ORDER_NO_STATE_CHANGE',noop

# Complete after pickup.
done=transition(C3,2,'completed','completed')
assert done['status']=='committed',done
assert done['lifecycle']=='completed' and done['fulfillment_status']=='completed'
assert int(done['new_version'])==3

print('V7 order lifecycle regression: PASS')
