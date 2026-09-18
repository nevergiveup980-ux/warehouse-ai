import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,P,L,S,A,SHIP=[str(uuid.uuid4()) for _ in range(6)]
setup=f"""insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T}','{P}','Return Attack','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,lifecycle) values('{T}','{L}','R1','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle) values('{T}','{S}','{P}','{L}',0,'BOX',1,'consumed');
insert into warehouse_v7.command(tenant_id,id,command_type,entity_type,entity_id,expected_version,payload,payload_fingerprint,status,actor_id,device_id) values('{T}','{SHIP}','SHIP','stock_item','{S}',1,'{{}}','fixture','committed','{A}','FIXTURE');
insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,movement_type,quantity,unit,from_location_id) values('{T}','{SHIP}','{P}','{S}','SHIP',10,'BOX','{L}');"""
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',setup],env=E)
cmds=[str(uuid.uuid4()),str(uuid.uuid4())]
def q(c): return f"select warehouse_v7.return_stock('{T}','{c}','{S}',1,6,'BOX','{L}','{SHIP}','{{\"attack\":\"over-return\"}}','{A}','DEV');"
ps=[subprocess.Popen(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q(c)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=E) for c in cmds]
out=[p.communicate(timeout=20) for p in ps]
assert all(p.returncode==0 for p in ps),out
joined=' '.join(x[0] for x in out)
assert joined.count('"status": "committed"')==1,joined
assert joined.count('"code": "STALE_VERSION"')==1 or joined.count('"code": "RETURN_EXCEEDS_SHIPPED"')==1,joined
row=subprocess.check_output(['psql',D,'-Atc',f"select quantity||'|'||version from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}';"],text=True,env=E).strip()
assert row=='6.000000|2',row
ret=subprocess.check_output(['psql',D,'-Atc',f"select coalesce(sum(quantity),0)||'|'||count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and stock_item_id='{S}' and movement_type='RETURN';"],text=True,env=E).strip()
assert ret=='6.000000|1',ret
print('V7 concurrent over-return attack: PASS')
