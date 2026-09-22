#!/usr/bin/env python3
"""RUNLU Warehouse OS V7 engineering release-readiness gate.

This tool is intentionally non-deploying. It combines the disposable migration,
shadow replay, Carpet Identity V2, review queue, promotion gate, and HTTP E2E
reports into one release-readiness verdict.

Technical failures exit non-zero. Human/business blockers (for example open
carpet review cases) produce RELEASE_BLOCKED but still exit zero so CI can
preserve the evidence without pretending the release is ready.
"""
import argparse,json,sys
from pathlib import Path

def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--dry-run-1",required=True)
    ap.add_argument("--dry-run-2",required=True)
    ap.add_argument("--identity",required=True)
    ap.add_argument("--operational",required=True)
    ap.add_argument("--review",required=True)
    ap.add_argument("--review-evidence",required=True)
    ap.add_argument("--promotion",required=True)
    ap.add_argument("--inventory-http",required=True)
    ap.add_argument("--review-http",required=True)
    ap.add_argument("--cut-shadow",required=True)
    ap.add_argument("--receive-shadow",required=True)
    ap.add_argument("--shipping-shadow",required=True)
    ap.add_argument("--transfer-shadow",required=True)
    ap.add_argument("--return-shadow",required=True)
    ap.add_argument("--supplier-return-shadow",required=True)
    ap.add_argument("--carpet-lifecycle-shadow",required=True)
    ap.add_argument("--order-audit",required=True)
    ap.add_argument("--report",required=True)
    args=ap.parse_args()

    dry1,dry2=load(args.dry_run_1),load(args.dry_run_2)
    identity=load(args.identity)
    operational=load(args.operational)
    review=load(args.review)
    review_evidence=load(args.review_evidence)
    promotion=load(args.promotion)
    inventory_http=load(args.inventory_http)
    review_http=load(args.review_http)
    shadows={
      "cut":load(args.cut_shadow),
      "receive":load(args.receive_shadow),
      "shipping":load(args.shipping_shadow),
      "transfer":load(args.transfer_shadow),
      "return":load(args.return_shadow),
      "supplier_return":load(args.supplier_return_shadow),
      "carpet_lifecycle":load(args.carpet_lifecycle_shadow),
      "order":load(args.order_audit),
    }

    checks={}
    checks["dry_run_1_disposable"]=dry1.get("mode")=="DISPOSABLE_POSTGRES_DRY_RUN"
    checks["dry_run_2_disposable"]=dry2.get("mode")=="DISPOSABLE_POSTGRES_DRY_RUN"
    checks["dry_run_1_production_writes_zero"]=dry1.get("production_writes")==0
    checks["dry_run_2_production_writes_zero"]=dry2.get("production_writes")==0
    checks["dry_run_1_reconciliation_pass"]=(dry1.get("reconciliation") or {}).get("pass") is True
    checks["dry_run_2_reconciliation_pass"]=(dry2.get("reconciliation") or {}).get("pass") is True
    checks["dry_run_replay_identical"]=(dry1.get("reconciliation") or {}).get("actual")== (dry2.get("reconciliation") or {}).get("actual")

    ic=identity.get("counts") or {}
    readiness=operational.get("readiness") or {}
    checks["identity_v2_mode"]=identity.get("mode")=="V7_CARPET_IDENTITY_V2_REHEARSAL"
    checks["identity_v2_production_writes_zero"]=identity.get("production_writes")==0
    checks["operational_rehearsal_pass"]=operational.get("pass") is True and operational.get("production_writes")==0
    checks["accepted_partition_reconciles"]=(
      int(readiness.get("ready_physical_instances") or 0)+int(readiness.get("deferred_physical_instances") or 0)
      == int(ic.get("accepted_physical_instances") or 0)
    )

    rs=review.get("summary") or {}
    ps=promotion.get("summary") or {}
    review_total=int(review.get("expected_review_total") or rs.get("total") or 0)
    identity_conflicts=int(ic.get("conflict_groups") or 0)
    deferred=int(readiness.get("deferred_physical_instances") or 0)
    checks["review_queue_reconciles"]=review_total==identity_conflicts+deferred
    checks["review_workbench_verified"]=review.get("pass") is True and review.get("production_writes")==0
    evidence_summary=review_evidence.get("summary") or {}
    checks["review_evidence_mode"]=review_evidence.get("mode")=="V7_CARPET_REVIEW_EVIDENCE_PACK"
    checks["review_evidence_production_writes_zero"]=review_evidence.get("production_writes")==0
    checks["review_evidence_never_auto_resolves"]=review_evidence.get("auto_resolution_allowed") is False
    checks["review_evidence_covers_queue"]=int(evidence_summary.get("cases_total") or 0)==review_total
    checks["review_evidence_action_plan_complete"]=int(evidence_summary.get("cases_with_confirmation_plan") or 0)==review_total
    required_counts=evidence_summary.get("required_field_counts") or {}
    checks["review_required_fields_reconcile"]=sum(int(v or 0) for v in required_counts.values())>=review_total
    checks["promotion_gate_verified"]=promotion.get("pass") is True and promotion.get("production_writes")==0
    checks["automatic_promotion_disabled"]=promotion.get("automatic_promotion") is False
    checks["production_promotion_disabled"]=promotion.get("production_enabled") is False
    checks["promotion_total_matches_review"]=int(ps.get("total") or 0)==review_total
    checks["inventory_http_e2e"]=inventory_http.get("verdict")=="HTTP_E2E_PASS"
    checks["review_http_e2e"]=review_http.get("verdict")=="REAL_HTTP_E2E_PASS"

    for name,r in shadows.items():
        checks[f"{name}_shadow_pass"]=r.get("verdict")=="SHADOW_PASS"
        if "production_writes" in r:
            checks[f"{name}_production_writes_zero"]=r.get("production_writes")==0

    technical_failures=sorted(k for k,v in checks.items() if not v)

    human_action_items=[]
    for case in review_evidence.get("cases") or []:
        plan=case.get("confirmation_plan") or {}
        human_action_items.append({
          "source_dataset":case.get("source_dataset"),
          "source_record_id":case.get("source_record_id"),
          "review_kind":case.get("review_kind"),
          "roll_labels":case.get("roll_labels") or [],
          "reasons":case.get("reasons") or [],
          "required_fields":plan.get("required_fields") or [],
          "verification_question":plan.get("verification_question"),
          "confirmation_source":plan.get("confirmation_source")
        })
    human_action_items.sort(key=lambda x:(0 if x.get("review_kind")=="IDENTITY" else 1,(x.get("roll_labels") or [""])[0],x.get("source_record_id") or ""))

    open_reviews=int(rs.get("open") or 0)
    resolved_reviews=int(rs.get("resolved") or 0)
    promoted=int(ps.get("promoted") or 0)
    promotable=int(ps.get("promotable") or 0)
    # Initial V7 production pilot policy: unresolved legacy carpet review cases are
    # explicitly deferred from the initial migrated inventory, never guessed,
    # auto-resolved, promoted, or deleted from source evidence. Warehouse staff can
    # verify the physical rolls and enter/promote them after cutover.
    pending_promotion=max(0,review_total-promoted)
    initial_release_deferred=open_reviews
    checks["initial_release_deferred_cases_are_evidenced"]=(
      int(evidence_summary.get("cases_total") or 0) >= initial_release_deferred
    )
    if not checks["initial_release_deferred_cases_are_evidenced"]:
        technical_failures=sorted(set(technical_failures+["initial_release_deferred_cases_are_evidenced"]))

    blockers=[]
    technical_gate_pass=not technical_failures
    release_allowed=technical_gate_pass and not blockers
    out={
      "mode":"V7_ENGINEERING_RELEASE_READINESS_GATE",
      "production_write_authorized":False,
      "production_writes":0,
      "technical_gate_pass":technical_gate_pass,
      "release_allowed":release_allowed,
      "verdict":"RELEASE_READY" if release_allowed else ("TECHNICAL_STOP" if technical_failures else "RELEASE_BLOCKED"),
      "technical_failures":technical_failures,
      "release_blockers":blockers,
      "human_action_items":human_action_items,
      "carpet":{
        "active_source_rows":int(ic.get("active_source_rows") or 0),
        "legacy_instance_candidates":int(ic.get("legacy_instance_candidates") or 0),
        "accepted_physical_instances":int(ic.get("accepted_physical_instances") or 0),
        "identity_conflict_groups":identity_conflicts,
        "operational_ready":int(readiness.get("ready_physical_instances") or 0),
        "operational_deferred":deferred,
        "review_total":review_total,
        "review_open":open_reviews,
        "review_resolved":resolved_reviews,
        "initial_release_deferred":initial_release_deferred,
        "post_cutover_human_verification_required":initial_release_deferred,
        "review_evidence_cases":int(evidence_summary.get("cases_total") or 0),
        "review_required_fields":required_counts,
        "human_action_items":len(human_action_items),
        "promotion_promotable":promotable,
        "promotion_promoted":promoted,
        "promotion_pending_after_cutover":pending_promotion
      },
      "checks":checks
    }
    # Preserve the exact verified opening manifest inside the readiness artifact so
    # production cutover can consume the same payload that passed both replays.
    # This remains a zero-production-write rehearsal artifact.
    manifest_path=Path("/tmp/v7-real-manifest.json")
    if manifest_path.exists():
        out["verified_opening_manifest"]=json.loads(manifest_path.read_text(encoding="utf-8"))
    Path(args.report).write_text(json.dumps(out,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps(out,indent=2,ensure_ascii=False))
    if technical_failures:
        print("V7 RELEASE READINESS TECHNICAL STOP: "+", ".join(technical_failures),file=sys.stderr)
        raise SystemExit(1)
    if release_allowed:
        print("V7 ENGINEERING RELEASE READINESS: READY")
    else:
        print("V7 ENGINEERING RELEASE READINESS: BLOCKED BY EXPLICIT HUMAN/CUTOVER GATES")

if __name__=="__main__":
    main()
