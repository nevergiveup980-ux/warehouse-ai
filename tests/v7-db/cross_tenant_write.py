import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy();E['PGPASSWORD']='postgres'
T1,T2,U1,U2,P1,P2=[str(uuid.uuid4()) for _ in range(6)]
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',f"""create role v7_writer nologin; grant usage on schema warehouse_v7 to v7_writer; grant select,insert,update,delete on warehouse_v7.product to v7_writer;
insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T1}','{U1}','admin'),('{T2}','{U2}','admin');
insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T1}','{P1}','A','BOX','active'),('{T2}','{P2}','B','BOX','active');"""],env=E)
def run(user,sql):
 return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',f"set role v7_writer; set request.jwt.claim.sub='{user}'; {sql}"],text=True,capture_output=True,env=E)
# own-tenant write succeeds
r=run(U1,f"update warehouse_v7.product set name='A2' where tenant_id='{T1}' and id='{P1}';"); assert r.returncode==0,r.stderr
# cross-tenant update/delete touch zero rows
r=run(U1,f"update warehouse_v7.product set name='HACK' where tenant_id='{T2}' and id='{P2}' returning id;"); assert r.returncode==0 and P2 not in r.stdout,(r.stdout,r.stderr)
r=run(U1,f"delete from warehouse_v7.product where tenant_id='{T2}' and id='{P2}' returning id;"); assert r.returncode==0 and P2 not in r.stdout,(r.stdout,r.stderr)
# cross-tenant insert is denied
PX=str(uuid.uuid4()); r=run(U1,f"insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T2}','{PX}','HACK','BOX','active');"); assert r.returncode!=0,(r.stdout,r.stderr)
# verify tenant B row unchanged
name=subprocess.check_output(['psql',D,'-Atc',f"select name from warehouse_v7.product where tenant_id='{T2}' and id='{P2}';"],text=True,env=E).strip(); assert name=='B',name
# operator cannot mutate Product Master even inside own tenant
OP=str(uuid.uuid4())
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',f"insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T1}','{OP}','operator');"],env=E)
r=run(OP,f"update warehouse_v7.product set name='OP-HACK' where tenant_id='{T1}' and id='{P1}';")
assert r.returncode==0 and 'UPDATE 0' in r.stdout,(r.stdout,r.stderr)
name=subprocess.check_output(['psql',D,'-Atc',f"select name from warehouse_v7.product where tenant_id='{T1}' and id='{P1}';"],text=True,env=E).strip(); assert name=='A2',name
print('V7 cross-tenant + role-aware WRITE attack: PASS')
