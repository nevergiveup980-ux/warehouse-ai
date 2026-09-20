#!/usr/bin/env python3
"""Seed one unbound order for the disposable binding UI. warehouse_v7_test only."""
import os,subprocess,json
DB=os.environ.get("PGDATABASE","")
if DB!="warehouse_v7_test":raise RuntimeError("ORDER_BINDING_FIXTURE_REFUSES_DATABASE")
D=(f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
E=os.environ.copy();E.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
T=os.environ.get("RUNLU_V7_TENANT","45454545-4545-4454-8454-454545454545")
A=os.environ.get("RUNLU_V7_ACTOR","56565656-5656-4565-8565-565656565656")
P="81818181-8181-4818-8818-818181818181";L="82828282-8282-4828-8828-828282828282";O="83838383-8383-4838-8838-838383838383";S="84848484-8484-4848-8848-848484848484"
def run(sql):
  r=subprocess.run(["psql",D,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=E)
  if r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  return r.stdout.strip()
run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle) values('{T}','{A}','admin','active')
on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle)
values('{T}','{P}','LOCAL-BINDING-LAB-PRODUCT','Binding Lab Canonical Product','BOX','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
values('{T}','{L}','LAB-BIND-A','rack','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id)
values('{T}','{S}','{P}','{L}',7,'BOX',1,'active','LOCAL-BINDING-LAB-STOCK');
insert into warehouse_v7.order_record(
 tenant_id,id,order_kind,source_identity_key,purchase_order_number,customer_label,product_label,source_location,quantity,unit,lifecycle,fulfillment_status,version
) values(
 '{T}','{O}','STANDARD','local-bind:out','PO-LAB-BIND','Engineering Binding','Legacy Text That Must Not Match','OLD-RACK-TEXT',3,'BOX','in_progress','pending',1
);
""")
print(json.dumps({"tenant":T,"actor":A,"order":O,"product":P,"location":L,"stock":S}))
print("V7 ORDER BINDING DISPOSABLE FIXTURE: PASS")
