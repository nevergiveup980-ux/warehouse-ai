import json,os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T,A,V,P,L,O,S,C=[str(uuid.uuid4()) for _ in range(8)]
def run(sql,ok=True):
  r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
  if ok and r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  return r
def val(r):
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET'];return xs[-1] if xs else ''
def j(sql):return json.loads(val(run(sql)))
run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle) values('{T}','{A}','operator','active'),('{T}','{V}','viewer','active');
insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,lifecycle) values('{T}','{P}','BIND-WB-P','Chosen Canonical Product','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle) values('{T}','{L}','BIND-WB-A','rack','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id) values('{T}','{S}','{P}','{L}',4,'BOX',1,'active','BIND-WB-S');
insert into warehouse_v7.order_record(tenant_id,id,order_kind,source_identity_key,purchase_order_number,product_label,source_location,quantity,unit,lifecycle,fulfillment_status,version)
values('{T}','{O}','STANDARD','bind-wb:test','PO-BIND-WB','Wrong Legacy Product Text','Wrong Legacy Location',4,'BOX','in_progress','pending',1);
""")
listed=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_order_binding_workbench('{T}','unbound')::text;")
assert listed['summary']['unbound']==1 and len(listed['orders'])==1,listed
detail=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_order_binding_workbench_order('{T}','{O}')::text;")
assert detail['can_bind'] is True and detail['source_product_label']=='Wrong Legacy Product Text',detail
assert detail['products'][0]['product_id']==P and detail['locations'][0]['location_id']==L,detail
viewer=j(f"set request.jwt.claim.sub='{V}';select warehouse_v7.get_order_binding_workbench_order('{T}','{O}')::text;")
assert viewer['can_bind'] is False,viewer
denied=run(f"set request.jwt.claim.sub='{V}';select warehouse_v7.bind_order_execution('{T}','{uuid.uuid4()}','{O}',1,'OUTBOUND','{P}','{L}','{S}',4,'BOX','{{}}','{V}','TEST')::text;",ok=False)
assert denied.returncode!=0 and 'ROLE_WRITE_DENIED' in (denied.stdout+denied.stderr),(denied.stdout,denied.stderr)
bound=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.bind_order_execution('{T}','{C}','{O}',1,'OUTBOUND','{P}','{L}','{S}',4,'BOX','{{"reviewed":true}}','{A}','TEST')::text;")
assert bound['status']=='committed',bound
after=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_order_binding_workbench_order('{T}','{O}')::text;")
assert after['binding_status']=='bound' and after['product_id']==P and after['location_id']==L and after['stock_item_id']==S,after
assert after['source_product_label']=='Wrong Legacy Product Text',after
movement=val(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C}';"))
assert movement=='0',movement
print('V7 order binding workbench regression: PASS')
