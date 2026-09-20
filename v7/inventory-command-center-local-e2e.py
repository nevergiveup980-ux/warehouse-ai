#!/usr/bin/env python3
import argparse,json,urllib.error,urllib.request

def get_json(url):
    with urllib.request.urlopen(url,timeout=8) as r:
        return r.status,json.loads(r.read().decode())

def request_status(url,method="GET",body=None):
    req=urllib.request.Request(url,method=method,data=body)
    try:
        with urllib.request.urlopen(req,timeout=8) as r:
            return r.status,r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code,e.read().decode()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--base-url",required=True)
    ap.add_argument("--identity-report")
    ap.add_argument("--operational-report")
    ap.add_argument("--report",required=True)
    args=ap.parse_args()
    base=args.base_url.rstrip("/")

    with urllib.request.urlopen(base+"/inventory-command-center.html",timeout=8) as r:
        html=r.read().decode()
    assert "Inventory Command Center" in html
    assert "Company roll-number identity first" in html

    _,overview_env=get_json(base+"/api/inventory-command-center?action=overview")
    overview=overview_env["data"]
    assert overview["mode"]=="V7_INVENTORY_COMMAND_CENTER"
    assert overview["read_only"] is True
    assert overview["carpet_operational_cutover"] is False
    assert overview["carpet_identity_contract"]["manufacturer_roll_role"]=="reference_only"

    _,all_env=get_json(base+"/api/inventory-command-center?action=list&kind=ALL&limit=100")
    _,carpet_env=get_json(base+"/api/inventory-command-center?action=list&kind=CARPET&limit=100")
    _,shared_env=get_json(base+"/api/inventory-command-center?action=list&kind=SHARED&limit=100")
    _,review_env=get_json(base+"/api/inventory-command-center?action=list&kind=REVIEW&limit=100")
    all_data,carpet,shared,review=[x["data"] for x in (all_env,carpet_env,shared_env,review_env)]
    assert all_data["read_only"] is True
    assert carpet["matching_count"]==overview["summary"]["carpet_physical_instances"]
    assert shared["matching_count"]==overview["summary"]["shared_legacy_roll_instances"]
    assert review["matching_count"]==overview["summary"]["carpet_review_total"]

    chc022=None
    if overview["summary"]["shared_legacy_roll_instances"]:
        _,qenv=get_json(base+"/api/inventory-command-center?action=list&kind=SHARED&q=CHC022&limit=100")
        chc022=qenv["data"]
        assert all("CHC022" in (x.get("display_id") or "") for x in chc022["items"])

    identity_checks={}
    if args.identity_report:
        src=json.load(open(args.identity_report,encoding="utf-8"))
        counts=src["counts"]
        expected_shared=sum(int(x["physical_instance_count"]) for x in src.get("shared_roll_groups") or [])
        identity_checks={
          "carpet_matches_identity_v2":overview["summary"]["carpet_physical_instances"]==counts["accepted_physical_instances"],
          "conflicts_match_identity_v2":overview["summary"]["carpet_identity_conflicts"]==counts["conflict_groups"],
          "distinct_rolls_match_identity_v2":overview["summary"]["carpet_distinct_company_roll_numbers"]==counts["accepted_distinct_company_roll_numbers"],
          "shared_instances_match_identity_v2":overview["summary"]["shared_legacy_roll_instances"]==expected_shared
        }
        assert all(identity_checks.values()),identity_checks

    operational_checks={}
    if args.operational_report:
        op=json.load(open(args.operational_report,encoding="utf-8"))
        expected_deferred=int((op.get("readiness") or {}).get("deferred_physical_instances") or 0)
        operational_checks={
          "deferred_matches_operational_v2":overview["summary"]["carpet_operational_deferred"]==expected_deferred,
          "review_total_is_identity_plus_deferred":overview["summary"]["carpet_review_total"]==overview["summary"]["carpet_identity_conflicts"]+expected_deferred
        }
        assert all(operational_checks.values()),operational_checks

    bad,_=request_status(base+"/api/inventory-command-center?action=list&kind=NOPE")
    post,post_body=request_status(base+"/api/inventory-command-center",method="POST",body=b"{}")
    assert bad==400
    assert post==405 and "INVENTORY_COMMAND_CENTER_READ_ONLY" in post_body

    out={
      "mode":"V7_INVENTORY_COMMAND_CENTER_HTTP_E2E",
      "overview_summary":overview["summary"],
      "all_matching":all_data["matching_count"],
      "carpet_matching":carpet["matching_count"],
      "shared_matching":shared["matching_count"],
      "review_matching":review["matching_count"],
      "chc022_shared_matching":None if chc022 is None else chc022["matching_count"],
      "identity_checks":identity_checks,
      "operational_checks":operational_checks,
      "invalid_kind_rejected":bad==400,
      "mutation_rejected":post==405,
      "verdict":"HTTP_E2E_PASS"
    }
    with open(args.report,"w",encoding="utf-8") as f:
        json.dump(out,f,indent=2,ensure_ascii=False);f.write("\n")
    print(json.dumps(out,indent=2,ensure_ascii=False))
    print("V7 INVENTORY COMMAND CENTER HTTP E2E: PASS")

if __name__=="__main__":
    main()
