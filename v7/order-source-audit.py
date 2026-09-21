#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 Wave 2 order source audit.

This tool classifies V6 order evidence without importing it. It never guesses a
status from free-text notes and never collapses conflicting identities into one
canonical V7 order.

Identity precedence:
  1. recoveryKey when present;
  2. conservative business composite for standard rows with enough structured fields;
  3. legacy source row identity => deferred / weak identity.

Duplicate recovery groups are classified as replay duplicates, lifecycle evidence,
lifecycle regressions, or identity conflicts. Quarantined groups are not an audit
failure; they are evidence that must not auto-import.
"""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from decimal import Decimal, InvalidOperation

STD_STATUS_RANK={
    "Draft":0,
    "In Progress":1,
    "Completed":2,
    "Archived":3,
}
SPECIAL_STATUS_RANK={
    "Ready for Pickup":1,
    "Picked Up":2,
    "Completed":3,
}

def norm(v):
    return str(v or "").strip()

def h(value):
    return hashlib.md5(value.encode("utf-8")).hexdigest()

def dec(v):
    try:
        d=Decimal(str(v).strip())
    except (InvalidOperation,AttributeError):
        return None
    return d if d.is_finite() else None

def strong_standard_composite(p):
    fields=[
        norm(p.get("poNumber")),
        norm(p.get("type")),
        norm(p.get("product")),
        norm(p.get("quantity")),
        norm(p.get("unit")),
        norm(p.get("location")),
    ]
    if all(fields):
        return "business:"+h("|".join(fields))
    return None

def critical_signature(dataset,p):
    if dataset=="runlu_orders_v20":
        fields=[
            norm(p.get("type")),
            norm(p.get("soNumber")),
            norm(p.get("poNumber")),
            norm(p.get("customer")),
            norm(p.get("product")),
            norm(p.get("quantity")),
            norm(p.get("unit")),
        ]
    else:
        fields=[
            norm(p.get("po")),
            norm(p.get("customer")),
            norm(p.get("product")),
            norm(p.get("quantity")),
            norm(p.get("unit")),
        ]
    return h("|".join(fields))

def presentation_signature(dataset,p):
    if dataset=="runlu_orders_v20":
        fields=[norm(p.get("status")),norm(p.get("location"))]
    else:
        fields=[norm(p.get("status")),norm(p.get("location"))]
    return h("|".join(fields))

def status_rank(dataset,status):
    status=norm(status)
    if not status:
        return None
    if dataset=="runlu_orders_v20":
        return STD_STATUS_RANK.get(status)
    return SPECIAL_STATUS_RANK.get(status)

def monotonic_explicit_status(dataset,rows):
    seen=[]
    unknown=[]
    for r in rows:
        s=norm((r.get("payload") or {}).get("status"))
        if not s:
            continue
        rank=status_rank(dataset,s)
        if rank is None:
            unknown.append(s)
            continue
        seen.append(rank)
    regression=any(b<a for a,b in zip(seen,seen[1:]))
    return (not regression and not unknown), regression, sorted(set(unknown))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("envelope")
    ap.add_argument("--report",required=True)
    a=ap.parse_args()

    env=json.loads(Path(a.envelope).read_text(encoding="utf-8"))
    if env.get("mode")!="READ_ONLY_V6_ORDER_SHADOW":
        raise RuntimeError("ORDER_SHADOW_MODE_INVALID")

    rows=env.get("rows")
    integ=env.get("source_integrity") or {}
    if not isinstance(rows,list):
        raise RuntimeError("ORDER_SHADOW_ROWS_REQUIRED")
    if len(rows)!=int(integ.get("total_live_rows",-1)):
        raise RuntimeError("ORDER_SHADOW_COUNT_MISMATCH")

    source_md5=[]
    for row in sorted(rows,key=lambda r:(norm(r.get("dataset_key")),norm(r.get("record_id")))):
        fp=norm(row.get("source_row_md5")).lower()
        if len(fp)!=32 or any(ch not in "0123456789abcdef" for ch in fp):
            raise RuntimeError("ORDER_SHADOW_ROW_FINGERPRINT_INVALID")
        source_md5.append(fp)
    chain=hashlib.md5("\n".join(source_md5).encode("utf-8")).hexdigest()
    if chain!=norm(integ.get("snapshot_md5")).lower():
        raise RuntimeError("ORDER_SHADOW_FINGERPRINT_MISMATCH")

    groups=defaultdict(list)
    weak_rows=[]
    dataset_counts=defaultdict(int)

    for row in rows:
        ds=row.get("dataset_key")
        if ds not in ("runlu_orders_v20","runlu_special_orders_v51"):
            raise RuntimeError("ORDER_SHADOW_UNEXPECTED_DATASET:"+str(ds))
        dataset_counts[ds]+=1
        p=row.get("payload") or {}
        recovery=norm(p.get("recoveryKey"))
        if recovery:
            key=f"{ds}:recovery:{recovery}"
            strength="recovery"
        elif ds=="runlu_orders_v20":
            comp=strong_standard_composite(p)
            if comp:
                key=f"{ds}:{comp}"
                strength="business_composite"
            else:
                key=f"{ds}:legacy:{row.get('record_id')}"
                strength="legacy_weak"
                weak_rows.append(str(row.get("record_id") or ""))
        else:
            key=f"{ds}:legacy:{row.get('record_id')}"
            strength="legacy_weak"
            weak_rows.append(str(row.get("record_id") or ""))
        row["_identity_strength"]=strength
        groups[key].append(row)

    classifications=[]
    counts=defaultdict(int)
    quarantined=defaultdict(int)
    unclassified=[]

    for key,grp in groups.items():
        grp=sorted(grp,key=lambda r:(norm(r.get("updated_at")),norm(r.get("record_id"))))
        ds=grp[0]["dataset_key"]
        strengths={r["_identity_strength"] for r in grp}
        critical={critical_signature(ds,r.get("payload") or {}) for r in grp}
        presentation={presentation_signature(ds,r.get("payload") or {}) for r in grp}

        if "legacy_weak" in strengths:
            cls="deferred_weak_identity"
            quarantined[cls]+=1
        elif len(critical)>1:
            cls="identity_conflict"
            quarantined[cls]+=1
        elif len(grp)==1:
            cls="singleton"
        else:
            monotonic,regression,unknown=monotonic_explicit_status(ds,grp)
            if unknown:
                cls="deferred_unknown_status"
                quarantined[cls]+=1
            elif regression:
                cls="lifecycle_regression"
                quarantined[cls]+=1
            elif len(presentation)==1:
                cls="replay_duplicate"
            else:
                cls="lifecycle_evidence"

        counts[cls]+=1
        classifications.append({
            "identity_hash":h(key),
            "dataset":ds,
            "rows":len(grp),
            "identity_strength":sorted(strengths),
            "critical_state_count":len(critical),
            "presentation_state_count":len(presentation),
            "classification":cls,
        })

    classified_rows=sum(x["rows"] for x in classifications)
    if classified_rows!=len(rows):
        unclassified.append("ROW_CLASSIFICATION_TOTAL_MISMATCH")

    report={
        "mode":"V7_ORDER_SOURCE_AUDIT",
        "production_writes":0,
        "canonical_order_writes":0,
        "source_integrity":{
            "snapshot_md5":integ.get("snapshot_md5"),
            "total_live_rows":int(integ.get("total_live_rows",-1)),
            "postgres_jsonb_text_verified":integ.get("postgres_jsonb_text_verified") is True,
            "row_md5_chain_verified":True,
        },
        "observed":{
            "rows":len(rows),
            "datasets":dict(sorted(dataset_counts.items())),
            "identity_groups":len(groups),
            "classification_groups":dict(sorted(counts.items())),
            "quarantined_groups":dict(sorted(quarantined.items())),
            "weak_identity_rows":len(weak_rows),
        },
        "policy":{
            "notes_are_not_status_evidence":True,
            "conflicting_identity_groups_auto_import":False,
            "lifecycle_regressions_auto_import":False,
            "weak_identity_rows_auto_import":False,
            "duplicate_replay_rows_collapsed_only_after_identity_match":True,
        },
        "classifications":sorted(classifications,key=lambda x:(x["dataset"],x["identity_hash"])),
        "stop_reasons":unclassified,
        "verdict":"SHADOW_PASS" if not unclassified else "STOP",
    }

    Path(a.report).write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    if unclassified:
        raise SystemExit(1)
    print("V7 ORDER SOURCE AUDIT: PASS WITH QUARANTINE")

if __name__=="__main__":
    main()
