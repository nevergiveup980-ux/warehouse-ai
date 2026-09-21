import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,O,AD,OP,V=[str(uuid.uuid4()) for _ in range(5)]
setup=f"""insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values
('{T}','{O}','owner'),('{T}','{AD}','admin'),('{T}','{OP}','operator'),('{T}','{V}','viewer');"""
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',setup],env=E)
def call(u):
 return subprocess.run(['psql',D,'-Atc',f"set request.jwt.claim.sub='{u}'; select warehouse_v7.assert_admin_identity('{T}','{u}');"],text=True,capture_output=True,env=E)
assert call(O).returncode==0
assert call(AD).returncode==0
r=call(OP); assert r.returncode!=0 and 'ADMIN_ROLE_REQUIRED' in r.stderr,r.stderr
r=call(V); assert r.returncode!=0 and 'ADMIN_ROLE_REQUIRED' in r.stderr,r.stderr
print('V7 admin role boundary attack: PASS')
