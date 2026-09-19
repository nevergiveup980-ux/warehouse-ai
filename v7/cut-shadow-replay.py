#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 CUT shadow replay.

Consumes a sanitized, read-only V6 cutting-log envelope from the OIDC snapshot bridge.
Each historically complete CUT is replayed against an isolated synthetic Carpet Roll in
Disposable Postgres. The same command UUID is then submitted again to prove idempotency.

No production write path exists in this tool.
"""
import argparse
import json
import os
import subprocess
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

DB = os.environ.get("PGDATABASE", "warehouse_v7_test")
CONN = (
    f"host={os.environ.get('PGHOST','localhost')} "
    f"port={os.environ.get('PGPORT','5432')} "
    f"dbname={DB} user={os.environ.get('PGUSER','postgres')} "
    f"password={os.environ.get('PGPASSWORD','postgres')}"
)
ENV = os.environ.copy()
ENV.setdefault("PGPASSWORD", os.environ.get("PGPASSWORD", "postgres"))

NS = uuid.UUID("7c8ec838-590e-4af0-93ac-e20de6616a51")


def run(sql, ok=True):
    r = subprocess.run(
        ["psql", CONN, "-v", "ON_ERROR_STOP=1", "-Atc", sql],
        text=True, capture_output=True, env=ENV
    )
    if ok and r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r


def value(r):
    lines = [x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip() != "SET"]
    return lines[-1] if lines else ""


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def as_units(value):
    try:
        d = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return None
    if not d.is_finite() or d < 0:
        return None
    return int((d * Decimal(192)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def ensure_disposable():
    name = value(run("select current_database();"))
    if name != "warehouse_v7_test":
        raise RuntimeError(f"SHADOW_REFUSES_DATABASE:{name}")


def setup_shadow(tenant, actor):
    product = str(uuid.uuid5(NS, "shadow-product"))
    location = str(uuid.uuid5(NS, "shadow-location"))
    run(
        f"""
        insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
        values({q(tenant)}::uuid,{q(actor)}::uuid,'admin','active')
        on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';

        insert into warehouse_v7.product(
          tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle
        ) values(
          {q(tenant)}::uuid,{q(product)}::uuid,'CUT-SHADOW-PRODUCT',
          'CUT Shadow Product','1/16_IN','1/16_IN','active'
        ) on conflict(tenant_id,id) do nothing;

        insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
        values(
          {q(tenant)}::uuid,{q(location)}::uuid,'CUT-SHADOW','rack','active'
        ) on conflict(tenant_id,id) do nothing;
        """
    )
    return product, location


def call_cut(tenant, actor, command, roll, deduct, source_record_id):
    sql = f"""
      set request.jwt.claim.sub={q(actor)};
      select warehouse_v7.cut_carpet_roll(
        {q(tenant)}::uuid,
        {q(command)}::uuid,
        {q(roll)}::uuid,
        1,
        {int(deduct)},
        jsonb_build_object(
          'shadow_mode',true,
          'source_dataset','runlu_cutting_log_v52',
          'source_record_id',{q(source_record_id)}
        ),
        {q(actor)}::uuid,
        'V7_CUT_SHADOW'
      )::text;
    """
    return json.loads(value(run(sql)))


def seed_roll(tenant, product, location, roll_id, record_id, roll_number, before):
    run(
        f"""
        insert into warehouse_v7.carpet_roll(
          tenant_id,id,roll_number,physical_key,product_id,location_id,
          original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle,legacy_record_id
        ) values(
          {q(tenant)}::uuid,{q(roll_id)}::uuid,{q(roll_number or record_id)},
          {q('cut-shadow:'+record_id)},
          {q(product)}::uuid,{q(location)}::uuid,
          {int(before)},{int(before)},'CAL',1,'active',{q('CUT-SHADOW:'+record_id)}
        );
        """
    )


def ledger_state(tenant, command, roll):
    raw = value(run(
        f"""
        select jsonb_build_object(
          'command_count',(select count(*) from warehouse_v7.command
            where tenant_id={q(tenant)}::uuid and id={q(command)}::uuid),
          'movement_count',(select count(*) from warehouse_v7.inventory_movement
            where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
          'event_count',(select count(*) from warehouse_v7.event
            where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
          'remaining',(select remaining_sixteenths from warehouse_v7.carpet_roll
            where tenant_id={q(tenant)}::uuid and id={q(roll)}::uuid),
          'version',(select version from warehouse_v7.carpet_roll
            where tenant_id={q(tenant)}::uuid and id={q(roll)}::uuid),
          'lifecycle',(select lifecycle from warehouse_v7.carpet_roll
            where tenant_id={q(tenant)}::uuid and id={q(roll)}::uuid)
        )::text;
        """
    ))
    return json.loads(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("envelope")
    ap.add_argument("--report", required=True)
    ap.add_argument("--tenant", required=True)
    ap.add_argument("--actor", required=True)
    args = ap.parse_args()

    ensure_disposable()
    env = json.loads(Path(args.envelope).read_text(encoding="utf-8"))
    if env.get("mode") != "READ_ONLY_V6_CUT_SHADOW":
        raise RuntimeError("CUT_SHADOW_MODE_INVALID")
    rows = env.get("rows")
    integrity = env.get("source_integrity") or {}
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("CUT_SHADOW_ROWS_REQUIRED")
    if len(rows) != int(integrity.get("total_live_rows", -1)):
        raise RuntimeError("CUT_SHADOW_COUNT_MISMATCH")
    if integrity.get("algorithm") != "postgres-jsonb-row-md5-chain-v1":
        raise RuntimeError("CUT_SHADOW_INTEGRITY_ALGORITHM_INVALID")
    if integrity.get("postgres_jsonb_text_verified") is not True:
        raise RuntimeError("CUT_SHADOW_SOURCE_NOT_POSTGRES_VERIFIED")

    product, location = setup_shadow(args.tenant, args.actor)

    eligible = 0
    deferred = 0
    legacy_flag_warnings = []
    arithmetic_mismatches = []
    engine_mismatches = []
    replay_mismatches = []
    ledger_mismatches = []

    for row in rows:
        rid = str(row.get("record_id") or "")
        p = row.get("payload") or {}
        before = as_units(p.get("beforeLength"))
        actual = as_units(p.get("actualCutLength"))
        remaining = as_units(p.get("remainingLength"))
        if before is None or actual is None or remaining is None or before <= 0 or actual <= 0:
            deferred += 1
            continue
        eligible += 1

        if before - actual != remaining:
            arithmetic_mismatches.append(rid)
            continue

        raw_full = str(p.get("fullRollConsumed") or "").strip().lower()
        declared_full = raw_full == "true"
        if raw_full in ("true", "false") and declared_full != (remaining == 0):
            legacy_flag_warnings.append(rid)

        roll_id = str(uuid.uuid5(NS, "roll:" + rid))
        command_id = str(uuid.uuid5(NS, "command:" + rid))
        seed_roll(
            args.tenant, product, location, roll_id, rid,
            str(p.get("roll") or rid), before
        )

        first = call_cut(args.tenant, args.actor, command_id, roll_id, actual, rid)
        state1 = ledger_state(args.tenant, command_id, roll_id)
        second = call_cut(args.tenant, args.actor, command_id, roll_id, actual, rid)
        state2 = ledger_state(args.tenant, command_id, roll_id)

        if (
            first.get("status") != "committed"
            or int(first.get("before_sixteenths", -1)) != before
            or int(first.get("deducted_sixteenths", -1)) != actual
            or int(first.get("remaining_sixteenths", -1)) != remaining
            or int(state1.get("remaining", -1)) != remaining
            or int(state1.get("version", -1)) != 2
            or state1.get("lifecycle") != ("consumed" if remaining == 0 else "active")
        ):
            engine_mismatches.append(rid)

        if second != first or state2 != state1:
            replay_mismatches.append(rid)

        if (
            int(state2.get("command_count", -1)) != 1
            or int(state2.get("movement_count", -1)) != 1
            or int(state2.get("event_count", -1)) != 1
        ):
            ledger_mismatches.append(rid)

    stop_reasons = []
    if arithmetic_mismatches:
        stop_reasons.append("V6_CUT_ARITHMETIC_MISMATCH")
    if engine_mismatches:
        stop_reasons.append("V7_CUT_ENGINE_MISMATCH")
    if replay_mismatches:
        stop_reasons.append("V7_CUT_REPLAY_MISMATCH")
    if ledger_mismatches:
        stop_reasons.append("V7_CUT_LEDGER_CARDINALITY_MISMATCH")
    if eligible == 0:
        stop_reasons.append("NO_ELIGIBLE_CUTS")

    report = {
        "mode": "V7_CUT_SHADOW_REPLAY",
        "production_writes": 0,
        "source_integrity": {
            "algorithm": integrity.get("algorithm"),
            "snapshot_md5": integrity.get("snapshot_md5"),
            "total_live_rows": int(integrity.get("total_live_rows", -1)),
            "postgres_jsonb_text_verified": True,
        },
        "observed": {
            "total_cut_rows": len(rows),
            "eligible_complete_cuts": eligible,
            "deferred_incomplete_legacy_cuts": deferred,
            "legacy_full_consumed_flag_warnings": len(legacy_flag_warnings),
        },
        "validation": {
            "exact_v6_arithmetic_pass": eligible - len(arithmetic_mismatches),
            "v7_engine_pass": eligible - len(engine_mismatches),
            "same_command_replay_pass": eligible - len(replay_mismatches),
            "one_command_one_movement_one_event_pass": eligible - len(ledger_mismatches),
        },
        "warning_record_ids": {
            "legacy_full_consumed_flag": legacy_flag_warnings[:25],
        },
        "failure_record_ids": {
            "arithmetic": arithmetic_mismatches[:25],
            "engine": engine_mismatches[:25],
            "replay": replay_mismatches[:25],
            "ledger": ledger_mismatches[:25],
        },
        "stop_reasons": stop_reasons,
        "verdict": "SHADOW_PASS" if not stop_reasons else "STOP",
    }
    Path(args.report).write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if stop_reasons:
        raise SystemExit(1)
    print("V7 CUT SHADOW REPLAY: PASS")


if __name__ == "__main__":
    main()
