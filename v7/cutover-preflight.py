#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 controlled-cutover preflight gate.

This tool never writes production data. It compares:
1) the read-only V6 source fingerprint captured before rehearsal,
2) the fingerprint captured after rehearsal,
3) two disposable V7 dry-run reconciliation reports.

It emits a sanitized report and exits non-zero on any stop condition.
"""
import argparse
import json
import sys
from pathlib import Path


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dataset_map(integrity):
    rows = integrity.get("datasets") or []
    if isinstance(rows, dict):
        return {
            k: {
                "live_rows": int(v.get("live_rows", -1)),
                "content_md5": v.get("content_md5"),
            }
            for k, v in rows.items()
        }
    return {
        x["dataset_key"]: {
            "live_rows": int(x.get("live_rows", -1)),
            "content_md5": x.get("content_md5"),
        }
        for x in rows
    }


def source_summary(integrity):
    return {
        "algorithm": integrity.get("algorithm"),
        "snapshot_md5": integrity.get("snapshot_md5"),
        "total_live_rows": int(integrity.get("total_live_rows", -1)),
        "postgres_jsonb_text_verified": integrity.get("postgres_jsonb_text_verified") is True,
        "datasets": dataset_map(integrity),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start-integrity", required=True)
    ap.add_argument("--end-integrity", required=True)
    ap.add_argument("--dry-run-1", required=True)
    ap.add_argument("--dry-run-2", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--expected-source-md5", default="")
    args = ap.parse_args()

    start = source_summary(load(args.start_integrity))
    end = source_summary(load(args.end_integrity))
    first = load(args.dry_run_1)
    second = load(args.dry_run_2)
    expected = args.expected_source_md5.strip().lower()

    checks = {}
    checks["source_start_is_postgres_verified"] = (
        start["algorithm"] == "postgres-jsonb-row-md5-chain-v1"
        and start["postgres_jsonb_text_verified"]
    )
    checks["source_end_is_postgres_verified"] = (
        end["algorithm"] == "postgres-jsonb-row-md5-chain-v1"
        and end["postgres_jsonb_text_verified"]
    )
    checks["source_has_rows"] = start["total_live_rows"] > 0
    checks["source_snapshot_stable_during_rehearsal"] = (
        start["snapshot_md5"] == end["snapshot_md5"]
        and start["total_live_rows"] == end["total_live_rows"]
        and start["datasets"] == end["datasets"]
    )
    checks["expected_snapshot_lock_matches"] = (
        True if not expected else (
            str(start["snapshot_md5"]).lower() == expected
            and str(end["snapshot_md5"]).lower() == expected
        )
    )

    for label, report in (("first", first), ("replay", second)):
        rec = report.get("reconciliation") or {}
        actual = rec.get("actual") or {}
        checks[f"{label}_is_disposable_mode"] = report.get("mode") == "DISPOSABLE_POSTGRES_DRY_RUN"
        checks[f"{label}_production_writes_zero"] = report.get("production_writes") == 0
        checks[f"{label}_source_matches_start"] = (
            (report.get("source_integrity") or {}).get("snapshot_md5") == start["snapshot_md5"]
        )
        checks[f"{label}_reconciliation_pass"] = rec.get("pass") is True
        checks[f"{label}_invalid_canonical_links_zero"] = actual.get("invalid_with_canonical_link") == 0

    checks["replay_manifest_identical"] = first.get("manifest_summary") == second.get("manifest_summary")
    checks["replay_expected_identical"] = (
        (first.get("reconciliation") or {}).get("expected")
        == (second.get("reconciliation") or {}).get("expected")
    )
    checks["replay_actual_identical"] = (
        (first.get("reconciliation") or {}).get("actual")
        == (second.get("reconciliation") or {}).get("actual")
    )
    checks["replay_checks_identical"] = (
        (first.get("reconciliation") or {}).get("checks")
        == (second.get("reconciliation") or {}).get("checks")
    )

    failed = [name for name, ok in checks.items() if not ok]
    rec = first.get("reconciliation") or {}
    actual = rec.get("actual") or {}
    report = {
        "mode": "CONTROLLED_CUTOVER_PREFLIGHT_ONLY",
        "production_write_authorized": False,
        "production_writes": 0,
        "source_start": start,
        "source_end": end,
        "expected_snapshot_lock": expected or None,
        "manifest_summary": first.get("manifest_summary"),
        "reconciliation": {
            "expected": rec.get("expected"),
            "actual": actual,
            "expected_stock_quantity_by_unit": rec.get("expected_stock_quantity_by_unit"),
            "expected_carpet_remaining_sixteenths": rec.get("expected_carpet_remaining_sixteenths"),
            "checks": rec.get("checks"),
        },
        "preflight_checks": checks,
        "stop_reasons": failed,
        "verdict": "PREFLIGHT_PASS" if not failed else "STOP",
    }

    Path(args.report).write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))

    if failed:
        print("CUTOVER PREFLIGHT STOP: " + ", ".join(failed), file=sys.stderr)
        raise SystemExit(1)

    print("CONTROLLED CUTOVER PREFLIGHT: PASS")


if __name__ == "__main__":
    main()
