#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 Carpet Transfer + Return shadow replay.

Consumes the sanitized V6 operation feed and replays:
- whole carpet-roll Warehouse -> Store transfers,
- partial carpet-piece transfers that create a child roll,
- cut-piece / installer carpet returns that create a new TM child roll.

Everything runs against Disposable Postgres. Production writes are impossible.
"""
import argparse,json,os,re,subprocess,uuid
from decimal import Decimal,InvalidOperation,ROUND_HALF_UP
from pathlib import Path

DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=(f"host={os.environ.get('PGHOST','localhost')} "
      f"port={os.environ.get('PGPORT','5432')} dbname={DB} "
      f"user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
ENV=os.environ.copy(); ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("c3c3b5be-57d5-459e-88d7-c99bd0b7c2fd")
PARTIAL_RE=re.compile(r'transferred from Roll\s+(\S+)\s+to\s+\S+\s+as\s+(\S+)\s+.+?source\s+([0-9]+)\'([0-9]+)\"\s*→\s*([0-9]+)\'([0-9]+)\"',re.I)
RETURN_LEN_RE=re.compile(r':\s*([0-9]+)\'(?:([0-9]+)\")?',re.I)

def run(sql,ok=True):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-Atc",sql],text=True,capture_output=True,env=ENV)
    if ok and r.returncode!=0: raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r

def value(r):
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return xs[-1] if xs else ""

def q(v): return "'" + str(v).replace("'","''") + "'"

def units(v):
    try: d=Decimal(str(v).strip())
    except (InvalidOperation,AttributeError): return None
    if not d.is_finite() or d<0: return None
    return int((d*Decimal(192)).quantize(Decimal("1"),rounding=ROUND_HALF_UP))

def fi_units(feet,inches):
    return int(feet)*192+int(inches or 0)*16

def ensure_disposable():
    name=value(run("select current_database();"))
    if name!="warehouse_v7_test": raise RuntimeError("SHADOW_REFUSES_DATABASE:"+name)

def common(tenant,actor,tag,src_code,dst_code=None):
    product=str(uuid.uuid5(NS,"product:"+tag))
    src_loc=str(uuid.uuid5(NS,"location:"+src_code))
    dst_loc=str(uuid.uuid5(NS,"location:"+(dst_code or src_code)))
    vals=[f"({q(tenant)}::uuid,{q(src_loc)}::uuid,{q('CSH:'+src_code)},'rack','active')"]
    if dst_loc!=src_loc:
        vals.append(f"({q(tenant)}::uuid,{q(dst_loc)}::uuid,{q('CSH:'+str(dst_code))},'external','active')")
    run(f"""
      insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(tenant)}::uuid,{q(actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
      insert into warehouse_v7.product(
        tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle
      ) values(
        {q(tenant)}::uuid,{q(product)}::uuid,{q('CARPET-SHADOW:'+tag)},
        {q('Carpet Shadow '+tag)},'1/16_IN','1/16_IN','active'
      ) on conflict(tenant_id,id) do nothing;
      insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
      values {','.join(vals)}
      on conflict(tenant_id,id) do nothing;
    """)
    return product,src_loc,dst_loc

def seed_roll(tenant,roll_id,roll_number,product,location,remain,measure="TM",source_roll=None):
    run(f"""
      insert into warehouse_v7.carpet_roll(
        tenant_id,id,roll_number,physical_key,source_roll,product_id,location_id,
        original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle
      ) values(
        {q(tenant)}::uuid,{q(roll_id)}::uuid,{q(roll_number)},{q('shadow:'+roll_id)},
        {('null' if source_roll is None else q(source_roll))},
        {q(product)}::uuid,{q(location)}::uuid,{int(remain)},{int(remain)},
        {q(measure)},1,'active'
      );
    """)

def transfer_state(tenant,command,source,child=None):
    child_expr="null"
    if child:
        child_expr=f"""jsonb_build_object(
          'remaining',(select remaining_sixteenths from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and id={q(child)}::uuid),
          'version',(select version from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and id={q(child)}::uuid),
          'measure',(select measure_status from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and id={q(child)}::uuid),
          'source_roll',(select source_roll from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and id={q(child)}::uuid),
          'location',(select location_id::text from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and id={q(child)}::uuid)
        )"""
    return json.loads(value(run(f"""
      select jsonb_build_object(
        'command_count',(select count(*) from warehouse_v7.command where tenant_id={q(tenant)}::uuid and id={q(command)}::uuid),
        'movement_count',(select count(*) from warehouse_v7.inventory_movement where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
        'event_count',(select count(*) from warehouse_v7.event where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
        'source_remaining',(select remaining_sixteenths from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and id={q(source)}::uuid),
        'source_version',(select version from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and id={q(source)}::uuid),
        'source_location',(select location_id::text from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and id={q(source)}::uuid),
        'child',{child_expr}
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
    if integ.get("postgres_jsonb_text_verified") is not True: raise RuntimeError("OPERATION_SHADOW_NOT_VERIFIED")

    whole=partial=returns=0
    transfer_fail=[]; return_fail=[]; replay_fail=[]; ledger_fail=[]; evidence_fail=[]

    for row in rows:
        p=row.get("payload") or {}
        rid=str(row.get("record_id") or "")
        if p.get("status")!="Completed" or str(p.get("impactApplied") or "").lower()!="true":
            continue

        # Carpet transfer.
        if p.get("type")=="Inventory Transfer" and str(p.get("unit") or "").lower()=="foot":
            qty=units(p.get("quantity")); roll_number=str(p.get("roll") or "").strip()
            if not qty or not roll_number:
                evidence_fail.append(rid); continue
            impact=str(p.get("impactResult") or "")
            src_code=str(p.get("location") or "WAREHOUSE").strip() or "WAREHOUSE"
            dst_code=str(p.get("toLocation") or "STORE").strip() or "STORE"
            product,src_loc,dst_loc=common(a.tenant,a.actor,"transfer-"+rid,src_code,dst_code)
            source_id=str(uuid.uuid5(NS,"source:"+rid))
            command=str(uuid.uuid5(NS,"command:"+rid))
            m=PARTIAL_RE.search(impact)

            if m:
                partial+=1
                parsed_source,child_number,bf,bi,af,ai=m.groups()
                before=fi_units(bf,bi); after=fi_units(af,ai)
                if parsed_source!=roll_number or before-qty!=after:
                    evidence_fail.append(rid); continue
                child_id=str(uuid.uuid5(NS,"child:"+rid))
                seed_roll(a.tenant,source_id,roll_number,product,src_loc,before,"TM")
                def call():
                    return json.loads(value(run(f"""
                      set request.jwt.claim.sub={q(a.actor)};
                      select warehouse_v7.transfer_carpet_piece(
                        {q(a.tenant)}::uuid,{q(command)}::uuid,{q(source_id)}::uuid,1,
                        {q(child_id)}::uuid,{q(child_number)},{qty},{q(dst_loc)}::uuid,
                        jsonb_build_object('shadow_mode',true,'source_record_id',{q(rid)}),
                        {q(a.actor)}::uuid,'V7_CARPET_TRANSFER_SHADOW'
                      )::text;
                    """)))
                first=call(); s1=transfer_state(a.tenant,command,source_id,child_id)
                second=call(); s2=transfer_state(a.tenant,command,source_id,child_id)
                ch=s1.get("child") or {}
                if (first.get("status")!="committed"
                    or int(first.get("source_before_sixteenths",-1))!=before
                    or int(first.get("transferred_sixteenths",-1))!=qty
                    or int(first.get("source_remaining_sixteenths",-1))!=after
                    or int(s1.get("source_remaining",-1))!=after
                    or int(ch.get("remaining",-1))!=qty
                    or ch.get("source_roll")!=roll_number
                    or ch.get("measure")!="TM"
                    or ch.get("location")!=dst_loc):
                    transfer_fail.append(rid)
                if second!=first or s2!=s1: replay_fail.append(rid)
                if int(s2.get("command_count",-1))!=1 or int(s2.get("movement_count",-1))!=2 or int(s2.get("event_count",-1))!=2:
                    ledger_fail.append(rid)
            else:
                whole+=1
                seed_roll(a.tenant,source_id,roll_number,product,src_loc,qty,"TM")
                def call():
                    return json.loads(value(run(f"""
                      set request.jwt.claim.sub={q(a.actor)};
                      select warehouse_v7.transfer_carpet_roll(
                        {q(a.tenant)}::uuid,{q(command)}::uuid,{q(source_id)}::uuid,1,
                        {q(dst_loc)}::uuid,
                        jsonb_build_object('shadow_mode',true,'source_record_id',{q(rid)}),
                        {q(a.actor)}::uuid,'V7_CARPET_TRANSFER_SHADOW'
                      )::text;
                    """)))
                first=call(); s1=transfer_state(a.tenant,command,source_id)
                second=call(); s2=transfer_state(a.tenant,command,source_id)
                if (first.get("status")!="committed"
                    or int(first.get("remaining_sixteenths",-1))!=qty
                    or int(s1.get("source_remaining",-1))!=qty
                    or s1.get("source_location")!=dst_loc
                    or int(s1.get("source_version",-1))!=2):
                    transfer_fail.append(rid)
                if second!=first or s2!=s1: replay_fail.append(rid)
                if int(s2.get("command_count",-1))!=1 or int(s2.get("movement_count",-1))!=1 or int(s2.get("event_count",-1))!=1:
                    ledger_fail.append(rid)

        # Carpet piece return.
        if p.get("type") in ("Cut Piece Return","Installer Return") and str(p.get("unit") or "").lower()=="foot":
            returns+=1
            qty=units(p.get("quantity"))
            source_number=str(p.get("roll") or "").strip()
            child_number=str(p.get("returnedChildRoll") or "").strip()
            impact=str(p.get("impactResult") or "")
            rm=RETURN_LEN_RE.search(impact)
            if not qty or not source_number or not child_number or not rm or fi_units(rm.group(1),rm.group(2))!=qty:
                evidence_fail.append(rid); continue

            loc_code=str(p.get("location") or "RETURN").strip() or "RETURN"
            product,loc,_=common(a.tenant,a.actor,"return-"+rid,loc_code)
            source_id=str(uuid.uuid5(NS,"return-source:"+rid))
            child_id=str(uuid.uuid5(NS,"return-child:"+rid))
            out_cmd=str(uuid.uuid5(NS,"return-out:"+rid))
            command=str(uuid.uuid5(NS,"return-command:"+rid))
            source_remain=max(qty*2,qty+192)
            seed_roll(a.tenant,source_id,source_number,product,loc,source_remain,"CAL")
            run(f"""
              insert into warehouse_v7.command(
                tenant_id,id,command_type,entity_type,entity_id,payload,payload_fingerprint,status,actor_id,device_id
              ) values(
                {q(a.tenant)}::uuid,{q(out_cmd)}::uuid,'CARPET_OUT_FIXTURE','carpet_roll',{q(source_id)}::uuid,
                jsonb_build_object('shadow_fixture',true),'fixture','committed',
                {q(a.actor)}::uuid,'V7_CARPET_RETURN_FIXTURE'
              );
              insert into warehouse_v7.inventory_movement(
                tenant_id,command_id,product_id,carpet_roll_id,movement_type,quantity,unit,from_location_id
              ) values(
                {q(a.tenant)}::uuid,{q(out_cmd)}::uuid,{q(product)}::uuid,{q(source_id)}::uuid,
                'CARPET_OUT',{qty},'1/16_IN',{q(loc)}::uuid
              );
            """)
            def call():
                return json.loads(value(run(f"""
                  set request.jwt.claim.sub={q(a.actor)};
                  select warehouse_v7.return_carpet_piece(
                    {q(a.tenant)}::uuid,{q(command)}::uuid,{q(source_id)}::uuid,
                    {q(child_id)}::uuid,{q(child_number)},{qty},{q(loc)}::uuid,{q(out_cmd)}::uuid,
                    jsonb_build_object('shadow_mode',true,'source_record_id',{q(rid)}),
                    {q(a.actor)}::uuid,'V7_CARPET_RETURN_SHADOW'
                  )::text;
                """)))
            first=call(); s1=transfer_state(a.tenant,command,source_id,child_id)
            second=call(); s2=transfer_state(a.tenant,command,source_id,child_id)
            ch=s1.get("child") or {}
            if (first.get("status")!="committed"
                or int(first.get("returned_sixteenths",-1))!=qty
                or int(s1.get("source_remaining",-1))!=source_remain
                or int(s1.get("source_version",-1))!=1
                or int(ch.get("remaining",-1))!=qty
                or ch.get("source_roll")!=source_number
                or ch.get("measure")!="TM"
                or ch.get("location")!=loc):
                return_fail.append(rid)
            if second!=first or s2!=s1: replay_fail.append(rid)
            if int(s2.get("command_count",-1))!=1 or int(s2.get("movement_count",-1))!=1 or int(s2.get("event_count",-1))!=1:
                ledger_fail.append(rid)

    stops=[]
    if evidence_fail: stops.append("V6_CARPET_EVIDENCE_MISMATCH")
    if transfer_fail: stops.append("V7_CARPET_TRANSFER_ENGINE_MISMATCH")
    if return_fail: stops.append("V7_CARPET_RETURN_ENGINE_MISMATCH")
    if replay_fail: stops.append("V7_CARPET_REPLAY_MISMATCH")
    if ledger_fail: stops.append("V7_CARPET_LEDGER_CARDINALITY_MISMATCH")
    if whole+partial!=4: stops.append("EXPECTED_FOUR_CARPET_TRANSFERS")
    if returns!=4: stops.append("EXPECTED_FOUR_CARPET_RETURNS")

    report={
      "mode":"V7_CARPET_LIFECYCLE_SHADOW_REPLAY","production_writes":0,
      "source_integrity":{"snapshot_md5":integ.get("snapshot_md5"),"total_live_rows":int(integ.get("total_live_rows",-1)),"postgres_jsonb_text_verified":True},
      "observed":{"whole_roll_transfers":whole,"partial_piece_transfers":partial,"carpet_piece_returns":returns},
      "validation":{
        "v6_carpet_evidence_pass":whole+partial+returns-len(evidence_fail),
        "v7_carpet_transfer_pass":whole+partial-len(transfer_fail),
        "v7_carpet_return_pass":returns-len(return_fail),
        "same_command_replay_pass":whole+partial+returns-len(replay_fail),
        "ledger_cardinality_pass":whole+partial+returns-len(ledger_fail)
      },
      "failure_record_ids":{"evidence":evidence_fail[:25],"transfer":transfer_fail[:25],"return":return_fail[:25],"replay":replay_fail[:25],"ledger":ledger_fail[:25]},
      "stop_reasons":stops,"verdict":"SHADOW_PASS" if not stops else "STOP"
    }
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
    if stops: raise SystemExit(1)
    print("V7 CARPET LIFECYCLE SHADOW REPLAY: PASS")

if __name__=="__main__": main()
