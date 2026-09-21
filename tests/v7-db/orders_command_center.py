import json,os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T,A,P,L,OUNBOUND,OREC,OSHIP,SOUT,BREC,BSHIP,CSHIP=[str(uuid.uuid4()) for _ in range(11)]
def run(sql,ok=True):
  r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
  if ok and r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  return r
def val(r):
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET'];return xs[-1] if xs else ''
def j(sql):return json.loads(val(run(sql)))
run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle) values('{T}','{A}','admin','active');
insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,lifecycle) values('{T}','{P}','CC-P','Command Center Product','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle) values('{T}','{L}','CC-A','rack','active');
insert into warehouse_v7.order_record(tenant_id,id,order_kind,source_identity_key,purchase_order_number,product_label,quantity,unit,lifecycle,fulfillment_status,version,created_at,updated_at) values
 ('{T}','{OUNBOUND}','STANDARD','cc:unbound','PO-CC-UNBOUND','Command Center Product',1,'BOX','in_progress','pending',1,now()-interval '96 hours',now()-interval '96 hours'),
 ('{T}','{OREC}','STANDARD','cc:receive','PO-CC-RECEIVE','Command Center Product',2,'BOX','in_progress','pending',1,now(),now()),
 ('{T}','{OSHIP}','STANDARD','cc:ship','PO-CC-SHIP','Command Center Product',3,'BOX','in_progress','pending',1,now(),now());
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id)
values('{T}','{SOUT}','{P}','{L}',3,'BOX',1,'active','CC-STOCK');
set request.jwt.claim.sub='{A}';
select warehouse_v7.bind_order_execution('{T}','{BREC}','{OREC}',1,'INBOUND','{P}','{L}',null,2,'BOX','{{}}','{A}','TEST');
select warehouse_v7.bind_order_execution('{T}','{BSHIP}','{OSHIP}',1,'OUTBOUND','{P}','{L}','{SOUT}',3,'BOX','{{}}','{A}','TEST');
""")
center=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_orders_command_center('{T}')::text;")
s=center['summary'];p=center['priority'];a=center['aging']
assert s['attention_total']==3 and s['needs_binding']==1 and s['ready_receive']==1 and s['ready_ship']==1,s
assert p['p1']==1 and p['p2']==1 and p['p3']==1,p
assert a['aged_24h']==1 and a['aged_72h']==1,a
all_today=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_orders_today_work('{T}',null,null,null,50)::text;")
p1=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_orders_today_work('{T}','P1',null,null,50)::text;")
receive=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_orders_today_work('{T}',null,'RECEIVE',null,50)::text;")
ship=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_orders_today_work('{T}',null,'SHIP',null,50)::text;")
aged=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_orders_today_work('{T}',null,null,24,50)::text;")
assert all_today['matching_count']==3,all_today
assert p1['matching_count']==1 and p1['items'][0]['display_id']=='PO-CC-UNBOUND',p1
assert receive['matching_count']==1 and receive['items'][0]['display_id']=='PO-CC-RECEIVE',receive
assert ship['matching_count']==1 and ship['items'][0]['display_id']=='PO-CC-SHIP',ship
assert aged['matching_count']==1 and aged['items'][0]['age_hours']>=95,aged
bad=run(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_orders_today_work('{T}','P9',null,null,50)::text;",ok=False)
assert bad.returncode!=0 and 'INVALID_TODAY_PRIORITY_FILTER' in (bad.stdout+bad.stderr),(bad.stdout,bad.stderr)
before_commands=val(run(f"select count(*) from warehouse_v7.command where tenant_id='{T}';"))
before_moves=val(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}';"))
_ = j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_orders_today_work('{T}',null,null,null,50)::text;")
after_commands=val(run(f"select count(*) from warehouse_v7.command where tenant_id='{T}';"))
after_moves=val(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}';"))
assert before_commands==after_commands and before_moves==after_moves,(before_commands,after_commands,before_moves,after_moves)
ship_result=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.ship_bound_order_stock('{T}','{CSHIP}','{OSHIP}',1,1,3,'{{}}','{A}','TEST')::text;")
assert ship_result['status']=='committed',ship_result
recent=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_orders_completed_recent('{T}',24,12)::text;")
assert recent['matching_count']==1 and recent['window_semantics']=='rolling_hours_not_calendar_day',recent
assert recent['items'][0]['display_id']=='PO-CC-SHIP',recent
after=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_orders_command_center('{T}')::text;")
assert after['summary']['ready_ship']==0 and after['summary']['completed']==1,after['summary']
print('V7 orders command center filters + rolling 24h closeout regression: PASS')
