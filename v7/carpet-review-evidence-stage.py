#!/usr/bin/env python3
"""Stage Carpet Review evidence into disposable warehouse_v7_test only."""
import argparse,json,os,subprocess,uuid
DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}"
ENV=os.environ.copy();ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
def run(sql,check=True):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-At"],input=sql,text=True,capture_output=True,env=ENV)
    if check and r.returncode!=0: raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r
def val(sql):
    r=run(sql);xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"];return xs[-1] if xs else ""
def q(v):return "'" + str(v).replace("'","''") + "'"
def j(v):return q(json.dumps(v,separators=(",",":"),ensure_ascii=False))+"::jsonb"
def counts(t):
    return json.loads(val(f"""select jsonb_build_object(
      'carpet_rolls',(select count(*) from warehouse_v7.carpet_roll where tenant_id={q(t)}::uuid),
      'commands',(select count(*) from warehouse_v7.command where tenant_id={q(t)}::uuid),
      'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id={q(t)}::uuid),
      'events',(select count(*) from warehouse_v7.event where tenant_id={q(t)}::uuid)
    )::text;"""))
def main():
    ap=argparse.ArgumentParser();ap.add_argument("evidence_report");ap.add_argument("--tenant",required=True);ap.add_argument("--actor",required=True);ap.add_argument("--report",required=True);args=ap.parse_args()
    uuid.UUID(args.tenant);uuid.UUID(args.actor)
    if DB!="warehouse_v7_test": raise RuntimeError("CARPET_REVIEW_EVIDENCE_STAGE_REFUSES_DATABASE:"+DB)
    src=json.load(open(args.evidence_report,encoding="utf-8"))
    if src.get("mode")!="V7_CARPET_REVIEW_EVIDENCE_PACK" or src.get("production_writes")!=0 or src.get("auto_resolution_allowed") is not False:
        raise RuntimeError("CARPET_REVIEW_EVIDENCE_READ_ONLY_REPORT_REQUIRED")
    before=counts(args.tenant)
    run(f"""insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(args.tenant)}::uuid,{q(args.actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';""")
    blocks=[f"set request.jwt.claim.sub={q(args.actor)};"]
    for c in src.get("cases") or []:
        blocks.append(f"""insert into warehouse_v7.carpet_review_evidence(
          tenant_id,source_dataset,source_record_id,evidence,generated_at)
        values({q(args.tenant)}::uuid,{q(c["source_dataset"])},{q(c["source_record_id"])},{j(c)},now())
        on conflict(tenant_id,source_dataset,source_record_id)
        do update set evidence=excluded.evidence,generated_at=excluded.generated_at;""")
    run("\n".join(blocks))
    after=counts(args.tenant)
    if before!=after: raise RuntimeError(f"CARPET_REVIEW_EVIDENCE_STAGE_TOUCHED_OPERATIONAL_TABLES:{before}:{after}")
    staged=int(val(f"""set request.jwt.claim.sub={q(args.actor)};
      select count(*) from warehouse_v7.carpet_review_evidence where tenant_id={q(args.tenant)}::uuid;""") or 0)
    expected=int((src.get("summary") or {}).get("cases_total") or 0)
    if staged!=expected: raise RuntimeError(f"CARPET_REVIEW_EVIDENCE_STAGE_COUNT_MISMATCH:{staged}:{expected}")
    out={"mode":"V7_CARPET_REVIEW_EVIDENCE_DISPOSABLE_STAGE","production_writes":0,"operational_inventory_writes":0,"staged_cases":staged,"expected_cases":expected,"operational_before":before,"operational_after":after,"pass":True}
    json.dump(out,open(args.report,"w"),indent=2);open(args.report,"a").write("\n")
    print(json.dumps(out,indent=2));print("V7 CARPET REVIEW EVIDENCE STAGE: PASS")
if __name__=="__main__":main()
