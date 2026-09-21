#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 RECEIVE shadow replay.

Consumes the sanitized read-only V6 receiving feed. Complete legacy receipts are replayed
against isolated synthetic Stock Items in Disposable Postgres, then the same command UUID
is submitted again to prove idempotency.

No production write path exists in this tool.
"""
import argparse
import json
import os
import subprocess
import uuid
from decimal import Decimal, InvalidOperation
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
NS = uuid.UUID("3adf698c-82ba-4e91-9075-e36c8249dcd8")

UNIT_MAP = {
    "box": "BOX", "carton": "BOX",
    "piece": "EACH", "each": "EACH",
    "pail": "PAIL", "bucket": "BUCKET",
    "tube": "TUBE", "roll": "ROLL",
    "gal": "GAL", "gallon": "GAL",
}


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


def dec(v):
    try:
        d = Decimal(str(v).strip())
    except (InvalidOperation, AttributeError):
        return None
    return d if d.is_finite() else None


def normalize_unit(v):
    return UNIT_MAP.get(str(v or "").strip().lower())


def ensure_disposable():
    name = value(run("select current_database();"))
    if name != "warehouse_v7_test":
        raise RuntimeError(f"SHADOW_REFUSES_DATABASE:{name}")


def ensure_actor(tenant, actor):
    run(
        f"""
        insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
        values({q(tenant)}::uuid,{q(actor)}::uuid,'admin','active')
        on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
        """
    )


def seed_product_location(tenant, unit, location_code):
    product = str(uuid.uuid5(NS, "product:" + unit))
    location = str(uuid.uuid5(NS, "location:" + location_code))
    run(
        f"""
        insert into warehouse_v7.product(
          tenant_id,id,legacy_record_id,name,base_unit,coverage_unit,lifecycle
        ) values(
          {q(tenant)}::uuid,{q(product)}::uuid,{q('RECEIVE-SHADOW-PRODUCT:'+unit)},
          {q('Receive Shadow '+unit)}, {q(unit)}, {q(unit)}, 'active'
        ) on conflict(tenant_id,id) do nothing;

        insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle)
        values(
          {q(tenant)}::uuid,{q(location)}::uuid,{q('RSH:'+location_code)},'rack','active'
        ) on conflict(tenant_id,id) do nothing;
        """
    )
    return product, location


def seed_stock(tenant, stock, product, location, before, unit, rid):
    run(
        f"""
        insert into warehouse_v7.stock_item(
          tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id
        ) values(
          {q(tenant)}::uuid,{q(stock)}::uuid,{q(product)}::uuid,{q(location)}::uuid,
          {q(before)}::numeric,{q(unit)},1,'active',{q('RECEIVE-SHADOW:'+rid)}
        );
        """
    )


def call_receive(tenant, actor, command, stock, product, location, qty, unit, expected_version, rid):
    raw = value(run(
        f"""
        set request.jwt.claim.sub={q(actor)};
        select warehouse_v7.receive_stock(
          {q(tenant)}::uuid,
          {q(command)}::uuid,
          {q(product)}::uuid,
          {q(location)}::uuid,
          {q(qty)}::numeric,
          {q(unit)},
          {int(expected_version)},
          {q(stock)}::uuid,
          jsonb_build_object(
            'shadow_mode',true,
            'source_dataset','runlu_receiving_v50',
            'source_record_id',{q(rid)}
          ),
          {q(actor)}::uuid,
          'V7_RECEIVE_SHADOW'
        )::text;
        """
    ))
    return json.loads(raw)


def state(tenant, command, stock):
    raw = value(run(
        f"""
        select jsonb_build_object(
          'command_count',(select count(*) from warehouse_v7.command
            where tenant_id={q(tenant)}::uuid and id={q(command)}::uuid),
          'movement_count',(select count(*) from warehouse_v7.inventory_movement
            where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
          'event_count',(select count(*) from warehouse_v7.event
            where tenant_id={q(tenant)}::uuid and command_id={q(command)}::uuid),
          'quantity',(select quantity::text from warehouse_v7.stock_item
            where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid),
          'version',(select version from warehouse_v7.stock_item
            where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid),
          'lifecycle',(select lifecycle from warehouse_v7.stock_item
            where tenant_id={q(tenant)}::uuid and id={q(stock)}::uuid)
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
    if env.get("mode") != "READ_ONLY_V6_RECEIVE_SHADOW":
        raise RuntimeError("RECEIVE_SHADOW_MODE_INVALID")
    rows = env.get("rows")
    integrity = env.get("source_integrity") or {}
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("RECEIVE_SHADOW_ROWS_REQUIRED")
    if len(rows) != int(integrity.get("total_live_rows", -1)):
        raise RuntimeError("RECEIVE_SHADOW_COUNT_MISMATCH")
    if integrity.get("algorithm") != "postgres-jsonb-row-md5-chain-v1":
        raise RuntimeError("RECEIVE_SHADOW_INTEGRITY_ALGORITHM_INVALID")
    if integrity.get("postgres_jsonb_text_verified") is not True:
        raise RuntimeError("RECEIVE_SHADOW_SOURCE_NOT_POSTGRES_VERIFIED")

    ensure_actor(args.tenant, args.actor)

    eligible = 0
    deferred_not_posted = 0
    deferred_incomplete = 0
    unknown_units = []
    arithmetic_mismatches = []
    engine_mismatches = []
    replay_mismatches = []
    ledger_mismatches = []

    for row in rows:
        rid = str(row.get("record_id") or "")
        p = row.get("payload") or {}
        posted = str(p.get("inventoryPosted") or "").strip().lower() == "true"
        if not posted:
            deferred_not_posted += 1
            continue

        qty = dec(p.get("quantity"))
        before = dec(p.get("inventoryBefore"))
        after = dec(p.get("inventoryAfter"))
        unit = normalize_unit(p.get("unit"))
        location_code = str(p.get("location") or "").strip()
        master_id = str(p.get("masterId") or "").strip()

        if unit is None:
            unknown_units.append(rid)
            continue
        if (
            qty is None or before is None or after is None
            or qty <= 0 or before < 0 or after < 0
            or not location_code or not master_id
        ):
            deferred_incomplete += 1
            continue

        eligible += 1
        if before + qty != after:
            arithmetic_mismatches.append(rid)
            continue

        product, location = seed_product_location(args.tenant, unit, location_code)
        stock = str(uuid.uuid5(NS, "stock:" + rid))
        command = str(uuid.uuid5(NS, "command:" + rid))
        expected_version = 0

        if before > 0:
            seed_stock(args.tenant, stock, product, location, before, unit, rid)
            expected_version = 1

        first = call_receive(
            args.tenant, args.actor, command, stock, product, location,
            qty, unit, expected_version, rid
        )
        state1 = state(args.tenant, command, stock)
        second = call_receive(
            args.tenant, args.actor, command, stock, product, location,
            qty, unit, expected_version, rid
        )
        state2 = state(args.tenant, command, stock)

        expected_version_after = 1 if before == 0 else 2
        state_qty = dec(state1.get("quantity"))

        if (
            first.get("status") != "committed"
            or dec(first.get("received")) != qty
            or int(first.get("new_version", -1)) != expected_version_after
            or state_qty != after
            or int(state1.get("version", -1)) != expected_version_after
            or state1.get("lifecycle") != "active"
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
    if unknown_units:
        stop_reasons.append("V6_RECEIVE_UNKNOWN_UNIT")
    if arithmetic_mismatches:
        stop_reasons.append("V6_RECEIVE_ARITHMETIC_MISMATCH")
    if engine_mismatches:
        stop_reasons.append("V7_RECEIVE_ENGINE_MISMATCH")
    if replay_mismatches:
        stop_reasons.append("V7_RECEIVE_REPLAY_MISMATCH")
    if ledger_mismatches:
        stop_reasons.append("V7_RECEIVE_LEDGER_CARDINALITY_MISMATCH")
    if eligible == 0:
        stop_reasons.append("NO_ELIGIBLE_RECEIPTS")

    report = {
        "mode": "V7_RECEIVE_SHADOW_REPLAY",
        "production_writes": 0,
        "source_integrity": {
            "algorithm": integrity.get("algorithm"),
            "snapshot_md5": integrity.get("snapshot_md5"),
            "total_live_rows": int(integrity.get("total_live_rows", -1)),
            "postgres_jsonb_text_verified": True,
        },
        "observed": {
            "total_receiving_rows": len(rows),
            "eligible_complete_posted_receipts": eligible,
            "deferred_not_posted": deferred_not_posted,
            "deferred_missing_before_after_or_identity": deferred_incomplete,
            "unknown_unit_rows": len(unknown_units),
        },
        "validation": {
            "exact_v6_before_plus_receive_equals_after_pass": eligible - len(arithmetic_mismatches),
            "v7_engine_pass": eligible - len(engine_mismatches),
            "same_command_replay_pass": eligible - len(replay_mismatches),
            "one_command_one_movement_one_event_pass": eligible - len(ledger_mismatches),
        },
        "failure_record_ids": {
            "unknown_unit": unknown_units[:25],
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
    print("V7 RECEIVE SHADOW REPLAY: PASS")


if __name__ == "__main__":
    main()
