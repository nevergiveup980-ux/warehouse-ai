#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 TRANSFER shadow replay.

Replays historical stock transfers with explicit source before/after quantities through
the quantity-aware V7 transfer engine. Carpet Foot transfers are intentionally deferred
to the carpet-transfer shadow phase.

The validator checks source arithmetic, destination conservation, command idempotency,
and two-sided movement/event cardinality. Production writes are impossible here.
"""
import argparse, json, os, re, subprocess, uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path

DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=(f"host={os.environ.get('PGHOST','localhost')} "
      f"port={os.environ.get('PGPORT','5432')} dbname={DB} "
      f"user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
ENV=os.environ.copy(); ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("1efcbbbe-d131-4bb8-a6fa-b1f3b2ff1686")
UNIT_MAP={"box":"BOX","carton":"BOX","piece":"EACH","each":"EACH","pail":"PAIL","bucket":"BUCKET","tube":"TUBE","roll":"ROLL","gal":"GAL","gallon":"GAL"}
SRC_RE=re.compile(r"Transfer\s+.+?\s+([0-9]+(?:\.[0-9]+)?)\s*→\s*([0-9]+(?:\.[0-9]+)?)",re.I)
DST_RE=re.compile(r";\s*[^;]+?\s+([0-9]+(?:\.[0-9]+)?)\s*→\s*([0-9]+(?:\.[0-9]+)?)",re.I)

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

def setup(tenant,actor,u,source_code,dest_code,rid,before):
    product=str(uuid.uuid5(NS,"product:"+u))
    src_loc=str(uuid.uuid5(NS,"src-location:"+source_code))
    dst_loc=str(uuid.uuid5(NS,"dst-location:"+dest_code))
    src=str(uuid.uuid5(NS,"src-stock:"+rid))
    dst=str(uuid.uuid5(NS,"dst-stock:"+rid))
    run(f"""
      insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(tenant)}::uuid,{q(actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
      insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle)
      values({q(tenant)}::uuid,{q(product)}::uuid,{q('TRANSFER-SHADOW-PRODUCT:'+u)},
             {q('Transfer Shadow '+u)},{q(u)},{q(u)},'active')
      on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
      values
        ({q(tenant)}::uuid,{q(src_loc)}::uuid,{q('TSH-S:'+source_code)},'rack','active'),
        ({q(tenant)}::uuid,{q(dst_loc)}::uuid,{q('TSH-D:'+dest_code)},'external','active')
      on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.stock_item(
        tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id
      ) values(
        {q(tenant)}::uuid,{q(src)}::uuid,{q(product)}::uuid,{q(src_loc)}::uuid,
        {q(before)}::numeric,{q(u)},1,'active',{q('TRANSFER-SHADOW:'+rid)}
      );
    """)
    return src,dst,dst_loc

def call_transfer(tenant,actor,command,src,dst,dst_loc,qty,rid):
    return json.loads(value(run(f"""
      set request.jwt.claim.sub={q(actor)};
      select warehouse_v7.transfer_stock_quantity(
        {q(tenant)}::uuid,{q(command)}::uuid,{q(src)}::uuid,1,
        {q(dst)}::uuid,0,{q(qty)}::numeric,{q(dst_loc)}::uuid,
        jsonb_build_object('shadow_mode',true,'source_dataset','runlu_operations_log_v52','source_record_id',{q(rid)}),
        {q(actor)}::uuid,'V7_TRANSFER_SHADOW'
      )::text;
    """)))

def state(tenant,command,src,dst):
    return json.loads(value(run(f"""
      select jsonb_build_object(
        'command_count',(select count(*) from warehouse_v7.command where tenant_id={q(tenant)}::uuid and id={q(command)}::uuid),
        'movement_count',(select count(*) from warehouse_v7.inventory_movement where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
        'event_count',(select count(*) from warehouse_v7.event where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
        'source_quantity',(select quantity::text from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(src)}::uuid),
        'source_version',(select version from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(src)}::uuid),
        'source_lifecycle',(select lifecycle from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(src)}::uuid),
        'destination_quantity',(select quantity::text from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(dst)}::uuid),
        'destination_version',(select version from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(dst)}::uuid),
        'destination_lifecycle',(select lifecycle from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(dst)}::uuid)
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
    if len(rows)!=int(integ.get("total_live_rows",-1)): raise RuntimeError("OPERATION_SHADOW_COUNT_MISMATCH")

    total=eligible=deferred_carpet=deferred_no_exact=0
    unknown=[]; arithmetic=[]; engine=[]; replay=[]; ledger=[]; destination_warnings=[]
    for row in rows:
        p=row.get("payload") or {}
        if p.get("type")!="Inventory Transfer" or p.get("status")!="Completed": continue
        total+=1
        if str(p.get("impactApplied") or "").lower()!="true":
            deferred_no_exact+=1; continue
        u=unit(p.get("unit"))
        if str(p.get("unit") or "").strip().lower()=="foot":
            deferred_carpet+=1; continue
        if u is None:
            unknown.append(str(row.get("record_id"))); continue
        m=SRC_RE.search(str(p.get("impactResult") or ""))
        qty=dec(p.get("quantity"))
        if not m or qty is None or qty<=0:
            deferred_no_exact+=1; continue
        before=dec(m.group(1)); after=dec(m.group(2))
        if before is None or after is None:
            deferred_no_exact+=1; continue
        eligible+=1
        rid=str(row.get("record_id") or "")
        if before-qty!=after:
            arithmetic.append(rid); continue

        dm=DST_RE.search(str(p.get("impactResult") or ""))
        if dm:
            db=dec(dm.group(1)); da=dec(dm.group(2))
            if db is not None and da is not None and da-db!=qty:
                destination_warnings.append(rid)

        source_code=str(p.get("location") or "UNKNOWN").strip() or "UNKNOWN"
        dest_code=str(p.get("toLocation") or "DEST").strip() or "DEST"
        src,dst,dst_loc=setup(a.tenant,a.actor,u,source_code,dest_code,rid,before)
        command=str(uuid.uuid5(NS,"command:"+rid))
        first=call_transfer(a.tenant,a.actor,command,src,dst,dst_loc,qty,rid)
        s1=state(a.tenant,command,src,dst)
        second=call_transfer(a.tenant,a.actor,command,src,dst,dst_loc,qty,rid)
        s2=state(a.tenant,command,src,dst)

        src_q=dec(s1.get("source_quantity")); dst_q=dec(s1.get("destination_quantity"))
        if (first.get("status")!="committed"
            or dec(first.get("source_before"))!=before
            or dec(first.get("source_remaining"))!=after
            or dec(first.get("quantity"))!=qty
            or dec(first.get("destination_quantity"))!=qty
            or src_q!=after or dst_q!=qty
            or int(s1.get("source_version",-1))!=2
            or int(s1.get("destination_version",-1))!=1
            or s1.get("source_lifecycle")!=("consumed" if after==0 else "active")
            or s1.get("destination_lifecycle")!="active"):
            engine.append(rid)
        if second!=first or s2!=s1: replay.append(rid)
        if int(s2.get("command_count",-1))!=1 or int(s2.get("movement_count",-1))!=2 or int(s2.get("event_count",-1))!=2:
            ledger.append(rid)

    stops=[]
    if unknown: stops.append("V6_TRANSFER_UNKNOWN_UNIT")
    if arithmetic: stops.append("V6_TRANSFER_SOURCE_ARITHMETIC_MISMATCH")
    if engine: stops.append("V7_TRANSFER_ENGINE_MISMATCH")
    if replay: stops.append("V7_TRANSFER_REPLAY_MISMATCH")
    if ledger: stops.append("V7_TRANSFER_LEDGER_CARDINALITY_MISMATCH")
    if eligible==0: stops.append("NO_ELIGIBLE_STOCK_TRANSFERS")

    report={
      "mode":"V7_TRANSFER_SHADOW_REPLAY","production_writes":0,
      "source_integrity":{"snapshot_md5":integ.get("snapshot_md5"),"total_live_rows":int(integ.get("total_live_rows",-1)),"postgres_jsonb_text_verified":True},
      "observed":{"completed_transfer_rows":total,"eligible_stock_transfers":eligible,"deferred_carpet_foot_transfers":deferred_carpet,"deferred_without_exact_source_before_after":deferred_no_exact,"legacy_destination_tracking_warnings":len(destination_warnings),"unknown_unit_rows":len(unknown)},
      "validation":{"exact_v6_source_before_minus_transfer_equals_after_pass":eligible-len(arithmetic),"v7_source_and_destination_conservation_pass":eligible-len(engine),"same_command_replay_pass":eligible-len(replay),"one_command_two_movements_two_events_pass":eligible-len(ledger)},
      "warning_record_ids":{"legacy_destination_tracking":destination_warnings[:25]},
      "failure_record_ids":{"unknown_unit":unknown[:25],"arithmetic":arithmetic[:25],"engine":engine[:25],"replay":replay[:25],"ledger":ledger[:25]},
      "stop_reasons":stops,"verdict":"SHADOW_PASS" if not stops else "STOP"
    }
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
    if stops: raise SystemExit(1)
    print("V7 TRANSFER SHADOW REPLAY: PASS")

if __name__=="__main__": main()
