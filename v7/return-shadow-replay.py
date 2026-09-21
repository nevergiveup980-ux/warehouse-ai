#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 RETURN shadow replay.

Validates stock-style Customer Return / Installer Return history against the V7 compensating
return engine. Legacy rows do not carry a stable original shipment command, so this shadow
uses a synthetic original SHIP cause while preserving the real return quantity/unit/location.
Carpet Foot returns and Return-to-Supplier are deferred because they are different domains.

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
NS=uuid.UUID("7bb513af-2417-4ab1-ac08-ed0c73eaf27e")
UNIT_MAP={"box":"BOX","carton":"BOX","piece":"EACH","each":"EACH","pail":"PAIL","bucket":"BUCKET","tube":"TUBE","roll":"ROLL","gal":"GAL","gallon":"GAL"}
ARROW_RE=re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*→\s*([0-9]+(?:\.[0-9]+)?)")
PLUS_RE=re.compile(r"Inventory\s*\+\s*([0-9]+(?:\.[0-9]+)?)",re.I)

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

def setup(tenant,actor,u,loc_code,rid,before,ship_qty):
    product=str(uuid.uuid5(NS,"product:"+u))
    location=str(uuid.uuid5(NS,"location:"+loc_code))
    stock=str(uuid.uuid5(NS,"stock:"+rid))
    original_ship=str(uuid.uuid5(NS,"original-ship:"+rid))
    lifecycle="consumed" if before==0 else "active"
    run(f"""
      insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(tenant)}::uuid,{q(actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
      insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle)
      values({q(tenant)}::uuid,{q(product)}::uuid,{q('RETURN-SHADOW-PRODUCT:'+u)},
             {q('Return Shadow '+u)},{q(u)},{q(u)},'active')
      on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
      values({q(tenant)}::uuid,{q(location)}::uuid,{q('RTH:'+loc_code)},'rack','active')
      on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.stock_item(
        tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id
      ) values(
        {q(tenant)}::uuid,{q(stock)}::uuid,{q(product)}::uuid,{q(location)}::uuid,
        {q(before)}::numeric,{q(u)},1,{q(lifecycle)},{q('RETURN-SHADOW:'+rid)}
      );
      insert into warehouse_v7.command(
        tenant_id,id,command_type,entity_type,entity_id,expected_version,payload,
        payload_fingerprint,status,actor_id,device_id
      ) values(
        {q(tenant)}::uuid,{q(original_ship)}::uuid,'SHIP','stock_item',{q(stock)}::uuid,1,
        jsonb_build_object('shadow_fixture',true),'shadow-fixture','committed',
        {q(actor)}::uuid,'V7_RETURN_SHADOW_FIXTURE'
      );
      insert into warehouse_v7.inventory_movement(
        tenant_id,command_id,product_id,stock_item_id,movement_type,quantity,unit,from_location_id
      ) values(
        {q(tenant)}::uuid,{q(original_ship)}::uuid,{q(product)}::uuid,{q(stock)}::uuid,
        'SHIP',{q(ship_qty)}::numeric,{q(u)},{q(location)}::uuid
      );
    """)
    return stock,location,original_ship

def call_return(tenant,actor,command,stock,qty,u,location,original_ship,rid):
    return json.loads(value(run(f"""
      set request.jwt.claim.sub={q(actor)};
      select warehouse_v7.return_stock(
        {q(tenant)}::uuid,{q(command)}::uuid,{q(stock)}::uuid,1,
        {q(qty)}::numeric,{q(u)},{q(location)}::uuid,{q(original_ship)}::uuid,
        jsonb_build_object('shadow_mode',true,'source_dataset','runlu_operations_log_v52','source_record_id',{q(rid)}),
        {q(actor)}::uuid,'V7_RETURN_SHADOW'
      )::text;
    """)))

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
    a=ap.parse_args(); ensure_disposable()
    env=json.loads(Path(a.envelope).read_text())
    if env.get("mode")!="READ_ONLY_V6_OPERATION_SHADOW": raise RuntimeError("OPERATION_SHADOW_MODE_INVALID")
    rows=env.get("rows"); integ=env.get("source_integrity") or {}
    if not isinstance(rows,list) or not rows: raise RuntimeError("OPERATION_SHADOW_ROWS_REQUIRED")

    candidates=eligible=deferred_carpet=deferred_supplier=deferred_incomplete=0
    unknown=[]; arithmetic=[]; engine=[]; replay=[]; ledger=[]
    for row in rows:
        p=row.get("payload") or {}
        typ=p.get("type")
        if p.get("status")!="Completed": continue
        if typ=="Return to Supplier":
            deferred_supplier+=1; continue
        if typ not in ("Customer Return","Installer Return","Cut Piece Return"): continue
        candidates+=1
        if str(p.get("impactApplied") or "").lower()!="true":
            deferred_incomplete+=1; continue
        if str(p.get("unit") or "").strip().lower()=="foot" or typ=="Cut Piece Return":
            deferred_carpet+=1; continue
        u=unit(p.get("unit")); qty=dec(p.get("quantity"))
        if u is None:
            unknown.append(str(row.get("record_id"))); continue
        if qty is None or qty<=0:
            deferred_incomplete+=1; continue

        impact=str(p.get("impactResult") or "")
        before=Decimal(0); expected_after=qty
        m=ARROW_RE.search(impact)
        exact_mode=False
        if m:
            b=dec(m.group(1)); aft=dec(m.group(2))
            if b is not None and aft is not None:
                before=b; expected_after=aft; exact_mode=True
        else:
            pm=PLUS_RE.search(impact)
            if pm:
                declared=dec(pm.group(1))
                if declared!=qty:
                    arithmetic.append(str(row.get("record_id"))); continue

        eligible+=1
        rid=str(row.get("record_id") or "")
        if exact_mode and before+qty!=expected_after:
            arithmetic.append(rid); continue

        loc=str(p.get("location") or "RETURN").strip() or "RETURN"
        stock,location,original_ship=setup(a.tenant,a.actor,u,loc,rid,before,qty)
        command=str(uuid.uuid5(NS,"command:"+rid))
        first=call_return(a.tenant,a.actor,command,stock,qty,u,location,original_ship,rid)
        s1=state(a.tenant,command,stock)
        second=call_return(a.tenant,a.actor,command,stock,qty,u,location,original_ship,rid)
        s2=state(a.tenant,command,stock)
        state_qty=dec(s1.get("quantity"))
        if (first.get("status")!="committed" or dec(first.get("returned"))!=qty
            or state_qty!=before+qty or int(s1.get("version",-1))!=2
            or s1.get("lifecycle")!="active"
            or (exact_mode and state_qty!=expected_after)):
            engine.append(rid)
        if second!=first or s2!=s1: replay.append(rid)
        if int(s2.get("command_count",-1))!=1 or int(s2.get("movement_count",-1))!=1 or int(s2.get("event_count",-1))!=1:
            ledger.append(rid)

    stops=[]
    if unknown: stops.append("V6_RETURN_UNKNOWN_UNIT")
    if arithmetic: stops.append("V6_RETURN_ARITHMETIC_MISMATCH")
    if engine: stops.append("V7_RETURN_ENGINE_MISMATCH")
    if replay: stops.append("V7_RETURN_REPLAY_MISMATCH")
    if ledger: stops.append("V7_RETURN_LEDGER_CARDINALITY_MISMATCH")
    if eligible==0: stops.append("NO_ELIGIBLE_STOCK_RETURNS")
    report={
      "mode":"V7_RETURN_SHADOW_REPLAY","production_writes":0,
      "source_integrity":{"snapshot_md5":integ.get("snapshot_md5"),"total_live_rows":int(integ.get("total_live_rows",-1)),"postgres_jsonb_text_verified":True},
      "observed":{"customer_installer_cutpiece_candidates":candidates,"eligible_stock_returns":eligible,"deferred_carpet_returns":deferred_carpet,"deferred_return_to_supplier":deferred_supplier,"deferred_incomplete":deferred_incomplete,"unknown_unit_rows":len(unknown),"original_ship_linkage_mode":"synthetic-shadow-fixture"},
      "validation":{"v6_declared_return_delta_pass":eligible-len(arithmetic),"v7_return_engine_pass":eligible-len(engine),"same_command_replay_pass":eligible-len(replay),"one_command_one_movement_one_event_pass":eligible-len(ledger)},
      "failure_record_ids":{"unknown_unit":unknown[:25],"arithmetic":arithmetic[:25],"engine":engine[:25],"replay":replay[:25],"ledger":ledger[:25]},
      "stop_reasons":stops,"verdict":"SHADOW_PASS" if not stops else "STOP"
    }
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
    if stops: raise SystemExit(1)
    print("V7 RETURN SHADOW REPLAY: PASS")

if __name__=="__main__": main()
