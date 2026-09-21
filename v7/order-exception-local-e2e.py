#!/usr/bin/env python3
import argparse,json,os,subprocess,uuid,urllib.request,urllib.error
from pathlib import Path

DB=os.environ.get("PGDATABASE","")
CONN=(f"host={os.environ.get('PGHOST','127.0.0.1')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
ENV=os.environ.copy(); ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("e547fb38-f148-409e-9653-f9d09e5a51fb")

def run(sql):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=ENV)
    if r.returncode!=0: raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return xs[-1] if xs else ""
def q(v): return "'" + str(v).replace("'","''") + "'"
def inventory_state(tenant):
    return json.loads(run(f"""
      with stock as (
        select count(*)::int n,coalesce(md5(string_agg(concat_ws('|',id::text,product_id::text,location_id::text,quantity::text,unit,version::text,lifecycle),E'\\n' order by id)),'') fp
        from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid
      ), carpet as (
        select count(*)::int n,coalesce(md5(string_agg(concat_ws('|',id::text,product_id::text,location_id::text,remaining_sixteenths::text,version::text,lifecycle),E'\\n' order by id)),'') fp
        from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid
      ), moves as (
        select count(*)::int n from warehouse_v7.inventory_movement where tenant_id={q(tenant)}::uuid
      )
      select jsonb_build_object('stock_count',(select n from stock),'stock_fingerprint',(select fp from stock),'carpet_count',(select n from carpet),'carpet_fingerprint',(select fp from carpet),'movement_count',(select n from moves))::text;
    """))
def request(base,path,method="GET",body=None):
    data=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(base.rstrip("/")+path,data=data,method=method)
    if data is not None: req.add_header("Content-Type","application/json")
    try:
        with urllib.request.urlopen(req,timeout=5) as r: return r.status,json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw=e.read().decode(); return e.code,json.loads(raw) if raw else {}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--base-url",default="http://127.0.0.1:8787")
    ap.add_argument("--tenant",required=True)
    ap.add_argument("--report",required=True)
    a=ap.parse_args()
    if DB!="warehouse_v7_test": raise RuntimeError("LOCAL_HTTP_E2E_REFUSES_DATABASE")
    code,health=request(a.base_url,"/healthz")
    if code!=200 or health.get("data",{}).get("database")!="warehouse_v7_test": raise RuntimeError("LOCAL_HTTP_HEALTH_FAILED")
    html=urllib.request.urlopen(a.base_url+"/",timeout=5).read().decode()
    if "Order Exception Workbench" not in html or "order-exception-local-api-client.js" not in html: raise RuntimeError("LOCAL_HTTP_WORKBENCH_HTML_MISSING")
    code,listed=request(a.base_url,"/api/order-exception?action=list&status=open")
    if code!=200: raise RuntimeError("LOCAL_HTTP_LIST_FAILED")
    data=listed.get("data") or {}; initial=int((data.get("summary") or {}).get("total",-1))
    if initial!=12: raise RuntimeError("LOCAL_HTTP_EXPECTED_12_OPEN_CASES")
    chosen=None
    for c in data.get("cases") or []:
        ctx=c.get("display_context") or {}
        has_id=bool(ctx.get("recovery_key") or ctx.get("sales_order_number") or ctx.get("purchase_order_number"))
        if c.get("reason")=="STRUCTURED_STATUS_MISSING" and has_id and ctx.get("product_label") and ctx.get("quantity") and ctx.get("unit"):
            chosen=c; break
    if not chosen: raise RuntimeError("LOCAL_HTTP_SAFE_CASE_NOT_FOUND")
    case_id=chosen["case_id"]
    code,d=request(a.base_url,"/api/order-exception?action=get&case_id="+case_id)
    detail=d.get("data") or {}
    if code!=200 or detail.get("can_resolve") is not True: raise RuntimeError("LOCAL_HTTP_GET_OR_ROLE_FAILED")
    before=inventory_state(a.tenant); ctx=detail.get("display_context") or {}
    command=str(uuid.uuid5(NS,"local-http:"+case_id))
    payload={"action":"resolve","case_id":case_id,"command_id":command,"expected_version":detail["version"],"order_kind":ctx.get("order_kind") or "STANDARD","lifecycle":"in_progress","fulfillment_status":"pending","fields":{"recovery_key":ctx.get("recovery_key"),"sales_order_number":ctx.get("sales_order_number"),"purchase_order_number":ctx.get("purchase_order_number"),"customer_label":ctx.get("customer_label"),"product_label":ctx.get("product_label"),"source_location":ctx.get("source_location"),"quantity":ctx.get("quantity"),"unit":ctx.get("unit")},"resolution_note":"SHADOW ONLY: synthetic localhost HTTP decision; not a historical status assertion."}
    c1,r1=request(a.base_url,"/api/order-exception","POST",payload); c2,r2=request(a.base_url,"/api/order-exception","POST",payload)
    first=r1.get("data") or {}; second=r2.get("data") or {}
    if c1!=200 or c2!=200 or first.get("status")!="committed" or second!=first: raise RuntimeError("LOCAL_HTTP_RESOLVE_OR_IDEMPOTENCY_FAILED")
    after=inventory_state(a.tenant)
    _,post=request(a.base_url,"/api/order-exception?action=list&status=open"); final=int(((post.get("data") or {}).get("summary") or {}).get("total",-1))
    _,da=request(a.base_url,"/api/order-exception?action=get&case_id="+case_id); detail_after=da.get("data") or {}
    movement_count=int(run("select count(*) from warehouse_v7.inventory_movement where tenant_id="+q(a.tenant)+"::uuid and command_id="+q(command)+"::uuid;"))
    stops=[]
    if final!=initial-1: stops.append("OPEN_CASE_COUNT_DID_NOT_DECREMENT")
    if detail_after.get("status")!="resolved": stops.append("CASE_NOT_RESOLVED")
    if before!=after: stops.append("GLOBAL_INVENTORY_STATE_CHANGED")
    if movement_count!=0: stops.append("RESOLUTION_CREATED_INVENTORY_MOVEMENT")
    report={"mode":"V7_ORDER_EXCEPTION_LOCAL_HTTP_E2E","production_writes":0,"historical_status_asserted":False,"transport":"localhost_http","database":"warehouse_v7_test","initial_open_cases":initial,"final_open_cases":final,"validation":{"health_pass":True,"workbench_html_served":True,"real_sanitized_case_loaded":True,"resolution_committed":first.get("status")=="committed","same_command_retry_identical":second==first,"case_resolved_once":detail_after.get("status")=="resolved","zero_command_inventory_movements":movement_count==0,"global_inventory_state_unchanged":before==after},"stop_reasons":stops,"verdict":"HTTP_E2E_PASS" if not stops else "STOP"}
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n"); print(json.dumps(report,indent=2))
    if stops: raise SystemExit(1)
    print("V7 ORDER EXCEPTION DISPOSABLE LOCAL HTTP E2E: PASS")
if __name__=="__main__": main()
