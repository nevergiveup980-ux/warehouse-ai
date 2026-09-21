#!/usr/bin/env python3
import argparse,json,os,subprocess,urllib.request,urllib.error
from pathlib import Path

DB=os.environ.get("PGDATABASE","")
D=(f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
E=os.environ.copy();E.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))

def run(sql):
  r=subprocess.run(["psql",D,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=E)
  if r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
  return xs[-1] if xs else ""

def request(url):
  try:
    with urllib.request.urlopen(url,timeout=5) as r:return r.status,json.loads(r.read().decode())
  except urllib.error.HTTPError as e:
    raw=e.read().decode();return e.code,json.loads(raw) if raw else {}

def main():
  ap=argparse.ArgumentParser();ap.add_argument("--base-url",default="http://127.0.0.1:8787");ap.add_argument("--tenant",required=True);ap.add_argument("--report",required=True);a=ap.parse_args()
  if DB!="warehouse_v7_test":raise RuntimeError("ORDERS_COMMAND_CENTER_E2E_REFUSES_DATABASE")
  html=urllib.request.urlopen(a.base_url+"/orders-command-center.html",timeout=5).read().decode()
  if "What should be handled first" not in html or 'data-filter="aged24"' not in html or "Completed · last 24h" not in html:raise RuntimeError("COMMAND_CENTER_FILTER_HTML_MISSING")
  before_commands=int(run(f"select count(*) from warehouse_v7.command where tenant_id='{a.tenant}'::uuid;"))
  before_moves=int(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{a.tenant}'::uuid;"))

  code,env=request(a.base_url+"/api/orders-command-center?action=overview");data=env.get("data") or {}
  code_all,all_env=request(a.base_url+"/api/orders-command-center?action=today&limit=50");all_today=all_env.get("data") or {}
  code_p1,p1_env=request(a.base_url+"/api/orders-command-center?action=today&priority=P1&limit=50");p1=p1_env.get("data") or {}
  code_receive,receive_env=request(a.base_url+"/api/orders-command-center?action=today&type=RECEIVE&limit=50");receive=receive_env.get("data") or {}
  code_ship,ship_env=request(a.base_url+"/api/orders-command-center?action=today&type=SHIP&limit=50");ship=ship_env.get("data") or {}
  code_aged,aged_env=request(a.base_url+"/api/orders-command-center?action=today&aged=24&limit=50");aged=aged_env.get("data") or {}
  code_recent,recent_env=request(a.base_url+"/api/orders-command-center?action=completed_recent&hours=24&limit=12");recent=recent_env.get("data") or {}
  bad_code,_=request(a.base_url+"/api/orders-command-center?action=today&priority=P9")

  after_commands=int(run(f"select count(*) from warehouse_v7.command where tenant_id='{a.tenant}'::uuid;"))
  after_moves=int(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{a.tenant}'::uuid;"))

  summary=data.get("summary") or {};priority=data.get("priority") or {};aging=data.get("aging") or [];lanes=data.get("lanes") or {}
  checks={
    "overview_http_ok":code==200,
    "all_filter_http_ok":code_all==200 and int(all_today.get("matching_count",0))==int(summary.get("attention_total",0)),
    "p1_filter_exact":code_p1==200 and all(x.get("priority")=="P1" for x in p1.get("items") or []),
    "receive_filter_exact":code_receive==200 and all(x.get("work_type")=="RECEIVE" for x in receive.get("items") or []),
    "ship_filter_exact":code_ship==200 and all(x.get("work_type")=="SHIP" for x in ship.get("items") or []),
    "aged24_filter_exact":code_aged==200 and all(int(x.get("age_hours",0))>=24 for x in aged.get("items") or []),
    "invalid_filter_rejected":bad_code==400,
    "completed_recent_http_ok":code_recent==200 and recent.get("window_semantics")=="rolling_hours_not_calendar_day",
    "completed_recent_visible":int(recent.get("matching_count",0))>=2,
    "priority_math":summary.get("attention_total")==sum(int(priority.get(k,0)) for k in ["p1","p2","p3"]),
    "known_bound_order_in_ship_lane":any(x.get("display_id")=="PO-LAB-BIND" for x in lanes.get("ready_ship") or []),
    "reads_created_no_commands":before_commands==after_commands,
    "reads_created_no_movements":before_moves==after_moves,
  }
  stops=[k for k,v in checks.items() if not v]
  report={"mode":"V7_ORDERS_COMMAND_CENTER_FILTERS_AND_CLOSEOUT_HTTP_E2E","production_writes":0,"database":"warehouse_v7_test","validation":checks,"summary":summary,"filter_counts":{"all":all_today.get("matching_count"),"p1":p1.get("matching_count"),"receive":receive.get("matching_count"),"ship":ship.get("matching_count"),"aged24":aged.get("matching_count")},"completed_recent_count":recent.get("matching_count"),"stop_reasons":stops,"verdict":"HTTP_E2E_PASS" if not stops else "STOP"}
  Path(a.report).write_text(json.dumps(report,indent=2)+"\n");print(json.dumps(report,indent=2))
  if stops:raise SystemExit(1)
  print("V7 ORDERS COMMAND CENTER FILTERS + ROLLING 24H CLOSEOUT HTTP E2E: PASS")
if __name__=="__main__":main()
