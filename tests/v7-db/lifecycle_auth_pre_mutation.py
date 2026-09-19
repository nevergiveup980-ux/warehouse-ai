import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T1,T2,U1,U2,P,L,S=[str(uuid.uuid4()) for _ in range(7)]
C1,C2=str(uuid.uuid4()),str(uuid.uuid4())
setup=f"""insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values
('{T1}','{U1}','operator'),('{T1}','{U2}','operator');
insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T1}','{P}','Auth Guard Product','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,lifecycle) values('{T1}','{L}','AUTH-A1','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle)
values('{T1}','{S}','{P}','{L}',10,'BOX',1,'active');"""
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',setup],env=E)
def run(q): return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q],text=True,capture_output=True,env=E)
r=run(f"set request.jwt.claim.sub='{U1}'; select warehouse_v7.ship_stock('{T1}','{C1}','{S}',1,2,'{{}}','{U2}','DEV');")
assert r.returncode!=0 and 'ACTOR_IDENTITY_MISMATCH' in r.stderr,r.stderr
r=run(f"set request.jwt.claim.sub='{U1}'; select warehouse_v7.ship_stock('{T2}','{C2}','{S}',1,2,'{{}}','{U1}','DEV');")
assert r.returncode!=0 and 'AUTH_SCOPE_DENIED' in r.stderr,r.stderr
state=run(f"select quantity||'|'||version||'|'||lifecycle from warehouse_v7.stock_item where tenant_id='{T1}' and id='{S}';")
assert state.stdout.strip()=='10.000000|1|active',state.stdout
n=run(f"""select
 (select count(*) from warehouse_v7.command where id in ('{C1}','{C2}'))||'|'||
 (select count(*) from warehouse_v7.inventory_movement where command_id in ('{C1}','{C2}'))||'|'||
 (select count(*) from warehouse_v7.event where command_id in ('{C1}','{C2}'));""")
assert n.stdout.strip()=='0|0|0',n.stdout
print('V7 lifecycle auth pre-mutation attack: PASS')
