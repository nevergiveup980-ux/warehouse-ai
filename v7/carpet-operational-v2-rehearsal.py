#!/usr/bin/env python3
"""Rehearse Carpet Identity V2 as operational warehouse_v7.carpet_roll rows.

Safety:
- refuses every database except warehouse_v7_test
- writes only a caller-supplied disposable tenant
- never connects to Supabase or production
- imports only identity-v2 accepted rows that also pass operational readiness
- manufacturerRoll/sourceRoll remain reference-only
"""
import argparse,hashlib,json,os,subprocess,uuid
from collections import Counter,defaultdict

DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}"
ENV=os.environ.copy(); ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
SHARED={"CHC022","CHC023"}

def run(sql,check=True):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-At"],input=sql,text=True,capture_output=True,env=ENV)
    if check and r.returncode!=0: raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r

def value(sql):
    r=run(sql); xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return xs[-1] if xs else ""

def q(v): return "'" + str(v).replace("'","''") + "'"
def j(v): return q(json.dumps(v,separators=(",",":"),ensure_ascii=False))+"::jsonb"
def k(v): return str(v or "").strip()
def u(v): return k(v).upper()

def ensure_disposable():
    name=value("select current_database();")
    if name!="warehouse_v7_test": raise RuntimeError(f"CARPET_V2_OPERATIONAL_REFUSES_DATABASE:{name}")

def sixteenths(v):
    try: n=float(v)
    except Exception: return None
    return round(n*12*16) if n>=0 else None

def loc_kind(code):
    x=k(code).lower()
    if x=="receiving": return "receiving"
    if x=="receiving / put-away pending": return "receiving_staging"
    if x=="store": return "store"
    if x=="store samples": return "sample_store"
    if x=="ram archive": return "archive"
    return "rack"

def product_key(name,colour):
    raw=(u(name)+"|"+u(colour)).encode()
    return "CARPET_V2_PRODUCT:"+hashlib.sha256(raw).hexdigest()[:24]

def counts(tenant):
    raw=value(f"""
      select jsonb_build_object(
        'products',(select count(*) from warehouse_v7.product where tenant_id={q(tenant)}::uuid and legacy_record_id like 'CARPET_V2_PRODUCT:%'),
        'locations',(select count(*) from warehouse_v7.location where tenant_id={q(tenant)}::uuid),
        'carpet_rolls',(select count(*) from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and legacy_record_id like 'CARPET_V2_INSTANCE:%'),
        'commands',(select count(*) from warehouse_v7.command where tenant_id={q(tenant)}::uuid and command_type='MIGRATION_OPENING_CARPET'),
        'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id={q(tenant)}::uuid and movement_type='OPENING_ROLL_IMPORT'),
        'events',(select count(*) from warehouse_v7.event where tenant_id={q(tenant)}::uuid and event_type='MIGRATED_CARPET_ROLL'),
        'remaining_sixteenths',(select coalesce(sum(remaining_sixteenths),0) from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid and legacy_record_id like 'CARPET_V2_INSTANCE:%')
      )::text;
    """)
    return json.loads(raw)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("snapshot")
    ap.add_argument("identity_report")
    ap.add_argument("--tenant",required=True)
    ap.add_argument("--actor",required=True)
    ap.add_argument("--report",required=True)
    args=ap.parse_args()
    uuid.UUID(args.tenant); uuid.UUID(args.actor); ensure_disposable()

    rows=json.load(open(args.snapshot,encoding="utf-8"))
    identity=json.load(open(args.identity_report,encoding="utf-8"))
    if identity.get("mode")!="V7_CARPET_IDENTITY_V2_REHEARSAL" or identity.get("production_writes")!=0:
        raise RuntimeError("CARPET_IDENTITY_V2_READ_ONLY_REPORT_REQUIRED")

    active_by_alias=defaultdict(list)
    for r in rows:
        if r.get("dataset_key")!="runlu_carpet_inventory_v52" or r.get("deleted_at"): continue
        p=r.get("payload") or {}
        if u(p.get("status"))!="ACTIVE": continue
        alias=k(p.get("id"))
        if alias: active_by_alias[alias].append(r)

    ready=[]; deferred=[]; reason_counts=Counter(); products={}; locations={}
    for item in identity.get("physical_instances") or []:
        alias=k(item.get("legacy_instance_id")); roll=u(item.get("company_roll_number"))
        s=item.get("current_state") or {}; refs=item.get("references") or {}
        name=k(s.get("collection")); colour=k(s.get("colour")); loc=k(s.get("location")); measure=u(s.get("measure"))
        original=sixteenths(s.get("original_length")); remaining=sixteenths(s.get("length"))
        reasons=[]
        if not alias or not roll: reasons.append("IDENTITY_REQUIRED")
        if not name: reasons.append("PRODUCT_NAME_MISSING")
        if not loc: reasons.append("LOCATION_MISSING")
        if measure not in ("FULL","CAL","TM"): reasons.append("MEASURE_REVIEW")
        if original is None or remaining is None or original<=0 or remaining<=0 or remaining>original:
            reasons.append("MEASURE_INVALID")
        elif measure=="FULL" and remaining!=original:
            reasons.append("FULL_MISMATCH")

        labels={
          (u((r.get("payload") or {}).get("collection")),u((r.get("payload") or {}).get("colour")))
          for r in active_by_alias.get(alias,[])
        }
        labels.discard(("",""))
        if len(labels)>1: reasons.append("PRODUCT_LABEL_HISTORY_VARIANT")

        if reasons:
            reasons=sorted(set(reasons))
            for reason in reasons: reason_counts[reason]+=1
            deferred.append({"legacy_instance_id":alias,"company_roll_number":roll,"reasons":reasons})
            continue

        pk=product_key(name,colour)
        products.setdefault(pk,{"source_record_id":pk,"name":name,"colour":colour or None})
        locations.setdefault(loc,{"source_record_id":"LOC:"+loc,"code":loc,"kind":loc_kind(loc)})
        ready.append({
          "legacy_instance_id":alias,
          "company_roll_number":roll,
          "shared_legacy_roll_number":bool(item.get("shared_legacy_roll_number")),
          "product_legacy_record_id":pk,
          "location_code":loc,
          "measure_status":measure,
          "original_sixteenths":original,
          "remaining_sixteenths":remaining,
          "manufacturer_roll":k(refs.get("manufacturer_roll")) or None,
          "source_roll":k(refs.get("source_roll")) or None
        })

    by_roll=defaultdict(list)
    for x in ready: by_roll[x["company_roll_number"]].append(x["legacy_instance_id"])
    illegal={roll:ids for roll,ids in by_roll.items() if len(ids)>1 and roll not in SHARED}
    if illegal: raise RuntimeError("CARPET_V2_ORDINARY_ROLL_CARDINALITY:"+json.dumps(illegal,sort_keys=True))

    run(f"""
      insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(args.tenant)}::uuid,{q(args.actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
    """)
    before=counts(args.tenant)
    blocks=[f"set request.jwt.claim.sub={q(args.actor)};"]

    for p in sorted(products.values(),key=lambda x:x["source_record_id"]):
        payload={"name":p["name"],"colour":p["colour"],"base_unit":"1/16_IN","coverage_unit":None,"lifecycle":"active"}
        blocks.append(f"""do $v2product$
declare sid uuid; cls text;
begin
  sid:=warehouse_v7.stage_legacy_record(
    {q(args.tenant)}::uuid,'derived_carpet_product_v6',{q(p["source_record_id"])},{j(payload)},{j(payload)});
  select classification into cls from warehouse_v7.migration_staging where tenant_id={q(args.tenant)}::uuid and id=sid;
  if cls='unreviewed' then
    perform warehouse_v7.classify_legacy_record({q(args.tenant)}::uuid,sid,'valid','CARPET_V2_EXACT_LABEL_PRODUCT',{q(args.actor)}::uuid);
    cls:='valid';
  end if;
  if cls='valid' then perform warehouse_v7.import_valid_product({q(args.tenant)}::uuid,sid,{q(args.actor)}::uuid);
  elsif cls<>'imported' then raise exception 'CARPET_V2_PRODUCT_STAGE_INVALID:%',cls; end if;
end $v2product$;""")

    for l in sorted(locations.values(),key=lambda x:x["code"]):
        payload={"code":l["code"],"kind":l["kind"],"lifecycle":"active"}
        blocks.append(f"""do $v2location$
declare sid uuid; cls text;
begin
  sid:=warehouse_v7.stage_legacy_record(
    {q(args.tenant)}::uuid,'derived_location_v6',{q(l["source_record_id"])},{j(payload)},{j(payload)});
  select classification into cls from warehouse_v7.migration_staging where tenant_id={q(args.tenant)}::uuid and id=sid;
  if cls='unreviewed' then
    perform warehouse_v7.classify_legacy_record({q(args.tenant)}::uuid,sid,'valid','CARPET_V2_LOCATION_READY',{q(args.actor)}::uuid);
    cls:='valid';
  end if;
  if cls='valid' then perform warehouse_v7.import_valid_location({q(args.tenant)}::uuid,sid,{q(args.actor)}::uuid);
  elsif cls<>'imported' then raise exception 'CARPET_V2_LOCATION_STAGE_INVALID:%',cls; end if;
end $v2location$;""")

    for x in sorted(ready,key=lambda x:(x["company_roll_number"],x["legacy_instance_id"])):
        source_id="CARPET_V2_INSTANCE:"+x["legacy_instance_id"]
        normalized={
          "product_legacy_record_id":x["product_legacy_record_id"],
          "location_code":x["location_code"],
          "roll_number":x["company_roll_number"],
          "physical_key":"legacy_instance:"+x["legacy_instance_id"],
          "manufacturer_roll":x["manufacturer_roll"],
          "source_roll":x["source_roll"],
          "original_sixteenths":x["original_sixteenths"],
          "remaining_sixteenths":x["remaining_sixteenths"],
          "measure_status":x["measure_status"]
        }
        source_payload={
          "legacy_instance_id":x["legacy_instance_id"],
          "company_roll_number":x["company_roll_number"],
          "shared_legacy_roll_number":x["shared_legacy_roll_number"],
          "references":{"manufacturer_roll":x["manufacturer_roll"],"source_roll":x["source_roll"]}
        }
        blocks.append(f"""do $v2roll$
declare sid uuid; cls text;
begin
  sid:=warehouse_v7.stage_legacy_record(
    {q(args.tenant)}::uuid,'derived_carpet_roll_v6',{q(source_id)},{j(source_payload)},{j(normalized)});
  select classification into cls from warehouse_v7.migration_staging where tenant_id={q(args.tenant)}::uuid and id=sid;
  if cls='unreviewed' then
    perform warehouse_v7.classify_legacy_record({q(args.tenant)}::uuid,sid,'valid','CARPET_IDENTITY_V2_OPERATIONAL_READY',{q(args.actor)}::uuid);
    cls:='valid';
  end if;
  if cls='valid' then perform warehouse_v7.import_valid_carpet_roll({q(args.tenant)}::uuid,sid,{q(args.actor)}::uuid);
  elsif cls<>'imported' then raise exception 'CARPET_V2_ROLL_STAGE_INVALID:%',cls; end if;
end $v2roll$;""")

    run("\n".join(blocks))
    after=counts(args.tenant)
    new={k:int(after[k])-int(before[k]) for k in ("products","locations","carpet_rolls","commands","movements","events")}

    ordinary_duplicate_groups=int(value(f"""
      select count(*) from (
        select upper(btrim(roll_number)) roll_number,count(*) n
        from warehouse_v7.carpet_roll
        where tenant_id={q(args.tenant)}::uuid
          and legacy_record_id like 'CARPET_V2_INSTANCE:%'
          and upper(btrim(roll_number)) not in ('CHC022','CHC023')
        group by upper(btrim(roll_number)) having count(*)>1
      ) x;
    """) or 0)
    shared=json.loads(value(f"""
      select jsonb_build_object(
        'CHC022',(select count(*) from warehouse_v7.carpet_roll where tenant_id={q(args.tenant)}::uuid and legacy_record_id like 'CARPET_V2_INSTANCE:%' and upper(btrim(roll_number))='CHC022'),
        'CHC023',(select count(*) from warehouse_v7.carpet_roll where tenant_id={q(args.tenant)}::uuid and legacy_record_id like 'CARPET_V2_INSTANCE:%' and upper(btrim(roll_number))='CHC023')
      )::text;
    """))

    expected_remaining=sum(x["remaining_sixteenths"] for x in ready)
    fingerprint=hashlib.sha256(json.dumps(ready,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    ok=(
      int(after["products"])==len(products)
      and int(after["locations"])==len(locations)
      and int(after["carpet_rolls"])==len(ready)
      and int(after["commands"])==len(ready)
      and int(after["movements"])==len(ready)
      and int(after["events"])==len(ready)
      and int(after["remaining_sixteenths"])==expected_remaining
      and ordinary_duplicate_groups==0
    )
    out={
      "mode":"V7_CARPET_IDENTITY_V2_OPERATIONAL_REHEARSAL",
      "production_writes":0,
      "database":DB,
      "tenant":args.tenant,
      "identity_contract":{
        "physical_identity":"legacy payload.id -> future physicalInstanceId",
        "company_roll_field":"roll_number",
        "manufacturer_roll_role":"reference_only",
        "source_roll_role":"lineage_reference_only",
        "shared_legacy_roll_numbers":sorted(SHARED)
      },
      "source_identity_counts":identity.get("counts") or {},
      "readiness":{
        "ready_physical_instances":len(ready),
        "deferred_physical_instances":len(deferred),
        "reason_counts":dict(sorted(reason_counts.items())),
        "derived_products":len(products),
        "locations":len(locations),
        "shared_ready_instances":sum(1 for x in ready if x["shared_legacy_roll_number"])
      },
      "deferred":deferred,
      "fingerprint":fingerprint,
      "before":before,
      "after":after,
      "new_rows":new,
      "expected_remaining_sixteenths":expected_remaining,
      "ordinary_duplicate_roll_groups":ordinary_duplicate_groups,
      "shared_roll_instances":{"CHC022":int(shared.get("CHC022") or 0),"CHC023":int(shared.get("CHC023") or 0)},
      "pass":ok
    }
    if not ok: raise RuntimeError("CARPET_V2_OPERATIONAL_REHEARSAL_RECONCILIATION_FAILED:"+json.dumps(out,sort_keys=True))
    with open(args.report,"w",encoding="utf-8") as f:
        json.dump(out,f,indent=2,ensure_ascii=False);f.write("\n")
    print(json.dumps({k:out[k] for k in ("mode","production_writes","readiness","new_rows","ordinary_duplicate_roll_groups","shared_roll_instances","pass")},indent=2))
    print("V7 CARPET IDENTITY V2 OPERATIONAL REHEARSAL: PASS")

if __name__=="__main__": main()
