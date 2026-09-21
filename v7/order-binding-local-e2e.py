#!/usr/bin/env python3
import argparse,json,os,subprocess,uuid,urllib.request,urllib.error
from pathlib import Path
DB=os.environ.get("PGDATABASE","")
D=(f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
E=os.environ.copy();E.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("53a12b1f-73ea-449e-9c6c-f100ab70ed2d")
def run(sql):
  r=subprocess.run(["psql",D,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=E)
  if r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  return r.stdout.strip().splitlines()[-1]
def req(base,path,method="GET",body=None):
  data=None if body is None else json.dumps(body).encode();r=urllib.request.Request(base.rstrip("/")+path,data=data,method=method)
  if data is not None:r.add_header("Content-Type","application/json")
  try:
    with urllib.request.urlopen(r,timeout=5) as x:return x.status,json.loads(x.read().decode())
  except urllib.error.HTTPError as x:
    raw=x.read().decode();return x.code,json.loads(raw) if raw else {}
def main():
  ap=argparse.ArgumentParser();ap.add_argument("--base-url",default="http://127.0.0.1:8787");ap.add_argument("--tenant",required=True);ap.add_argument("--report",required=True);a=ap.parse_args()
  if DB!="warehouse_v7_test":raise RuntimeError("ORDER_BINDING_HTTP_E2E_REFUSES_DATABASE")
  html=urllib.request.urlopen(a.base_url+"/order-binding-workbench.html",timeout=5).read().decode()
  if "Order Binding Workbench" not in html or "order-binding-local-api-client.js" not in html:raise RuntimeError("BINDING_WORKBENCH_HTML_MISSING")
  code,env=req(a.base_url,"/api/order-binding?action=list&status=unbound");orders=(env.get("data") or {}).get("orders") or []
  lab=[x for x in orders if x.get("purchase_order_number")=="PO-LAB-BIND"]
  if code!=200 or len(lab)!=1:raise RuntimeError("BINDING_FIXTURE_NOT_VISIBLE")
  order=lab[0];code,d=req(a.base_url,"/api/order-binding?action=get&order_id="+order["order_id"]);detail=d.get("data") or {}
  if code!=200 or detail.get("can_bind") is not True:raise RuntimeError("BINDING_DETAIL_UNAVAILABLE")
  if detail.get("source_product_label")=="Binding Lab Canonical Product":raise RuntimeError("FIXTURE_FAILED_TO_PROVE_NO_LABEL_MATCH")
  product=next(x for x in detail["products"] if x["name"]=="Binding Lab Canonical Product")
  location=next(x for x in detail["locations"] if x["code"]=="LAB-BIND-A")
  stock=next(x for x in detail["stock_items"] if x["product_id"]==product["product_id"] and x["location_id"]==location["location_id"])
  command=str(uuid.uuid5(NS,"binding:"+order["order_id"]))
  payload={"action":"bind","order_id":order["order_id"],"command_id":command,"expected_order_version":order["order_version"],"flow":"OUTBOUND","product_id":product["product_id"],"location_id":location["location_id"],"stock_item_id":stock["stock_item_id"],"expected_quantity":order["source_quantity"],"unit":order["source_unit"]}
  c1,r1=req(a.base_url,"/api/order-binding","POST",payload);c2,r2=req(a.base_url,"/api/order-binding","POST",payload)
  if c1!=200 or c2!=200 or r1.get("data")!=r2.get("data"):raise RuntimeError("BINDING_IDEMPOTENCY_FAILED")
  _,after=req(a.base_url,"/api/order-binding?action=get&order_id="+order["order_id"]);bound=after["data"]
  _,exec_env=req(a.base_url,"/api/order-execution?action=list&status=open");task=next((x for x in exec_env["data"]["tasks"] if x["order_id"]==order["order_id"]),None)
  checks={
    "explicit_product_uuid":bound.get("product_id")==product["product_id"],
    "explicit_location_uuid":bound.get("location_id")==location["location_id"],
    "explicit_stock_uuid":bound.get("stock_item_id")==stock["stock_item_id"],
    "source_label_not_identity":bound.get("source_product_label")!="Binding Lab Canonical Product",
    "binding_is_outbound":bound.get("flow")=="OUTBOUND",
    "execution_task_created":task is not None and task.get("next_action")=="SHIP_ORDER",
    "binding_did_not_move_inventory":int(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{a.tenant}'::uuid and command_id='{command}'::uuid;"))==0,
  }
  stops=[k for k,v in checks.items() if not v]
  report={"mode":"V7_ORDER_BINDING_LOCAL_HTTP_E2E","production_writes":0,"database":"warehouse_v7_test","transport":"localhost_http","validation":checks,"stop_reasons":stops,"verdict":"HTTP_E2E_PASS" if not stops else "STOP"}
  Path(a.report).write_text(json.dumps(report,indent=2)+"\n");print(json.dumps(report,indent=2))
  if stops:raise SystemExit(1)
  print("V7 ORDER BINDING LOCAL HTTP E2E: PASS")
if __name__=="__main__":main()
