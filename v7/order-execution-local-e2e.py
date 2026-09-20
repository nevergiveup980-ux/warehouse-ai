#!/usr/bin/env python3
import argparse,json,os,subprocess,uuid,urllib.request,urllib.error
from pathlib import Path

DB=os.environ.get("PGDATABASE","")
D=(f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
E=os.environ.copy();E.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("88405b94-8491-4a4e-8cd4-9681ea3c810d")

def run(sql):
  r=subprocess.run(["psql",D,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=E)
  if r.returncode!=0: raise RuntimeError(r.stderr or r.stdout)
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
  return xs[-1] if xs else ""
def req(base,path,method="GET",body=None):
  data=None if body is None else json.dumps(body).encode()
  r=urllib.request.Request(base.rstrip("/")+path,data=data,method=method)
  if data is not None:r.add_header("Content-Type","application/json")
  try:
    with urllib.request.urlopen(r,timeout=5) as x:return x.status,json.loads(x.read().decode())
  except urllib.error.HTTPError as x:
    raw=x.read().decode();return x.code,json.loads(raw) if raw else {}

def main():
  ap=argparse.ArgumentParser();ap.add_argument("--base-url",default="http://127.0.0.1:8787");ap.add_argument("--tenant",required=True);ap.add_argument("--report",required=True);a=ap.parse_args()
  if DB!="warehouse_v7_test":raise RuntimeError("ORDER_EXECUTION_HTTP_E2E_REFUSES_DATABASE")
  html=urllib.request.urlopen(a.base_url+"/order-execution-workbench.html",timeout=5).read().decode()
  if "Order Execution Workbench" not in html or "order-execution-local-api-client.js" not in html:raise RuntimeError("EXECUTION_WORKBENCH_HTML_MISSING")
  code,env=req(a.base_url,"/api/order-execution?action=list&status=open")
  tasks=(env.get("data") or {}).get("tasks") or []
  lab=[x for x in tasks if str(x.get("purchase_order_number") or "").startswith("PO-LAB-")]
  if code!=200 or len(lab)!=2:raise RuntimeError("EXPECTED_TWO_LOCAL_EXECUTION_TASKS")
  inbound=next(x for x in lab if x["flow"]=="INBOUND");outbound=next(x for x in lab if x["flow"]=="OUTBOUND")

  def detail(order):
    c,e=req(a.base_url,"/api/order-execution?action=get&order_id="+order)
    if c!=200:raise RuntimeError("EXECUTION_GET_FAILED")
    return e["data"]

  din=detail(inbound["order_id"]);dout=detail(outbound["order_id"])
  if din.get("stock_item_id") is not None or int(din.get("stock_version") or 0)!=0:raise RuntimeError("INBOUND_SHOULD_START_WITHOUT_STOCK")
  new_stock=str(uuid.uuid5(NS,"inbound-stock:"+din["order_id"]))
  cin=str(uuid.uuid5(NS,"inbound-command:"+din["order_id"]))
  pin={"action":"execute","order_id":din["order_id"],"command_id":cin,"stock_item_id":new_stock,"expected_order_version":din["order_version"],"expected_stock_version":0,"quantity":din["remaining_quantity"]}
  c1,r1=req(a.base_url,"/api/order-execution","POST",pin);c2,r2=req(a.base_url,"/api/order-execution","POST",pin)
  if c1!=200 or c2!=200 or r1.get("data")!=r2.get("data"):raise RuntimeError("INBOUND_EXECUTION_IDEMPOTENCY_FAILED")

  dout=detail(outbound["order_id"])
  cout=str(uuid.uuid5(NS,"outbound-command:"+dout["order_id"]))
  pout={"action":"execute","order_id":dout["order_id"],"command_id":cout,"stock_item_id":dout["stock_item_id"],"expected_order_version":dout["order_version"],"expected_stock_version":dout["stock_version"],"quantity":dout["remaining_quantity"]}
  s1,x1=req(a.base_url,"/api/order-execution","POST",pout);s2,x2=req(a.base_url,"/api/order-execution","POST",pout)
  if s1!=200 or s2!=200 or x1.get("data")!=x2.get("data"):raise RuntimeError("OUTBOUND_EXECUTION_IDEMPOTENCY_FAILED")

  din2=detail(din["order_id"]);dout2=detail(dout["order_id"])
  checks={
    "inbound_completed":din2.get("task_status")=="completed" and float(din2.get("remaining_quantity"))==0,
    "outbound_completed":dout2.get("task_status")=="completed" and float(dout2.get("remaining_quantity"))==0,
    "inbound_stock_created":din2.get("stock_item_id")==new_stock and float(din2.get("stock_quantity"))==5,
    "outbound_stock_consumed":float(dout2.get("stock_quantity"))==0 and dout2.get("stock_lifecycle")=="consumed",
    "orders_not_silently_transitioned":din2.get("order_lifecycle")=="in_progress" and dout2.get("order_lifecycle")=="in_progress",
    "one_action_each":len(din2.get("actions") or [])==1 and len(dout2.get("actions") or [])==1,
  }
  movement_count=int(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{a.tenant}'::uuid and command_id in ('{cin}'::uuid,'{cout}'::uuid);"))
  checks["two_inventory_movements"]=movement_count==2
  stops=[k for k,v in checks.items() if not v]
  report={"mode":"V7_ORDER_EXECUTION_LOCAL_HTTP_E2E","production_writes":0,"database":"warehouse_v7_test","transport":"localhost_http","validation":checks,"stop_reasons":stops,"verdict":"HTTP_E2E_PASS" if not stops else "STOP"}
  Path(a.report).write_text(json.dumps(report,indent=2)+"\n");print(json.dumps(report,indent=2))
  if stops:raise SystemExit(1)
  print("V7 ORDER EXECUTION LOCAL HTTP E2E: PASS")
if __name__=="__main__":main()
