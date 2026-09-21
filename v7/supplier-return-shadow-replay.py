#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 Supplier Return shadow validator.

Historical V6 Return-to-Supplier records may be work records only. Those are audited
but are never invented into inventory movements. If a V6 row carries exact stock
before/after evidence, it is replayed through the V7 supplier-return engine.

No production write path exists here.
"""
import argparse,json,os,re,subprocess,uuid
from decimal import Decimal,InvalidOperation
from pathlib import Path

DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=(f"host={os.environ.get('PGHOST','localhost')} "
      f"port={os.environ.get('PGPORT','5432')} dbname={DB} "
      f"user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
ENV=os.environ.copy(); ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("84e96fb2-bc3e-4a86-8a94-9a4a09e8592d")
UNIT_MAP={"box":"BOX","carton":"BOX","piece":"EACH","each":"EACH","pail":"PAIL","bucket":"BUCKET","tube":"TUBE","roll":"ROLL","gal":"GAL","gallon":"GAL"}
ARROW_RE=re.compile(r"Inventory\s+([0-9]+(?:\.[0-9]+)?)\s*→\s*([0-9]+(?:\.[0-9]+)?)",re.I)
WORK_ONLY_RE=re.compile(r"Completed as a work record only",re.I)

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
      values({q(tenant)}::uuid,{q(product)}::uuid,{q('SUPPLIER-RETURN-SHADOW:'+u)},
             {q('Supplier Return Shadow '+u)},{q(u)},{q(u)},'active')
      on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
      values({q(tenant)}::uuid,{q(location)}::uuid,{q('SRS:'+loc_code)},'rack','active')
      on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.stock_item(
        tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id
      ) values(
        {q(tenant)}::uuid,{q(stock)}::uuid,{q(product)}::uuid,{q(location)}::uuid,
        {q(before)}::numeric,{q(u)},1,'active',{q('SUPPLIER-RETURN-SHADOW:'+rid)}
      );
    """)
    return stock

def call_engine(tenant,actor,command,stock,qty,supplier_ref,rid):
    return json.loads(value(run(f"""
      set request.jwt.claim.sub={q(actor)};
      select warehouse_v7.return_stock_to_supplier(
        {q(tenant)}::uuid,{q(command)}::uuid,{q(stock)}::uuid,1,
        {q(qty)}::numeric,{q(supplier_ref)},
        jsonb_build_object('shadow_mode',true,'source_record_id',{q(rid)}),
        {q(actor)}::uuid,'V7_SUPPLIER_RETURN_SHADOW'
      )::text;
    """)))

def state(tenant,command,stock):
    return json.loads(value(run(f"""
      select jsonb_build_object(
        'qty',(select quantity::text from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid),
        'version',(select version from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid),
        'lifecycle',(select lifecycle from warehouse_v7.stock_item where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid),
        'commands',(select count(*) from warehouse_v7.command where tenant_id={q(tenant)}::uuid and id={q(command)}::uuid),
        'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
        'events',(select count(*) from warehouse_v7.event where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid)
      )::text;
    """)))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("envelope"); ap.add_argument("--report",required=True)
    ap.add_argument("--tenant",required=True); ap.add_argument("--actor",required=True)
    a=ap.parse_args(); ensure_disposable()

    env=json.loads(Path(a.envelope).read_text())
    if env.get("mode")!="READ_ONLY_V6_OPERATION_SHADOW":
        raise RuntimeError("OPERATION_SHADOW_MODE_INVALID")
    rows=env.get("rows"); integ=env.get("source_integrity") or {}
    if not isinstance(rows,list):
        raise RuntimeError("OPERATION_SHADOW_ROWS_REQUIRED")
    if len(rows)!=int(integ.get("total_live_rows",-1)):
        raise RuntimeError("OPERATION_SHADOW_COUNT_MISMATCH")

    candidates=legacy_work_only=strict_replay=0
    ambiguous=[]; arithmetic=[]; engine=[]; replay=[]; ledger=[]
    legacy_ids=[]

    for row in rows:
        p=row.get("payload") or {}
        if p.get("type")!="Return to Supplier" or p.get("status")!="Completed":
            continue
        candidates+=1
        rid=str(row.get("record_id") or "")
        impact=str(p.get("impactResult") or "")
        qty=dec(p.get("quantity"))
        u=unit(p.get("unit"))
        supplier=str(p.get("supplier") or "").strip()
        po=str(p.get("po") or "").strip()
        supplier_ref=" / ".join(x for x in (supplier,po) if x)
        inv_id=str(p.get("inventoryRecordId") or "").strip()
        product_id=str(p.get("productId") or "").strip()
        location=str(p.get("location") or "").strip()
        m=ARROW_RE.search(impact)

        has_inventory_link=bool(inv_id or product_id or location or m)
        if WORK_ONLY_RE.search(impact) and not has_inventory_link:
            legacy_work_only+=1
            legacy_ids.append(rid)
            continue

        if not (
            str(p.get("impactApplied") or "").lower()=="true"
            and qty is not None and qty>0
            and u is not None
            and supplier_ref
            and inv_id and location and m
        ):
            ambiguous.append(rid)
            continue

        before=dec(m.group(1)); after=dec(m.group(2))
        if before is None or after is None or before-qty!=after:
            arithmetic.append(rid)
            continue

        strict_replay+=1
        stock=setup(a.tenant,a.actor,u,location,rid,before)
        command=str(uuid.uuid5(NS,"command:"+rid))
        first=call_engine(a.tenant,a.actor,command,stock,qty,supplier_ref,rid)
        s1=state(a.tenant,command,stock)
        second=call_engine(a.tenant,a.actor,command,stock,qty,supplier_ref,rid)
        s2=state(a.tenant,command,stock)

        if (
            first.get("status")!="committed"
            or dec(first.get("before"))!=before
            or dec(first.get("returned_to_supplier"))!=qty
            or dec(first.get("remaining"))!=after
            or dec(s1.get("qty"))!=after
            or int(s1.get("version",-1))!=2
            or s1.get("lifecycle")!=("consumed" if after==0 else "active")
        ):
            engine.append(rid)
        if second!=first or s2!=s1:
            replay.append(rid)
        if int(s2.get("commands",-1))!=1 or int(s2.get("movements",-1))!=1 or int(s2.get("events",-1))!=1:
            ledger.append(rid)

    stops=[]
    if ambiguous: stops.append("V6_SUPPLIER_RETURN_AMBIGUOUS_INVENTORY_EVIDENCE")
    if arithmetic: stops.append("V6_SUPPLIER_RETURN_ARITHMETIC_MISMATCH")
    if engine: stops.append("V7_SUPPLIER_RETURN_ENGINE_MISMATCH")
    if replay: stops.append("V7_SUPPLIER_RETURN_REPLAY_MISMATCH")
    if ledger: stops.append("V7_SUPPLIER_RETURN_LEDGER_CARDINALITY_MISMATCH")

    report={
      "mode":"V7_SUPPLIER_RETURN_SHADOW_AUDIT",
      "production_writes":0,
      "source_integrity":{
        "snapshot_md5":integ.get("snapshot_md5"),
        "total_live_rows":int(integ.get("total_live_rows",-1)),
        "postgres_jsonb_text_verified":True
      },
      "observed":{
        "completed_return_to_supplier_rows":candidates,
        "legacy_work_record_only_rows":legacy_work_only,
        "strict_inventory_replay_rows":strict_replay
      },
      "validation":{
        "legacy_work_records_not_invented_into_inventory":legacy_work_only,
        "strict_source_arithmetic_pass":strict_replay-len(arithmetic),
        "v7_supplier_return_engine_pass":strict_replay-len(engine),
        "same_command_replay_pass":strict_replay-len(replay),
        "one_command_one_movement_one_event_pass":strict_replay-len(ledger)
      },
      "legacy_work_only_record_ids":legacy_ids[:25],
      "failure_record_ids":{
        "ambiguous":ambiguous[:25],
        "arithmetic":arithmetic[:25],
        "engine":engine[:25],
        "replay":replay[:25],
        "ledger":ledger[:25]
      },
      "stop_reasons":stops,
      "verdict":"SHADOW_PASS" if not stops else "STOP"
    }
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
    if stops: raise SystemExit(1)
    print("V7 SUPPLIER RETURN SHADOW AUDIT: PASS")

if __name__=="__main__":
    main()
