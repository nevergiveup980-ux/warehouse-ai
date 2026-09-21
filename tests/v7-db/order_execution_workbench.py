import json,os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy();E['PGPASSWORD']='postgres'
T,A,V,P,L,O,S,B,C=[str(uuid.uuid4()) for _ in range(9)]
def run(sql,ok=True):
  r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
  if ok and r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  return r
def val(r):
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET'];return xs[-1] if xs else ''
def j(sql):return json.loads(val(run(sql)))
run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle) values('{T}','{A}','operator','active'),('{T}','{V}','viewer','active');
insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,lifecycle) values('{T}','{P}','WB-P','Workbench Product','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle) values('{T}','{L}','WB-A','rack','active');
insert into warehouse_v7.order_record(tenant_id,id,order_kind,source_identity_key,purchase_order_number,product_label,quantity,unit,lifecycle,fulfillment_status,version)
values('{T}','{O}','STANDARD','wb:test','PO-WB','Workbench Product',2,'BOX','in_progress','pending',1);
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id)
values('{T}','{S}','{P}','{L}',2,'BOX',1,'active','WB-S');
set request.jwt.claim.sub='{A}';
select warehouse_v7.bind_order_execution('{T}','{B}','{O}',1,'OUTBOUND','{P}','{L}','{S}',2,'BOX','{{}}','{A}','TEST');
""")
listed=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_order_execution_workbench('{T}','open')::text;")
assert listed['summary']['open']==1 and listed['summary']['outbound_open']==1,listed
task=listed['tasks'][0];assert task['stock_version']==1 and float(task['stock_quantity'])==2,task
detail=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_order_execution_workbench_task('{T}','{O}')::text;")
assert detail['can_execute'] is True and detail['next_action']=='SHIP_ORDER',detail
viewer=j(f"set request.jwt.claim.sub='{V}';select warehouse_v7.get_order_execution_workbench_task('{T}','{O}')::text;")
assert viewer['can_execute'] is False,viewer
denied=run(f"set request.jwt.claim.sub='{V}';select warehouse_v7.ship_bound_order_stock('{T}','{C}','{O}',1,1,1,'{{}}','{V}','TEST')::text;",ok=False)
assert denied.returncode!=0 and 'ROLE_WRITE_DENIED' in (denied.stdout+denied.stderr),(denied.stdout,denied.stderr)
print('V7 order execution workbench regression: PASS')
