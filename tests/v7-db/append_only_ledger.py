import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy();E['PGPASSWORD']='postgres'
def p(sql,ok=True):
 r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
 if ok: assert r.returncode==0,(r.stdout,r.stderr)
 else: assert r.returncode!=0 and 'V7_LEDGER_APPEND_ONLY' in r.stderr,(r.stdout,r.stderr)
 return r.stdout.strip()
T,P,L,S,A,C=[str(uuid.uuid4()) for _ in range(6)]
p(f"""insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T}','{P}','Ledger Guard','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,lifecycle) values('{T}','{L}','LG1','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle) values('{T}','{S}','{P}','{L}',5,'BOX',1,'active');
select warehouse_v7.begin_command('{T}','{C}','TEST','stock_item','{S}',1,'{{}}','{A}','DEV');
insert into warehouse_v7.inventory_movement(tenant_id,command_id,product_id,stock_item_id,movement_type,quantity,unit) values('{T}','{C}','{P}','{S}','TEST',1,'BOX');
insert into warehouse_v7.event(tenant_id,command_id,entity_type,entity_id,event_type,entity_version) values('{T}','{C}','stock_item','{S}','TEST',1);""")
p(f"update warehouse_v7.inventory_movement set quantity=2 where tenant_id='{T}' and command_id='{C}';",False)
p(f"delete from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C}';",False)
p(f"update warehouse_v7.event set payload='{{\"x\":1}}' where tenant_id='{T}' and command_id='{C}';",False)
p(f"delete from warehouse_v7.event where tenant_id='{T}' and command_id='{C}';",False)
assert p(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{C}';")=='1'
assert p(f"select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{C}';")=='1'
print('V7 append-only ledger attack: PASS')
