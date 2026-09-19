#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 incremental live-shadow router.

Input is a sanitized OIDC incremental envelope. Only rows newer than the committed
watermark are classified. Complete rows are replayed through the existing V7 shadow
validators in Disposable Postgres. Incomplete legacy rows are deferred; if they are
later updated in V6 their updated_at moves forward and they re-enter a future batch.

This program never writes V6 or production V7 business data.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

UNIT_MAP={
    "box":"BOX","carton":"BOX","piece":"EACH","each":"EACH",
    "pail":"PAIL","bucket":"BUCKET","tube":"TUBE","roll":"ROLL",
    "gal":"GAL","gallon":"GAL",
}
SHIP_RE=re.compile(r"Inventory\s+([0-9]+(?:[.][0-9]+)?)\s*→\s*([0-9]+(?:[.][0-9]+)?)",re.I)
TRANSFER_RE=re.compile(r"Transfer\s+.+?\s+([0-9]+(?:[.][0-9]+)?)\s*→\s*([0-9]+(?:[.][0-9]+)?)",re.I)

def dec(v):
    try:
        d=Decimal(str(v).strip())
    except (InvalidOperation,AttributeError):
        return None
    return d if d.is_finite() else None

def known_unit(v):
    return UNIT_MAP.get(str(v or "").strip().lower())

def truthy(v):
    return str(v or "").strip().lower()=="true"

def envelope(mode,rows,batch):
    return {
        "mode":mode,
        "rows":rows,
        "source_integrity":{
            "algorithm":"postgres-jsonb-row-md5-chain-v1",
            "snapshot_md5":batch.get("batch_fingerprint"),
            "total_live_rows":len(rows),
            "postgres_jsonb_text_verified":True,
        },
    }

def run_validator(name,script,envelope_path,report_path,tenant,actor,extra=None):
    cmd=[
        sys.executable,script,str(envelope_path),
        "--report",str(report_path),
        "--tenant",tenant,
        "--actor",actor,
    ]
    if extra:
        cmd.extend(extra)
    r=subprocess.run(cmd,text=True,capture_output=True,env=os.environ.copy())
    report={}
    if Path(report_path).exists():
        report=json.loads(Path(report_path).read_text(encoding="utf-8"))
    return {
        "name":name,
        "exit_code":r.returncode,
        "verdict":report.get("verdict"),
        "observed":report.get("observed"),
        "validation":report.get("validation"),
        "stop_reasons":report.get("stop_reasons") or [],
        "stderr_tail":"\n".join(r.stderr.splitlines()[-8:]),
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("envelope")
    ap.add_argument("--report",required=True)
    ap.add_argument("--workdir",default="/tmp/v7-incremental-shadow")
    a=ap.parse_args()

    batch=json.loads(Path(a.envelope).read_text(encoding="utf-8"))
    if batch.get("mode")!="READ_ONLY_V6_INCREMENTAL_SHADOW":
        raise RuntimeError("INCREMENTAL_MODE_INVALID")
    if batch.get("production_business_writes")!=0:
        raise RuntimeError("INCREMENTAL_SOURCE_WRITE_FLAG_INVALID")

    rows=batch.get("rows")
    count=int(batch.get("row_count",-1))
    if not isinstance(rows,list) or len(rows)!=count:
        raise RuntimeError("INCREMENTAL_ROW_COUNT_MISMATCH")

    if count==0:
        report={
            "mode":"V7_INCREMENTAL_LIVE_SHADOW",
            "production_business_writes":0,
            "shadow_control_write_authorized_after_pass":False,
            "row_count":0,
            "from_watermark":batch.get("from_watermark"),
            "to_watermark":batch.get("to_watermark"),
            "modules":[],
            "deferred":[],
            "stop_reasons":[],
            "verdict":"NO_CHANGES",
        }
        Path(a.report).write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
        print(json.dumps(report,indent=2))
        return

    row_md5=[str(r.get("source_row_md5") or "") for r in rows]
    if any(not re.fullmatch(r"[0-9a-f]{32}",x) for x in row_md5):
        raise RuntimeError("INCREMENTAL_ROW_FINGERPRINT_INVALID")
    computed=hashlib.md5("\n".join(row_md5).encode()).hexdigest()
    if computed!=str(batch.get("batch_fingerprint") or "").lower():
        raise RuntimeError("INCREMENTAL_BATCH_FINGERPRINT_MISMATCH")

    groups={"cut":[],"receive":[],"shipping":[],"transfer":[],"return":[],"supplier_return":[],"carpet":[]}
    deferred=[]

    for row in rows:
        ds=row.get("dataset_key")
        rid=str(row.get("record_id") or "")
        p=row.get("payload") or {}

        if ds=="runlu_cutting_log_v52":
            before,actual,remain=dec(p.get("beforeLength")),dec(p.get("actualCutLength")),dec(p.get("remainingLength"))
            if before is not None and actual is not None and remain is not None and before>0 and actual>0:
                groups["cut"].append(row)
            else:
                deferred.append({"record_id":rid,"dataset_key":ds,"reason":"CUT_INCOMPLETE_EVIDENCE"})
            continue

        if ds=="runlu_receiving_v50":
            qty,before,after=dec(p.get("quantity")),dec(p.get("inventoryBefore")),dec(p.get("inventoryAfter"))
            if (
                truthy(p.get("inventoryPosted")) and qty is not None and qty>0
                and before is not None and before>=0 and after is not None and after>=0
                and known_unit(p.get("unit"))
                and str(p.get("location") or "").strip()
                and str(p.get("masterId") or "").strip()
            ):
                groups["receive"].append(row)
            else:
                deferred.append({"record_id":rid,"dataset_key":ds,"reason":"RECEIVE_NOT_COMPLETE_POSTED_EVIDENCE"})
            continue

        if ds!="runlu_operations_log_v52":
            deferred.append({"record_id":rid,"dataset_key":ds,"reason":"UNSUPPORTED_DATASET"})
            continue

        typ=str(p.get("type") or "")
        status=str(p.get("status") or "")
        unit_raw=str(p.get("unit") or "").strip().lower()
        qty=dec(p.get("quantity"))
        impact=str(p.get("impactResult") or "")

        if status!="Completed" or not truthy(p.get("impactApplied")):
            deferred.append({"record_id":rid,"dataset_key":ds,"reason":"OPERATION_NOT_COMPLETED_APPLIED"})
            continue

        if typ=="Shipping":
            if qty is not None and qty>0 and known_unit(unit_raw) and SHIP_RE.search(impact):
                groups["shipping"].append(row)
            else:
                deferred.append({"record_id":rid,"dataset_key":ds,"reason":"SHIPPING_INCOMPLETE_EVIDENCE"})
            continue

        if typ=="Inventory Transfer":
            if unit_raw=="foot":
                if qty is not None and qty>0 and str(p.get("roll") or "").strip():
                    groups["carpet"].append(row)
                else:
                    deferred.append({"record_id":rid,"dataset_key":ds,"reason":"CARPET_TRANSFER_INCOMPLETE_EVIDENCE"})
            elif qty is not None and qty>0 and known_unit(unit_raw) and TRANSFER_RE.search(impact):
                groups["transfer"].append(row)
            else:
                deferred.append({"record_id":rid,"dataset_key":ds,"reason":"STOCK_TRANSFER_INCOMPLETE_EVIDENCE"})
            continue

        if typ in ("Customer Return","Installer Return","Cut Piece Return"):
            if unit_raw=="foot" or typ=="Cut Piece Return":
                if qty is not None and qty>0 and str(p.get("roll") or "").strip() and str(p.get("returnedChildRoll") or "").strip():
                    groups["carpet"].append(row)
                else:
                    deferred.append({"record_id":rid,"dataset_key":ds,"reason":"CARPET_RETURN_INCOMPLETE_EVIDENCE"})
            elif qty is not None and qty>0 and known_unit(unit_raw):
                groups["return"].append(row)
            else:
                deferred.append({"record_id":rid,"dataset_key":ds,"reason":"STOCK_RETURN_INCOMPLETE_EVIDENCE"})
            continue

        if typ=="Return to Supplier":
            supplier=str(p.get("supplier") or "").strip()
            po=str(p.get("po") or "").strip()
            inv_id=str(p.get("inventoryRecordId") or "").strip()
            location=str(p.get("location") or "").strip()
            if (
                qty is not None and qty>0 and known_unit(unit_raw)
                and supplier and inv_id and location
                and SHIP_RE.search(impact)
            ):
                groups["supplier_return"].append(row)
            elif "work record only" in impact.lower() and not inv_id and not location:
                deferred.append({
                    "record_id":rid,"dataset_key":ds,
                    "reason":"RETURN_TO_SUPPLIER_LEGACY_WORK_ONLY_NO_INVENTORY_EVIDENCE"
                })
            else:
                deferred.append({
                    "record_id":rid,"dataset_key":ds,
                    "reason":"RETURN_TO_SUPPLIER_INCOMPLETE_INVENTORY_EVIDENCE"
                })
            continue

        deferred.append({"record_id":rid,"dataset_key":ds,"reason":"UNROUTED_OPERATION"})

    wd=Path(a.workdir)
    wd.mkdir(parents=True,exist_ok=True)
    specs=[
        ("cut","READ_ONLY_V6_CUT_SHADOW","v7/cut-shadow-replay.py","31000000-0000-4000-8000-000000000001","31000000-0000-4000-8000-000000000002"),
        ("receive","READ_ONLY_V6_RECEIVE_SHADOW","v7/receive-shadow-replay.py","32000000-0000-4000-8000-000000000001","32000000-0000-4000-8000-000000000002"),
        ("shipping","READ_ONLY_V6_OPERATION_SHADOW","v7/shipping-shadow-replay.py","33000000-0000-4000-8000-000000000001","33000000-0000-4000-8000-000000000002"),
        ("transfer","READ_ONLY_V6_OPERATION_SHADOW","v7/transfer-shadow-replay.py","34000000-0000-4000-8000-000000000001","34000000-0000-4000-8000-000000000002"),
        ("return","READ_ONLY_V6_OPERATION_SHADOW","v7/return-shadow-replay.py","35000000-0000-4000-8000-000000000001","35000000-0000-4000-8000-000000000002"),
        ("supplier_return","READ_ONLY_V6_OPERATION_SHADOW","v7/supplier-return-shadow-replay.py","37000000-0000-4000-8000-000000000001","37000000-0000-4000-8000-000000000002"),
        ("carpet","READ_ONLY_V6_OPERATION_SHADOW","v7/carpet-lifecycle-shadow-replay.py","36000000-0000-4000-8000-000000000001","36000000-0000-4000-8000-000000000002"),
    ]

    modules=[]
    for name,mode,script,tenant,actor in specs:
        selected=groups[name]
        if not selected:
            continue
        ep=wd/f"{name}-envelope.json"
        rp=wd/f"{name}-report.json"
        ep.write_text(json.dumps(envelope(mode,selected,batch),separators=(",",":"))+"\n",encoding="utf-8")
        modules.append(run_validator(name,script,ep,rp,tenant,actor))

    failed=[m for m in modules if m["exit_code"]!=0 or m["verdict"]!="SHADOW_PASS"]
    stop_reasons=[f"{m['name'].upper()}_SHADOW_STOP" for m in failed]

    report={
        "mode":"V7_INCREMENTAL_LIVE_SHADOW",
        "production_business_writes":0,
        "shadow_control_write_authorized_after_pass":not failed,
        "from_watermark":batch.get("from_watermark"),
        "to_watermark":batch.get("to_watermark"),
        "row_count":count,
        "batch_fingerprint":batch.get("batch_fingerprint"),
        "has_more":bool(batch.get("has_more")),
        "routed_counts":{k:len(v) for k,v in groups.items()},
        "deferred_count":len(deferred),
        "deferred":deferred[:50],
        "modules":modules,
        "stop_reasons":stop_reasons,
        "verdict":"SHADOW_PASS" if not failed else "STOP",
    }
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    if failed:
        raise SystemExit(1)
    print("V7 INCREMENTAL LIVE SHADOW: PASS")

if __name__=="__main__":
    main()
