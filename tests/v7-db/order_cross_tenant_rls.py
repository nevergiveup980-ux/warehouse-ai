import os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T1,T2,U1,U2,O1,O2=[str(uuid.uuid4()) for _ in range(6)]

bootstrap=f"""
create role v7_order_app nologin;
grant usage on schema warehouse_v7 to v7_order_app;
grant select,insert,update on warehouse_v7.order_record to v7_order_app;
grant select on warehouse_v7.tenant_member to v7_order_app;

insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
values
 ('{T1}','{U1}','operator','active'),
 ('{T2}','{U2}','operator','active');

insert into warehouse_v7.order_record(
 tenant_id,id,order_kind,source_identity_key,customer_label,
 lifecycle,fulfillment_status,version
) values
 ('{T1}','{O1}','STANDARD','rls:a','Tenant A','draft','unverified',1),
 ('{T2}','{O2}','STANDARD','rls:b','Tenant B','draft','unverified',1);
"""
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',bootstrap],env=E)

def q(user,sql):
    s=f"set role v7_order_app; set request.jwt.claim.sub='{user}'; {sql}"
    out=subprocess.check_output(['psql',D,'-Atc',s],text=True,env=E)
    return out.strip().splitlines()[-1]

assert q(U1,"select count(*) from warehouse_v7.order_record;")=='1'
assert q(U2,"select count(*) from warehouse_v7.order_record;")=='1'
assert q(U1,f"select count(*) from warehouse_v7.order_record where tenant_id='{T2}';")=='0'
assert q(U2,f"select count(*) from warehouse_v7.order_record where tenant_id='{T1}';")=='0'

# Cross-tenant update cannot see or mutate the target row.
assert q(U1,f"with u as (update warehouse_v7.order_record set customer_label='blocked' where tenant_id='{T2}' and id='{O2}' returning 1) select count(*) from u;")=='0'
check=subprocess.check_output(['psql',D,'-Atc',f"select customer_label from warehouse_v7.order_record where tenant_id='{T2}' and id='{O2}';"],text=True,env=E).strip()
assert check=='Tenant B',check

# Cross-tenant insert is rejected by WITH CHECK.
sql=f"""set role v7_order_app; set request.jwt.claim.sub='{U1}';
insert into warehouse_v7.order_record(
 tenant_id,id,order_kind,source_identity_key,customer_label,lifecycle,fulfillment_status,version
) values(
 '{T2}','{uuid.uuid4()}','STANDARD','rls:attack','Attack','draft','unverified',1
);"""
r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-c',sql],text=True,capture_output=True,env=E)
assert r.returncode!=0,(r.stdout,r.stderr)
assert 'row-level security' in (r.stderr+r.stdout).lower(),(r.stdout,r.stderr)

print('V7 order cross-tenant RLS attack: PASS')
