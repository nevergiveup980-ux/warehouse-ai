#!/usr/bin/env python3
"""Build a sanitized evidence pack for V7 Carpet Review cases.

Inputs are already-read-only engineering artifacts:
- core V6 snapshot
- sanitized CUT shadow envelope
- sanitized operation shadow envelope
- Carpet Identity V2 report
- operational-readiness report

The output never resolves a case. Historical values are candidates/reference only.
"""
import argparse,json
from pathlib import Path

def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def text(v): return str(v or "").strip()
def upper(v): return text(v).upper()

def rows_from_envelope(value):
    if isinstance(value,dict) and isinstance(value.get("rows"),list): return value["rows"]
    return []

def sort_key(row):
    p=row.get("payload") or {}
    return (text(p.get("updatedAt")) or text(row.get("updated_at")), text(row.get("record_id")))

def core_snapshot_rows(snapshot):
    return [r for r in snapshot if r.get("dataset_key")=="runlu_carpet_inventory_v52" and not r.get("deleted_at")]

def compact_core(row):
    p=row.get("payload") or {}
    return {
      "source_record_id":row.get("record_id"),
      "company_roll_number":upper(p.get("roll")) or None,
      "collection":text(p.get("collection")) or None,
      "colour":text(p.get("colour")) or None,
      "location":text(p.get("location")) or None,
      "measure":upper(p.get("measure")) or None,
      "length":p.get("length"),
      "original_length":p.get("originalLength"),
      "status":upper(p.get("status")) or None,
      "payload_updated_at":p.get("updatedAt"),
      "row_updated_at":row.get("updated_at")
    }

def compact_cut(row):
    p=row.get("payload") or {}
    return {
      "source_record_id":row.get("record_id"),
      "roll":upper(p.get("roll")) or None,
      "before_length":p.get("beforeLength"),
      "actual_cut_length":p.get("actualCutLength") or p.get("cutLength"),
      "remaining_length":p.get("remainingLength"),
      "full_roll_consumed":p.get("fullRollConsumed"),
      "date":p.get("date"),
      "time":p.get("time"),
      "row_updated_at":row.get("updated_at")
    }

def compact_op(row):
    p=row.get("payload") or {}
    return {
      "source_record_id":row.get("record_id"),
      "type":p.get("type"),
      "roll":upper(p.get("roll")) or None,
      "returned_child_roll":upper(p.get("returnedChildRoll")) or None,
      "location":text(p.get("location")) or None,
      "to_location":text(p.get("toLocation")) or None,
      "status":p.get("status"),
      "quantity":p.get("quantity"),
      "unit":p.get("unit"),
      "row_updated_at":row.get("updated_at")
    }

def unique(values):
    out=[]
    for v in values:
        if v is None or v=="" or v in out: continue
        out.append(v)
    return out

def case_evidence(case,core,cut_rows,op_rows):
    alias=text(case.get("legacy_instance_id"))
    labels=[upper(x) for x in case.get("roll_labels") or [] if upper(x)]
    alias_rows=sorted(
      [r for r in core if text((r.get("payload") or {}).get("id"))==alias],
      key=sort_key
    )
    compact_alias=[compact_core(r) for r in alias_rows]
    exact_roll_rows=sorted(
      [r for r in core if upper((r.get("payload") or {}).get("roll")) in labels],
      key=sort_key
    )
    cuts=[
      compact_cut(r) for r in cut_rows
      if upper((r.get("payload") or {}).get("roll")) in labels
    ]
    ops=[
      compact_op(r) for r in op_rows
      if upper((r.get("payload") or {}).get("roll")) in labels
      or upper((r.get("payload") or {}).get("returnedChildRoll")) in labels
    ]
    locations=unique([x.get("location") for x in compact_alias])
    measures=unique([x.get("measure") for x in compact_alias])
    products=[]
    for x in compact_alias:
        pair={"collection":x.get("collection"),"colour":x.get("colour")}
        if pair["collection"] and pair not in products: products.append(pair)
    rolls=unique([x.get("company_roll_number") for x in compact_alias])
    caution=[
      "Historical evidence is reference-only and never auto-resolves a review case.",
      "Only exact legacy-instance history is used to form candidate field values.",
      "Roll-label CUT/operation matches may refer to another physical roll when a legacy company roll number is shared."
    ]
    return {
      "source_dataset":case["source_dataset"],
      "source_record_id":case["source_record_id"],
      "review_kind":case["review_kind"],
      "legacy_instance_id":alias or None,
      "roll_labels":labels,
      "reasons":case.get("reasons") or [],
      "policy":{
        "auto_resolution_allowed":False,
        "historical_candidates_are_reference_only":True,
        "physical_confirmation_required":True
      },
      "current_state":case.get("current_state") or {},
      "candidates":{
        "company_roll_numbers":rolls,
        "locations":locations,
        "measures":measures,
        "products":products
      },
      "exact_legacy_instance_history":compact_alias,
      "same_roll_label_source_rows":[compact_core(r) for r in exact_roll_rows],
      "cut_history_by_roll_label":sorted(cuts,key=lambda x:(text(x.get("row_updated_at")),text(x.get("source_record_id")))),
      "operation_history_by_roll_label":sorted(ops,key=lambda x:(text(x.get("row_updated_at")),text(x.get("source_record_id")))),
      "caution":caution
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("snapshot")
    ap.add_argument("cut_envelope")
    ap.add_argument("operation_envelope")
    ap.add_argument("identity_report")
    ap.add_argument("operational_report")
    ap.add_argument("--report",required=True)
    args=ap.parse_args()

    snapshot=load(args.snapshot)
    cut=load(args.cut_envelope)
    operation=load(args.operation_envelope)
    identity=load(args.identity_report)
    operational=load(args.operational_report)
    if identity.get("mode")!="V7_CARPET_IDENTITY_V2_REHEARSAL" or identity.get("production_writes")!=0:
        raise RuntimeError("CARPET_IDENTITY_V2_READ_ONLY_REPORT_REQUIRED")
    if operational.get("mode")!="V7_CARPET_IDENTITY_V2_OPERATIONAL_REHEARSAL" or operational.get("production_writes")!=0:
        raise RuntimeError("CARPET_OPERATIONAL_V2_READ_ONLY_REPORT_REQUIRED")
    if cut.get("mode")!="READ_ONLY_V6_CUT_SHADOW" or operation.get("mode")!="READ_ONLY_V6_OPERATION_SHADOW":
        raise RuntimeError("SANITIZED_SHADOW_ENVELOPES_REQUIRED")

    accepted={text(x.get("legacy_instance_id")):x for x in identity.get("physical_instances") or []}
    cases=[]
    for d in operational.get("deferred") or []:
        alias=text(d.get("legacy_instance_id")); base=accepted.get(alias) or {}
        cases.append({
          "source_dataset":"derived_carpet_review_v7",
          "source_record_id":"REVIEW:"+alias,
          "review_kind":"OPERATIONAL",
          "legacy_instance_id":alias,
          "roll_labels":[upper(d.get("company_roll_number"))],
          "reasons":d.get("reasons") or [],
          "current_state":base.get("current_state") or {}
        })
    for c in identity.get("conflicts") or []:
        ctype=upper(c.get("type")) or "CARPET_IDENTITY_V2_CONFLICT"
        alias=text(c.get("legacy_instance_id"))
        suffix=alias or "UNKEYED"
        cases.append({
          "source_dataset":"derived_carpet_identity_v7",
          "source_record_id":"CONFLICT:"+ctype+":"+suffix,
          "review_kind":"IDENTITY",
          "legacy_instance_id":alias,
          "roll_labels":c.get("roll_numbers") or [],
          "reasons":[ctype],
          "current_state":c.get("current_state") or {}
        })

    core=core_snapshot_rows(snapshot)
    cut_rows=rows_from_envelope(cut)
    op_rows=rows_from_envelope(operation)
    out_cases=[case_evidence(c,core,cut_rows,op_rows) for c in cases]
    out_cases.sort(key=lambda x:(0 if x["review_kind"]=="IDENTITY" else 1, x["roll_labels"][0] if x["roll_labels"] else "",x["source_record_id"]))
    total=len(out_cases)
    expected=int((identity.get("counts") or {}).get("conflict_groups") or 0)+int((operational.get("readiness") or {}).get("deferred_physical_instances") or 0)
    if total!=expected:
        raise RuntimeError(f"CARPET_REVIEW_EVIDENCE_CASE_COUNT_MISMATCH:{total}:{expected}")

    summary={
      "cases_total":total,
      "cases_with_exact_alias_history":sum(bool(x["exact_legacy_instance_history"]) for x in out_cases),
      "cases_with_cut_history":sum(bool(x["cut_history_by_roll_label"]) for x in out_cases),
      "cases_with_operation_history":sum(bool(x["operation_history_by_roll_label"]) for x in out_cases),
      "cases_with_location_candidates":sum(bool(x["candidates"]["locations"]) for x in out_cases),
      "cases_with_measure_candidates":sum(bool(x["candidates"]["measures"]) for x in out_cases),
      "cases_with_product_candidates":sum(bool(x["candidates"]["products"]) for x in out_cases),
      "cases_with_roll_candidates":sum(bool(x["candidates"]["company_roll_numbers"]) for x in out_cases)
    }
    out={
      "mode":"V7_CARPET_REVIEW_EVIDENCE_PACK",
      "production_writes":0,
      "auto_resolution_allowed":False,
      "expected_review_total":expected,
      "summary":summary,
      "cases":out_cases
    }
    Path(args.report).write_text(json.dumps(out,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({"mode":out["mode"],"production_writes":0,"auto_resolution_allowed":False,"summary":summary},indent=2))
    print("V7 CARPET REVIEW EVIDENCE PACK: PASS")

if __name__=="__main__":
    main()
