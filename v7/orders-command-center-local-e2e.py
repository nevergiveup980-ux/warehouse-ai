#!/usr/bin/env python3
import argparse,json,os,subprocess,urllib.request
from pathlib import Path

DB=os.environ.get("PGDATABASE","")
D=(f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
E=os.environ.copy();E.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))

def run(sql):
  r=subprocess.run(["psql",D,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=E)
  if r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
  return xs[-1] if xs else ""

def get_json(url):
  with urllib.request.urlopen(url,timeout=5) as r:return r.status,json.loads(r.read().decode())

def main():
  ap=argparse.ArgumentParser();ap.add_argument("--base-url",default="http://127.0.0.1:8787");ap.add_argument("--tenant",required=True);ap.add_argument("--report",required=True);a=ap.parse_args()
  if DB!="warehouse_v7_test":raise RuntimeError("ORDERS_COMMAND_CENTER_E2E_REFUSES_DATABASE")
  html=urllib.request.urlopen(a.base_url+"/orders-command-center.html",timeout=5).read().decode()
  if "Orders Command Center" not in html or "orders-command-center-local-api-client.js" not in html:raise RuntimeError("COMMAND_CENTER_HTML_MISSING")
  before_commands=int(run(f"select count(*) from warehouse_v7.command where tenant_id='{a.tenant}'::uuid;"))
  before_moves=int(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{a.tenant}'::uuid;"))
  code,env=get_json(a.base_url+"/api/orders-command-center");data=env.get("data") or {}
  after_commands=int(run(f"select count(*) from warehouse_v7.command where tenant_id='{a.tenant}'::uuid;"))
  after_moves=int(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{a.tenant}'::uuid;"))
  summary=data.get("summary") or {};lanes=data.get("lanes") or {}
  known_ship=any(x.get("display_id")=="PO-LAB-BIND" for x in lanes.get("ready_ship") or [])
  checks={
    "http_ok":code==200,
    "read_only_contract":data.get("read_only") is True,
    "attention_math":summary.get("attention_total")==sum(int(summary.get(k,0)) for k in ["exceptions","needs_binding","ready_receive","ready_ship"]),
    "known_bound_order_in_ship_lane":known_ship,
    "completed_execution_visible":int(summary.get("completed",0))>=2,
    "all_five_lanes_present":all(k in lanes for k in ["exceptions","needs_binding","ready_receive","ready_ship","completed"]),
    "get_created_no_commands":before_commands==after_commands,
    "get_created_no_movements":before_moves==after_moves,
  }
  stops=[k for k,v in checks.items() if not v]
  report={"mode":"V7_ORDERS_COMMAND_CENTER_LOCAL_HTTP_E2E","production_writes":0,"database":"warehouse_v7_test","validation":checks,"summary":summary,"stop_reasons":stops,"verdict":"HTTP_E2E_PASS" if not stops else "STOP"}
  Path(a.report).write_text(json.dumps(report,indent=2)+"\n");print(json.dumps(report,indent=2))
  if stops:raise SystemExit(1)
  print("V7 ORDERS COMMAND CENTER LOCAL HTTP E2E: PASS")
if __name__=="__main__":main()
