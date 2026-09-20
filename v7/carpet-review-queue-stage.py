#!/usr/bin/env python3
"""Stage Carpet Identity V2 operational-readiness deferrals into a read-only review queue.

This is engineering-only:
- refuses every database except warehouse_v7_test
- stages review evidence only in migration_staging
- never creates/updates carpet_roll, command, movement, or event rows
"""
import argparse,json,os,subprocess,uuid

DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}"
ENV=os.environ.copy();ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))

def run(sql,check=True):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-At"],input=sql,text=True,capture_output=True,env=ENV)
    if check and r.returncode!=0: raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r

def value(sql):
    r=run(sql)
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return xs[-1] if xs else ""

def q(v): return "'" + str(v).replace("'","''") + "'"
def j(v): return q(json.dumps(v,separators=(",",":"),ensure_ascii=False))+"::jsonb"

def ensure_disposable():
    name=value("select current_database();")
    if name!="warehouse_v7_test":
        raise RuntimeError(f"CARPET_REVIEW_STAGE_REFUSES_DATABASE:{name}")

def operational_counts(tenant):
    raw=value(f"""
      select jsonb_build_object(
        'carpet_rolls',(select count(*) from warehouse_v7.carpet_roll where tenant_id={q(tenant)}::uuid),
        'commands',(select count(*) from warehouse_v7.command where tenant_id={q(tenant)}::uuid),
        'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id={q(tenant)}::uuid),
        'events',(select count(*) from warehouse_v7.event where tenant_id={q(tenant)}::uuid)
      )::text;
    """)
    return json.loads(raw)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("identity_report")
    ap.add_argument("operational_report")
    ap.add_argument("--tenant",required=True)
    ap.add_argument("--actor",required=True)
    ap.add_argument("--report",required=True)
    args=ap.parse_args()
    uuid.UUID(args.tenant);uuid.UUID(args.actor);ensure_disposable()

    identity=json.load(open(args.identity_report,encoding="utf-8"))
    op=json.load(open(args.operational_report,encoding="utf-8"))
    if identity.get("mode")!="V7_CARPET_IDENTITY_V2_REHEARSAL" or identity.get("production_writes")!=0:
        raise RuntimeError("CARPET_IDENTITY_V2_READ_ONLY_REPORT_REQUIRED")
    if op.get("mode")!="V7_CARPET_IDENTITY_V2_OPERATIONAL_REHEARSAL" or op.get("production_writes")!=0:
        raise RuntimeError("CARPET_OPERATIONAL_V2_READ_ONLY_REPORT_REQUIRED")

    by_alias={str(x.get("legacy_instance_id") or "").strip():x for x in identity.get("physical_instances") or []}
    deferred=op.get("deferred") or []

    run(f"""
      insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(args.tenant)}::uuid,{q(args.actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
    """)
    before=operational_counts(args.tenant)

    blocks=[f"set request.jwt.claim.sub={q(args.actor)};"]
    expected=[]
    for d in deferred:
        alias=str(d.get("legacy_instance_id") or "").strip()
        roll=str(d.get("company_roll_number") or "").strip().upper()
        reasons=sorted(set(str(x).strip().upper() for x in (d.get("reasons") or []) if str(x).strip()))
        base=by_alias.get(alias) or {}
        state=base.get("current_state") or {}
        normalized={
          "legacy_instance_id":alias or None,
          "company_roll_number":roll or None,
          "shared_legacy_roll_number":bool(base.get("shared_legacy_roll_number")),
          "reasons":reasons,
          "current_state":{
            "collection":state.get("collection"),
            "colour":state.get("colour"),
            "location":state.get("location"),
            "length":state.get("length"),
            "original_length":state.get("original_length"),
            "measure":state.get("measure")
          }
        }
        if not alias or not roll or not reasons:
            raise RuntimeError("CARPET_REVIEW_REQUIRED_FIELDS")
        source_id="REVIEW:"+alias
        expected.append((source_id,reasons))
        blocks.append(f"""do $review$
declare sid uuid; cls text;
begin
  sid:=warehouse_v7.stage_legacy_record(
    {q(args.tenant)}::uuid,'derived_carpet_review_v7',{q(source_id)},{j(d)},{j(normalized)});
  select classification into cls from warehouse_v7.migration_staging where tenant_id={q(args.tenant)}::uuid and id=sid;
  if cls='unreviewed' then
    perform warehouse_v7.classify_legacy_record(
      {q(args.tenant)}::uuid,sid,'deferred',{q("|".join(reasons))},{q(args.actor)}::uuid);
  elsif cls<>'deferred' then
    raise exception 'CARPET_REVIEW_STAGE_INVALID:%',cls;
  end if;
end $review$;""")

    run("\n".join(blocks))
    after=operational_counts(args.tenant)
    if after!=before:
        raise RuntimeError(f"CARPET_REVIEW_STAGE_TOUCHED_OPERATIONAL_TABLES:before={before}:after={after}")

    staged=json.loads(value(f"""
      select jsonb_build_object(
        'count',count(*),
        'reason_counts',coalesce((
          select jsonb_object_agg(reason,n order by reason) from (
            select reason,count(*) n
            from warehouse_v7.migration_staging m2
            cross join lateral jsonb_array_elements_text(coalesce(m2.normalized_payload->'reasons','[]'::jsonb)) reason
            where m2.tenant_id={q(args.tenant)}::uuid
              and m2.source_dataset='derived_carpet_review_v7'
              and m2.classification='deferred'
            group by reason
          ) z
        ),'{{}}'::jsonb)
      )::text
      from warehouse_v7.migration_staging
      where tenant_id={q(args.tenant)}::uuid
        and source_dataset='derived_carpet_review_v7'
        and classification='deferred';
    """))
    if int(staged.get("count") or 0)!=len(expected):
        raise RuntimeError(f"CARPET_REVIEW_STAGE_COUNT_MISMATCH:{staged}")

    out={
      "mode":"V7_CARPET_REVIEW_QUEUE_STAGE",
      "production_writes":0,
      "operational_inventory_writes":0,
      "tenant":args.tenant,
      "identity_conflicts":int((identity.get("counts") or {}).get("conflict_groups") or 0),
      "operational_deferred":len(expected),
      "review_total":int((identity.get("counts") or {}).get("conflict_groups") or 0)+len(expected),
      "reason_counts":staged.get("reason_counts") or {},
      "operational_before":before,
      "operational_after":after,
      "pass":True
    }
    with open(args.report,"w",encoding="utf-8") as f:
        json.dump(out,f,indent=2,ensure_ascii=False);f.write("\n")
    print(json.dumps(out,indent=2,ensure_ascii=False))
    print("V7 CARPET REVIEW QUEUE STAGE: PASS")

if __name__=="__main__": main()
