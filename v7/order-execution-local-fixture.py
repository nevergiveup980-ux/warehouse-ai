#!/usr/bin/env python3
"""Seed two explicit disposable execution tasks. Never used outside warehouse_v7_test."""
import os,subprocess,uuid,json

DB=os.environ.get("PGDATABASE","")
if DB!="warehouse_v7_test": raise RuntimeError("ORDER_EXECUTION_FIXTURE_REFUSES_DATABASE")
D=(f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
E=os.environ.copy();E.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
T=os.environ.get("RUNLU_V7_TENANT","45454545-4545-4454-8454-454545454545")
A=os.environ.get("RUNLU_V7_ACTOR","56565656-5656-4565-8565-565656565656")
P="71717171-7171-4717-8717-717171717171"
L="72727272-7272-4727-8727-727272727272"
OIN="73737373-7373-4737-8737-737373737373"
OOUT="74747474-7474-4747-8747-747474747474"
SOUT="75757575-7575-4757-8757-757575757575"
B1="76767676-7676-4767-8767-767676767676"
B2="77777777-7777-4777-8777-777777777777"

def run(sql):
  r=subprocess.run(["psql",D,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=E)
  if r.returncode!=0: raise RuntimeError(r.stderr or r.stdout)
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
  return xs[-1] if xs else ""

run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
values('{T}','{A}','admin','active')
on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';

insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle)
values('{T}','{P}','LOCAL-EXECUTION-LAB-PRODUCT','Execution Lab Product','BOX','BOX','active');

insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
values('{T}','{L}','LAB-EXEC-A','rack','active');

insert into warehouse_v7.order_record(
 tenant_id,id,order_kind,source_identity_key,purchase_order_number,customer_label,product_label,
 source_location,quantity,unit,lifecycle,fulfillment_status,version
) values
 ('{T}','{OIN}','STANDARD','local-exec:in','PO-LAB-IN','Engineering Inbound','Execution Lab Product','LAB-EXEC-A',5,'BOX','in_progress','pending',1),
 ('{T}','{OOUT}','STANDARD','local-exec:out','PO-LAB-OUT','Engineering Outbound','Execution Lab Product','LAB-EXEC-A',4,'BOX','in_progress','pending',1);

insert into warehouse_v7.stock_item(
 tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id
) values('{T}','{SOUT}','{P}','{L}',4,'BOX',1,'active','LOCAL-EXECUTION-LAB-OUT-STOCK');
""")

def bind(cmd,order,flow,stock,qty):
  stock_sql="null" if stock is None else f"'{stock}'::uuid"
  return json.loads(run(f"""
    set request.jwt.claim.sub='{A}';
    select warehouse_v7.bind_order_execution(
      '{T}','{cmd}','{order}',1,'{flow}','{P}','{L}',{stock_sql},{qty},'BOX',
      '{{"fixture":"disposable-local-ui"}}'::jsonb,'{A}','LOCAL_EXECUTION_FIXTURE'
    )::text;
  """))
assert bind(B1,OIN,"INBOUND",None,5)["status"]=="committed"
assert bind(B2,OOUT,"OUTBOUND",SOUT,4)["status"]=="committed"
print(json.dumps({"tenant":T,"actor":A,"inbound_order":OIN,"outbound_order":OOUT,"outbound_stock":SOUT}))
print("V7 ORDER EXECUTION DISPOSABLE FIXTURE: PASS")
