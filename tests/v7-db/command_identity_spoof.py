import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T1,T2,U1,U2=[str(uuid.uuid4()) for _ in range(4)]
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',f"insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T1}','{U1}','operator'),('{T2}','{U2}','operator');"],env=E)
def call(jwt,t,a):
 s=f"set request.jwt.claim.sub='{jwt}'; select warehouse_v7.assert_command_identity('{t}','{a}');"
 return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',s],text=True,capture_output=True,env=E)
assert call(U1,T1,U1).returncode==0
r=call(U1,T1,U2);assert r.returncode!=0 and 'ACTOR_IDENTITY_MISMATCH' in r.stderr,r.stderr
r=call(U1,T2,U1);assert r.returncode!=0 and 'AUTH_SCOPE_DENIED' in r.stderr,r.stderr
r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',f"reset request.jwt.claim.sub; select warehouse_v7.assert_command_identity('{T1}','{U1}');"],text=True,capture_output=True,env=E);assert r.returncode!=0 and 'AUTH_REQUIRED' in r.stderr,r.stderr
print('V7 command identity spoof attack: PASS')
