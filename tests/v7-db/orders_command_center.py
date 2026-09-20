import json,os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T,A,P,L,OUNBOUND,OREC,OSHIP,SOUT,BREC,BSHIP,CREC,CSHIP=[str(uuid.uuid4()) for _ in range(12)]
def run(sql):
  r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
  if r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  return r
def val(r):
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET'];return xs[-1] if xs else ''
def j(sql):return json.loads(val(run(sql)))
run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle) values('{T}','{A}','admin','active');
insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,lifecycle) values('{T}','{P}','CC-P','Command Center Product','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle) values('{T}','{L}','CC-A','rack','active');
insert into warehouse_v7.order_record(tenant_id,id,order_kind,source_identity_key,purchase_order_number,product_label,quantity,unit,lifecycle,fulfillment_status,version) values
 ('{T}','{OUNBOUND}','STANDARD','cc:unbound','PO-CC-UNBOUND','Command Center Product',1,'BOX','in_progress','pending',1),
 ('{T}','{OREC}','STANDARD','cc:receive','PO-CC-RECEIVE','Command Center Product',2,'BOX','in_progress','pending',1),
 ('{T}','{OSHIP}','STANDARD','cc:ship','PO-CC-SHIP','Command Center Product',3,'BOX','in_progress','pending',1);
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id)
values('{T}','{SOUT}','{P}','{L}',3,'BOX',1,'active','CC-STOCK');
set request.jwt.claim.sub='{A}';
select warehouse_v7.bind_order_execution('{T}','{BREC}','{OREC}',1,'INBOUND','{P}','{L}',null,2,'BOX','{{}}','{A}','TEST');
select warehouse_v7.bind_order_execution('{T}','{BSHIP}','{OSHIP}',1,'OUTBOUND','{P}','{L}','{SOUT}',3,'BOX','{{}}','{A}','TEST');
""")
center=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_orders_command_center('{T}')::text;")
s=center['summary'];assert s['needs_binding']==1 and s['ready_receive']==1 and s['ready_ship']==1 and s['completed']==0,s
assert s['attention_total']==s['exceptions']+3,s
lanes=center['lanes']
assert lanes['needs_binding'][0]['display_id']=='PO-CC-UNBOUND',lanes
assert lanes['ready_receive'][0]['display_id']=='PO-CC-RECEIVE',lanes
assert lanes['ready_ship'][0]['display_id']=='PO-CC-SHIP',lanes
assert center['read_only'] is True,center
before=val(run(f"select count(*) from warehouse_v7.command where tenant_id='{T}';"))
again=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_orders_command_center('{T}')::text;")
after=val(run(f"select count(*) from warehouse_v7.command where tenant_id='{T}';"))
assert before==after and again['summary']==center['summary'],(before,after)
print('V7 orders command center regression: PASS')
