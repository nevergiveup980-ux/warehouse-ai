#!/usr/bin/env python3
import argparse,json,os,subprocess
DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}"
ENV=os.environ.copy();ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))

def val(sql):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-At"],input=sql,text=True,capture_output=True,env=ENV)
    if r.returncode: raise RuntimeError(r.stderr or r.stdout)
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return xs[-1] if xs else ""

def q(v): return "'" + str(v).replace("'","''") + "'"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("stage_report")
    ap.add_argument("--tenant",required=True)
    ap.add_argument("--actor",required=True)
    ap.add_argument("--report",required=True)
    args=ap.parse_args()
    if DB!="warehouse_v7_test": raise RuntimeError("CARPET_REVIEW_WORKBENCH_VERIFY_REFUSES_DATABASE:"+DB)
    stage=json.load(open(args.stage_report,encoding="utf-8"))
    raw=val(f"set request.jwt.claim.sub={q(args.actor)};select warehouse_v7.list_carpet_review_workbench({q(args.tenant)}::uuid,'open')::text;")
    data=json.loads(raw)
    expected=int(stage.get("review_total") or 0)
    ok=(
      data.get("mode")=="V7_CARPET_REVIEW_WORKBENCH"
      and data.get("operational_cutover") is False
      and int((data.get("summary") or {}).get("total") or 0)==expected
      and int((data.get("summary") or {}).get("open") or 0)==expected
      and int((data.get("summary") or {}).get("resolved") or 0)==0
      and len(data.get("cases") or [])==expected
    )
    out={
      "mode":"V7_CARPET_REVIEW_WORKBENCH_REAL_VERIFY",
      "production_writes":0,
      "expected_review_total":expected,
      "summary":data.get("summary") or {},
      "can_resolve":data.get("can_resolve"),
      "operational_cutover":data.get("operational_cutover"),
      "pass":ok
    }
    if not ok: raise RuntimeError("CARPET_REVIEW_WORKBENCH_REAL_VERIFY_FAILED:"+json.dumps(out,sort_keys=True))
    json.dump(out,open(args.report,"w",encoding="utf-8"),indent=2);open(args.report,"a").write("\n")
    print(json.dumps(out,indent=2))
    print("V7 CARPET REVIEW WORKBENCH REAL VERIFY: PASS")

if __name__=="__main__": main()
