import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,P,L,S,R,C1,C2=[str(uuid.uuid4()) for _ in range(7)]
setup=f"""insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T}','{P}','Movement Guard','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,lifecycle) values('{T}','{L}','MG','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle) values('{T}','{S}','{P}','{L}',10,'BOX',1,'active');
insert into warehouse_v7.carpet_roll(tenant_id,id,roll_number,product_id,location_id,original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle) values('{T}','{R}','MG-RC','{P}','{L}',1600,1600,'FULL',1,'active');
insert into warehouse_v7.command(tenant_id,id,command_type,entity_type,entity_id,payload,payload_fingerprint,status) values
('{T}','{C1}','TEST','stock_item','{S}','{{}}','a','committed'),
('{T}','{C2}','TEST','carpet_roll','{R}','{{}}','b','committed');"""
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',setup],env=E)
def run(q): return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q],text=True,capture_output=True,env=E)
r=run(f"insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,movement_type,quantity,unit) values('{T}','{C1}','{P}','{S}','TEST_MOVE',1,'BOX');"); assert r.returncode==0,r.stderr
r=run(f"insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,movement_type,quantity,unit) values('{T}','{C1}','{P}','{S}','TEST_MOVE',1,'BOX');"); assert r.returncode!=0 and 'duplicate key' in r.stderr.lower(),r.stderr
r=run(f"insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,carpet_roll_id,movement_type,quantity,unit) values('{T}','{C2}','{P}','{R}','TEST_CUT',100,'1/16_IN');"); assert r.returncode==0,r.stderr
r=run(f"insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,carpet_roll_id,movement_type,quantity,unit) values('{T}','{C2}','{P}','{R}','TEST_CUT',100,'1/16_IN');"); assert r.returncode!=0 and 'duplicate key' in r.stderr.lower(),r.stderr
r=run(f"insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,carpet_roll_id,movement_type,quantity,unit) values('{T}','{C2}','{P}','{S}','{R}','BAD_BOTH',1,'BOX');"); assert r.returncode!=0 and 'check constraint' in r.stderr.lower(),r.stderr
print('V7 movement causal uniqueness attack: PASS')
