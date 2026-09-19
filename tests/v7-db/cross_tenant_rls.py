import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy();E['PGPASSWORD']='postgres'
T1,T2,U1,U2,P1,P2=[str(uuid.uuid4()) for _ in range(6)]
sql=f"""create role v7_app nologin; grant usage on schema warehouse_v7 to v7_app; grant select on all tables in schema warehouse_v7 to v7_app;
insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T1}','{U1}','operator'),('{T2}','{U2}','operator');
insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T1}','{P1}','Tenant A Product','BOX','active'),('{T2}','{P2}','Tenant B Product','BOX','active');"""
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',sql],env=E)
def q(user,sql):
 s=f"set role v7_app; set request.jwt.claim.sub='{user}'; {sql}"
 return subprocess.check_output(['psql',D,'-Atc',s],text=True,env=E).strip().splitlines()[-1]
assert q(U1,"select count(*) from warehouse_v7.product;")=='1'
assert q(U2,"select count(*) from warehouse_v7.product;")=='1'
assert q(U1,f"select count(*) from warehouse_v7.product where tenant_id='{T2}';")=='0'
assert q(U2,f"select count(*) from warehouse_v7.product where tenant_id='{T1}';")=='0'
outsider=str(uuid.uuid4())
assert q(outsider,"select count(*) from warehouse_v7.product;")=='0'
assert q(U1,"select count(*) from warehouse_v7.tenant_member;")=='1'
print('V7 cross-tenant SELECT attack: PASS')
