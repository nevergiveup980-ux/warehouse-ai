#!/usr/bin/env python3
import argparse,json,os,subprocess
DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={DB} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}"
ENV=os.environ.copy();ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
def val(sql):
  r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-At"],input=sql,text=True,capture_output=True,env=ENV)
  if r.returncode: raise RuntimeError(r.stderr or r.stdout)
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"];return xs[-1] if xs else ""
def q(v): return "'" + str(v).replace("'","''") + "'"
def main():
  ap=argparse.ArgumentParser();ap.add_argument("review_report");ap.add_argument("--tenant",required=True);ap.add_argument("--actor",required=True);ap.add_argument("--report",required=True);args=ap.parse_args()
  if DB!="warehouse_v7_test": raise RuntimeError("CARPET_PROMOTION_GATE_VERIFY_REFUSES_DATABASE:"+DB)
  review=json.load(open(args.review_report))
  data=json.loads(val(f"set request.jwt.claim.sub={q(args.actor)};select warehouse_v7.get_carpet_review_promotion_gate({q(args.tenant)}::uuid)::text;"))
  expected=int(review.get("expected_review_total") or 0)
  s=data.get("summary") or {}
  ok=(data.get("mode")=="V7_CARPET_REVIEW_PROMOTION_GATE" and data.get("automatic_promotion") is False and data.get("production_enabled") is False and int(s.get("total") or 0)==expected and int(s.get("open") or 0)==expected and int(s.get("resolved") or 0)==0 and int(s.get("promotable") or 0)==0 and int(s.get("promoted") or 0)==0)
  out={"mode":"V7_CARPET_REVIEW_PROMOTION_GATE_REAL_VERIFY","production_writes":0,"summary":s,"automatic_promotion":data.get("automatic_promotion"),"production_enabled":data.get("production_enabled"),"pass":ok}
  if not ok: raise RuntimeError("CARPET_PROMOTION_GATE_REAL_VERIFY_FAILED:"+json.dumps(out,sort_keys=True))
  json.dump(out,open(args.report,"w"),indent=2);open(args.report,"a").write("\n")
  print(json.dumps(out,indent=2));print("V7 CARPET REVIEW PROMOTION GATE REAL VERIFY: PASS")
if __name__=="__main__":main()
