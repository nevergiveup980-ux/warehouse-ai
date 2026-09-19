#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 SHIPPING shadow replay.

Consumes a sanitized read-only V6 operations feed. Historical Shipping rows with an
explicit "Inventory before -> after" result are replayed against isolated synthetic
Stock Items in Disposable Postgres, then replayed with the same command UUID.

No production write path exists in this tool.
"""
import argparse, json, os, re, subprocess, uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path

DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=(f"host={os.environ.get('PGHOST','localhost')} "
      f"port={os.environ.get('PGPORT','5432')} dbname={DB} "
      f"user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
ENV=os.environ.copy(); ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("d814bb66-1cb7-4c27-a364-e6f4e5797844")
UNIT_MAP={"box":"BOX","carton":"BOX","piece":"EACH","each":"EACH","pail":"PAIL","bucket":"BUCKET","tube":"TUBE","roll":"ROLL","gal":"GAL","gallon":"GAL"}
INV_RE=re.compile(r"Inventory\s+([0-9]+(?:\.[0-9]+)?)\s*→\s*([0-9]+(?:\.[0-9]+)?)",re.I)

def run(sql,ok=True):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=ENV)
    if ok and r.returncode!=0: raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r

def value(r):
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return xs[-1] if xs else ""

def q(v): return "'" + str(v).replace("'","''") + "'"

def dec(v):
    try: d=Decimal(str(v).strip())
    except (InvalidOperation,AttributeError): return None
    return d if d.is_finite() else None

def unit(v): return UNIT_MAP.get(str(v or "").strip().lower())

def ensure_disposable():
    name=value(run("select current_database();"))
    if name!="warehouse_v7_test": raise RuntimeError("SHADOW_REFUSES_DATABASE:"+name)

def setup(tenant,actor,u,loc_code,rid,before):
    product=str(uuid.uuid5(NS,"product:"+u))
    location=str(uuid.uuid5(NS,"location:"+loc_code))
    stock=str(uuid.uuid5(NS,"stock:"+rid))
    run(f"""
      insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(tenant)}::uuid,{q(actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
      insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle)
      values({q(tenant)}::uuid,{q(product)}::uuid,{q('SHIP-SHADOW-PRODUCT:'+u)},
             {q('Ship Shadow '+u)},{q(u)},{q(u)},'active')
      on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
      values({q(tenant)}::uuid,{q(location)}::uuid,{q('SSH:'+loc_code)},'rack','active')
      on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id)
      values({q(tenant)}::uuid,{q(stock)}::uuid,{q(product)}::uuid,{q(location)}::uuid,
             {q(before)}::numeric,{q(u)},1,'active',{q('SHIP-SHADOW:'+rid)});
    """)
    return stock

def call_ship(tenant,actor,command,stock,qty,rid):
    raw=value(run(f"""
      set request.jwt.claim.sub={q(actor)};
      select warehouse_v7.ship_stock(
        {q(tenant)}::uuid,{q(command)}::uuid,{q(stock)}::uuid,1,
        {q(qty)}::numeric,
        jsonb_build_object('shadow_mode',true,'source_dataset','runlu_operations_log_v52','source_record_id',{q(rid)}),
        {q(actor)}::uuid,'V7_SHIP_SHADOW'
      )::text;
    """))
    return json.loads(raw)

def state(tenant,command,stock):
    return json.loads(value(run(f"""
      select jsonb_build_object(
        'command_count',(select count(*) from warehouse_v7.command where tenant_id={q(tenant)}::uuid and id={q(command)}::uuid),
        'movement_count',(select count(*) from warehouse_v7.inventory_movement where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
        'event_count',(select count(*) from warehouse_v7.event where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
        'quantity',(select quantity::text from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid),
        'version',(select version from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid),
        'lifecycle',(select lifecycle from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid)
      )::text;
    """)))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("envelope"); ap.add_argument("--report",required=True)
    ap.add_argument("--tenant",required=True); ap.add_argument("--actor",required=True)
    a=ap.parse_args()
    ensure_disposable()
    env=json.loads(Path(a.envelope).read_text())
    if env.get("mode")!="READ_ONLY_V6_OPERATION_SHADOW": raise RuntimeError("OPERATION_SHADOW_MODE_INVALID")
    rows=env.get("rows"); integ=env.get("source_integrity") or {}
    if not isinstance(rows,list) or not rows: raise RuntimeError("OPERATION_SHADOW_ROWS_REQUIRED")
    if len(rows)!=int(integ.get("total_live_rows",-1)): raise RuntimeError("OPERATION_SHADOW_COUNT_MISMATCH")
    if integ.get("postgres_jsonb_text_verified") is not True: raise RuntimeError("OPERATION_SHADOW_NOT_VERIFIED")

    total=eligible=deferred=0
    unknown=[]; arithmetic=[]; engine=[]; replay=[]; ledger=[]
    for row in rows:
        p=row.get("payload") or {}
        if p.get("type")!="Shipping" or p.get("status")!="Completed": continue
        total+=1
        if str(p.get("impactApplied") or "").lower()!="true":
            deferred+=1; continue
        m=INV_RE.search(str(p.get("impactResult") or ""))
        qty=dec(p.get("quantity")); u=unit(p.get("unit"))
        if not m or qty is None or qty<=0:
            deferred+=1; continue
        if u is None:
            unknown.append(str(row.get("record_id"))); continue
        before=dec(m.group(1)); after=dec(m.group(2))
        if before is None or after is None or before<0 or after<0:
            deferred+=1; continue
        eligible+=1
        rid=str(row.get("record_id") or "")
        if before-qty!=after:
            arithmetic.append(rid); continue
        loc=str(p.get("location") or "UNKNOWN").strip() or "UNKNOWN"
        stock=setup(a.tenant,a.actor,u,loc,rid,before)
        command=str(uuid.uuid5(NS,"command:"+rid))
        first=call_ship(a.tenant,a.actor,command,stock,qty,rid)
        s1=state(a.tenant,command,stock)
        second=call_ship(a.tenant,a.actor,command,stock,qty,rid)
        s2=state(a.tenant,command,stock)
        q1=dec(s1.get("quantity"))
        if (first.get("status")!="committed" or dec(first.get("before"))!=before
            or dec(first.get("shipped"))!=qty or dec(first.get("remaining"))!=after
            or q1!=after or int(s1.get("version",-1))!=2
            or s1.get("lifecycle")!=("consumed" if after==0 else "active")):
            engine.append(rid)
        if second!=first or s2!=s1: replay.append(rid)
        if int(s2.get("command_count",-1))!=1 or int(s2.get("movement_count",-1))!=1 or int(s2.get("event_count",-1))!=1:
            ledger.append(rid)

    stops=[]
    if unknown: stops.append("V6_SHIP_UNKNOWN_UNIT")
    if arithmetic: stops.append("V6_SHIP_ARITHMETIC_MISMATCH")
    if engine: stops.append("V7_SHIP_ENGINE_MISMATCH")
    if replay: stops.append("V7_SHIP_REPLAY_MISMATCH")
    if ledger: stops.append("V7_SHIP_LEDGER_CARDINALITY_MISMATCH")
    if eligible==0: stops.append("NO_ELIGIBLE_SHIPMENTS")
    report={
      "mode":"V7_SHIP_SHADOW_REPLAY","production_writes":0,
      "source_integrity":{"snapshot_md5":integ.get("snapshot_md5"),"total_live_rows":int(integ.get("total_live_rows",-1)),"postgres_jsonb_text_verified":True},
      "observed":{"completed_shipping_rows":total,"eligible_before_after_shipments":eligible,"deferred_without_exact_before_after":deferred,"unknown_unit_rows":len(unknown)},
      "validation":{"exact_v6_before_minus_ship_equals_after_pass":eligible-len(arithmetic),"v7_engine_pass":eligible-len(engine),"same_command_replay_pass":eligible-len(replay),"one_command_one_movement_one_event_pass":eligible-len(ledger)},
      "failure_record_ids":{"unknown_unit":unknown[:25],"arithmetic":arithmetic[:25],"engine":engine[:25],"replay":replay[:25],"ledger":ledger[:25]},
      "stop_reasons":stops,"verdict":"SHADOW_PASS" if not stops else "STOP"
    }
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
    if stops: raise SystemExit(1)
    print("V7 SHIPPING SHADOW REPLAY: PASS")

if __name__=="__main__": main()
