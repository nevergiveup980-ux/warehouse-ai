#!/usr/bin/env python3
"""
V7 Order Exception Workbench — real-evidence / synthetic-decision rehearsal.

Uses one real sanitized V6 exception case already loaded into disposable
warehouse_v7_test, but supplies a deliberately synthetic review decision only to
exercise the resolution mechanics. It does NOT assert that the chosen lifecycle
was historically true, and it never writes production.
"""
import argparse,json,os,subprocess,uuid
from pathlib import Path

D=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=(f"host={os.environ.get('PGHOST','localhost')} "
      f"port={os.environ.get('PGPORT','5432')} dbname={D} "
      f"user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
ENV=os.environ.copy(); ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("947a7cb0-4124-4bd6-afca-299aa293d124")

def run(sql,ok=True):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-Atc",sql],
                     text=True,capture_output=True,env=ENV)
    if ok and r.returncode!=0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r

def val(r):
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return xs[-1] if xs else ""

def q(v):
    return "'" + str(v).replace("'","''") + "'"

def inventory_state(tenant):
    return json.loads(val(run(f"""
      with stock as (
        select count(*)::int n,
               coalesce(md5(string_agg(
                 concat_ws('|',id::text,product_id::text,location_id::text,
                 quantity::text,unit,version::text,lifecycle),
                 E'\\n' order by id
               )),'') fp
        from warehouse_v7.stock_item
        where tenant_id={q(tenant)}::uuid
      ), carpet as (
        select count(*)::int n,
               coalesce(md5(string_agg(
                 concat_ws('|',id::text,product_id::text,location_id::text,
                 remaining_sixteenths::text,version::text,lifecycle),
                 E'\\n' order by id
               )),'') fp
        from warehouse_v7.carpet_roll
        where tenant_id={q(tenant)}::uuid
      ), moves as (
        select count(*)::int n
        from warehouse_v7.inventory_movement
        where tenant_id={q(tenant)}::uuid
      )
      select jsonb_build_object(
        'stock_count',(select n from stock),
        'stock_fingerprint',(select fp from stock),
        'carpet_count',(select n from carpet),
        'carpet_fingerprint',(select fp from carpet),
        'movement_count',(select n from moves)
      )::text;
    """)))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--tenant",required=True)
    ap.add_argument("--actor",required=True)
    ap.add_argument("--report",required=True)
    a=ap.parse_args()

    if val(run("select current_database();"))!="warehouse_v7_test":
        raise RuntimeError("WORKBENCH_REAL_EVIDENCE_REHEARSAL_REFUSES_DATABASE")

    case=json.loads(val(run(f"""
      select jsonb_build_object(
        'id',id::text,
        'version',version,
        'reason',reason,
        'order_kind',display_context->>'order_kind',
        'has_identity',(
          coalesce(display_context->>'recovery_key','')<>''
          or coalesce(display_context->>'sales_order_number','')<>''
          or coalesce(display_context->>'purchase_order_number','')<>''
        ),
        'has_product',coalesce(display_context->>'product_label','')<>'',
        'has_quantity',coalesce(display_context->>'quantity','')<>'',
        'has_unit',coalesce(display_context->>'unit','')<>''
      )::text
      from warehouse_v7.order_exception_case
      where tenant_id={q(a.tenant)}::uuid
        and status='open'
        and reason='STRUCTURED_STATUS_MISSING'
        and coalesce(display_context->>'product_label','')<>''
        and coalesce(display_context->>'quantity','')<>''
        and coalesce(display_context->>'unit','')<>''
        and (
          coalesce(display_context->>'recovery_key','')<>''
          or coalesce(display_context->>'sales_order_number','')<>''
          or coalesce(display_context->>'purchase_order_number','')<>''
        )
      order by id
      limit 1;
    """)))
    if not case:
        raise RuntimeError("NO_SAFE_REAL_EVIDENCE_CASE_FOR_REHEARSAL")
    if not all([case["has_identity"],case["has_product"],case["has_quantity"],case["has_unit"]]):
        raise RuntimeError("REAL_EVIDENCE_CASE_MISSING_CANONICAL_FIELDS")

    before=inventory_state(a.tenant)
    case_id=case["id"]
    command=str(uuid.uuid5(NS,"real-evidence-synthetic-decision:"+case_id))

    def resolve():
        return json.loads(val(run(f"""
          set request.jwt.claim.sub={q(a.actor)};
          select warehouse_v7.resolve_order_exception_create_order(
            {q(a.tenant)}::uuid,
            {q(command)}::uuid,
            {q(case_id)}::uuid,
            {int(case["version"])}::bigint,
            {q(case["order_kind"] or "STANDARD")}::text,
            'in_progress'::text,
            'pending'::text,
            '{{}}'::jsonb,
            'SHADOW ONLY: synthetic decision on real sanitized evidence; not a historical status assertion.'::text,
            {q(a.actor)}::uuid,
            'V7_REAL_EVIDENCE_WORKBENCH_SHADOW'::text
          )::text;
        """)))

    first=resolve()
    second=resolve()
    after=inventory_state(a.tenant)

    state=json.loads(val(run(f"""
      select jsonb_build_object(
        'case_status',(select status from warehouse_v7.order_exception_case
          where tenant_id={q(a.tenant)}::uuid and id={q(case_id)}::uuid),
        'case_version',(select version from warehouse_v7.order_exception_case
          where tenant_id={q(a.tenant)}::uuid and id={q(case_id)}::uuid),
        'orders',(select count(*) from warehouse_v7.order_record
          where tenant_id={q(a.tenant)}::uuid and source_identity_key like 'exception:%'),
        'decisions',(select count(*) from warehouse_v7.order_exception_decision
          where tenant_id={q(a.tenant)}::uuid and case_id={q(case_id)}::uuid),
        'events',(select count(*) from warehouse_v7.event
          where tenant_id={q(a.tenant)}::uuid and command_id={q(command)}::uuid),
        'movements',(select count(*) from warehouse_v7.inventory_movement
          where tenant_id={q(a.tenant)}::uuid and command_id={q(command)}::uuid)
      )::text;
    """)))

    stops=[]
    if first.get("status")!="committed":
        stops.append("REAL_EVIDENCE_SYNTHETIC_RESOLUTION_NOT_COMMITTED")
    if second!=first:
        stops.append("REAL_EVIDENCE_SAME_COMMAND_REPLAY_MISMATCH")
    if state.get("case_status")!="resolved" or int(state.get("case_version",-1))!=2:
        stops.append("REAL_EVIDENCE_CASE_STATE_MISMATCH")
    if int(state.get("decisions",-1))!=1 or int(state.get("events",-1))!=1:
        stops.append("REAL_EVIDENCE_DECISION_EVENT_CARDINALITY_MISMATCH")
    if int(state.get("movements",-1))!=0:
        stops.append("REAL_EVIDENCE_RESOLUTION_CREATED_INVENTORY_MOVEMENT")
    if before!=after:
        stops.append("REAL_EVIDENCE_RESOLUTION_CHANGED_INVENTORY_STATE")

    report={
      "mode":"V7_ORDER_EXCEPTION_REAL_EVIDENCE_SYNTHETIC_DECISION",
      "production_writes":0,
      "historical_status_asserted":False,
      "source_case_reason":case["reason"],
      "synthetic_decision":{
        "lifecycle":"in_progress",
        "fulfillment_status":"pending",
        "purpose":"mechanics_only"
      },
      "validation":{
        "resolution_committed":first.get("status")=="committed",
        "same_command_retry_identical":second==first,
        "case_resolved_once":state.get("case_status")=="resolved" and int(state.get("case_version",-1))==2,
        "one_decision_one_event":int(state.get("decisions",-1))==1 and int(state.get("events",-1))==1,
        "zero_command_inventory_movements":int(state.get("movements",-1))==0,
        "global_inventory_state_unchanged":before==after
      },
      "stop_reasons":stops,
      "verdict":"SHADOW_PASS" if not stops else "STOP"
    }
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
    if stops:
        raise SystemExit(1)
    print("V7 ORDER EXCEPTION REAL-EVIDENCE WORKBENCH REHEARSAL: PASS")

if __name__=="__main__":
    main()
