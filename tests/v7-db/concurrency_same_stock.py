import os,subprocess,uuid
D="host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres"; e=os.environ.copy();e["PGPASSWORD"]="postgres"
T=str(uuid.uuid4());P=str(uuid.uuid4());L=str(uuid.uuid4());S=str(uuid.uuid4());A=str(uuid.uuid4())
setup=f"""insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T}','{P}','Attack Product','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,name,lifecycle) values('{T}','{L}','A1','Attack Rack','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle) values('{T}','{S}','{P}','{L}',10,'BOX',1,'active');"""
subprocess.check_call(["psql",D,"-v","ON_ERROR_STOP=1","-c",setup],env=e)
cmds=[str(uuid.uuid4()),str(uuid.uuid4())]
def q(c): return f"""select warehouse_v7.ship_stock('{T}','{c}','{S}',1,7,'{{"attack":"same-version"}}','{A}','DEV');"""
ps=[subprocess.Popen(["psql",D,"-v","ON_ERROR_STOP=1","-Atc",q(c)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=e) for c in cmds]
o=[p.communicate(timeout=20) for p in ps]
assert all(p.returncode==0 for p in ps),o
joined=" ".join(x[0] for x in o)
assert joined.count('"status": "committed"')==1,joined
assert joined.count('"code": "STALE_VERSION"')==1,joined
row=subprocess.check_output(["psql",D,"-Atc",f"select quantity||'|'||version from warehouse_v7.stock_item where tenant_id='{T}' and id='{S}';"],text=True,env=e).strip()
assert row=="3.000000|2",row
m=subprocess.check_output(["psql",D,"-Atc",f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and stock_item_id='{S}' and movement_type='SHIP';"],text=True,env=e).strip()
assert m=="1",m
print("V7 same-stock same-version concurrent SHIP attack: PASS")
