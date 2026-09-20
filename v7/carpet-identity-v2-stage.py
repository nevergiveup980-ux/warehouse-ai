#!/usr/bin/env python3
"""Stage Carpet Identity V2 reconciliation into disposable V7 migration quarantine.

This never writes operational carpet inventory. It stages accepted physical-instance
candidates and conflicts so read-only Inventory Command Center views can use the
warehouse's company roll-number identity rules before cutover.
"""
import argparse, hashlib, json, os, subprocess, uuid

DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}"
ENV=os.environ.copy()
ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))

def run(sql,check=True):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-At"],input=sql,text=True,capture_output=True,env=ENV)
    if check and r.returncode!=0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r

def value(sql):
    r=run(sql)
    lines=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return lines[-1] if lines else ""

def q(v):
    return "'" + str(v).replace("'","''") + "'"

def j(v):
    return q(json.dumps(v,separators=(",",":"),ensure_ascii=False))+"::jsonb"

def ensure_disposable():
    name=value("select current_database();")
    if name!="warehouse_v7_test":
        raise RuntimeError(f"CARPET_IDENTITY_STAGE_REFUSES_DATABASE:{name}")

def table_counts(tenant):
    raw=value(f"""
      select jsonb_build_object(
        'commands',(select count(*) from warehouse_v7.command where tenant_id={q(tenant)}::uuid),
        'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id={q(tenant)}::uuid),
        'carpet_rolls',(select count(*) from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid)
      )::text;
    """)
    return json.loads(raw)

def conflict_key(c):
    raw=json.dumps(c,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
    return hashlib.md5(raw).hexdigest()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("identity_report")
    ap.add_argument("--tenant",required=True)
    ap.add_argument("--actor",required=True)
    ap.add_argument("--report",default="/tmp/v7-carpet-identity-v2-stage-report.json")
    args=ap.parse_args()
    uuid.UUID(args.tenant);uuid.UUID(args.actor)
    ensure_disposable()

    with open(args.identity_report,encoding="utf-8") as fh:
        src=json.load(fh)
    if src.get("mode")!="V7_CARPET_IDENTITY_V2_REHEARSAL":
        raise RuntimeError("CARPET_IDENTITY_V2_REPORT_REQUIRED")
    if src.get("production_writes")!=0:
        raise RuntimeError("CARPET_IDENTITY_V2_SOURCE_NOT_READ_ONLY")

    run(f"""
      insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(args.tenant)}::uuid,{q(args.actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
    """)
    before=table_counts(args.tenant)

    blocks=[f"set request.jwt.claim.sub={q(args.actor)};"]
    for item in src.get("physical_instances") or []:
        legacy=str(item.get("legacy_instance_id") or "").strip()
        roll=str(item.get("company_roll_number") or "").strip().upper()
        if not legacy or not roll:
            raise RuntimeError("CARPET_IDENTITY_V2_INSTANCE_REQUIRED_FIELDS")
        source_id="INSTANCE:"+legacy
        normalized={
          "legacy_instance_id":legacy,
          "company_roll_number":roll,
          "shared_legacy_roll_number":bool(item.get("shared_legacy_roll_number")),
          "selected_source_record_id":item.get("selected_source_record_id"),
          "collapsed_source_record_ids":item.get("collapsed_source_record_ids") or [],
          "source_row_count":item.get("source_row_count"),
          "current_state":item.get("current_state") or {},
          "references":item.get("references") or {}
        }
        blocks.append(f"""do $stage$
declare sid uuid;
begin
  sid:=warehouse_v7.stage_legacy_record(
    {q(args.tenant)}::uuid,'derived_carpet_identity_v7',{q(source_id)},{j(item)},{j(normalized)}
  );
  perform warehouse_v7.classify_legacy_record(
    {q(args.tenant)}::uuid,sid,'valid','CARPET_IDENTITY_V2_READY',{q(args.actor)}::uuid
  );
end
$stage$;""")

    for conflict in src.get("conflicts") or []:
        ctype=str(conflict.get("type") or "CARPET_IDENTITY_V2_CONFLICT").strip().upper()
        legacy=str(conflict.get("legacy_instance_id") or "").strip()
        source_id="CONFLICT:"+ctype+":"+(legacy or conflict_key(conflict))
        normalized={
          "legacy_instance_id":legacy or None,
          "company_roll_number":None,
          "roll_numbers":conflict.get("roll_numbers") or [],
          "conflict_type":ctype,
          "source_record_ids":conflict.get("source_record_ids") or []
        }
        blocks.append(f"""do $stage$
declare sid uuid;
begin
  sid:=warehouse_v7.stage_legacy_record(
    {q(args.tenant)}::uuid,'derived_carpet_identity_v7',{q(source_id)},{j(conflict)},{j(normalized)}
  );
  perform warehouse_v7.classify_legacy_record(
    {q(args.tenant)}::uuid,sid,'conflict',{q(ctype)},{q(args.actor)}::uuid
  );
end
$stage$;""")

    run("\n".join(blocks))
    after=table_counts(args.tenant)
    if after!=before:
        raise RuntimeError(f"CARPET_IDENTITY_STAGE_TOUCHED_OPERATIONAL_INVENTORY:before={before}:after={after}")

    staged=json.loads(value(f"""
      select jsonb_build_object(
        'valid',count(*) filter(where classification='valid'),
        'conflict',count(*) filter(where classification='conflict')
      )::text
      from warehouse_v7.migration_staging
      where tenant_id={q(args.tenant)}::uuid
        and source_dataset='derived_carpet_identity_v7';
    """))
    expected_valid=int((src.get("counts") or {}).get("accepted_physical_instances") or 0)
    expected_conflict=int((src.get("counts") or {}).get("conflict_groups") or 0)
    if int(staged.get("valid") or 0)!=expected_valid or int(staged.get("conflict") or 0)!=expected_conflict:
        raise RuntimeError(f"CARPET_IDENTITY_STAGE_COUNT_MISMATCH:{staged}")

    out={
      "mode":"V7_CARPET_IDENTITY_V2_DISPOSABLE_STAGE",
      "production_writes":0,
      "operational_inventory_writes":0,
      "tenant":args.tenant,
      "source_counts":src.get("counts") or {},
      "staged":{"valid":int(staged.get("valid") or 0),"conflict":int(staged.get("conflict") or 0)},
      "operational_before":before,
      "operational_after":after,
      "pass":True
    }
    with open(args.report,"w",encoding="utf-8") as fh:
        json.dump(out,fh,indent=2,ensure_ascii=False);fh.write("\n")
    print(json.dumps(out,indent=2,ensure_ascii=False))
    print("V7 CARPET IDENTITY V2 DISPOSABLE STAGE: PASS")

if __name__=="__main__":
    main()
