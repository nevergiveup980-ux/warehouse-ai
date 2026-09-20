#!/usr/bin/env python3
"""
RUNLU Warehouse OS V7 Wave 2 strict order migration rehearsal.

Consumes the sanitized V6 order shadow feed and writes only to Disposable Postgres.

Rules:
- every source row becomes append-only order_source_evidence;
- only groups with strong identity + stable critical fields + explicit monotonic
  structured status become canonical order_record rows;
- missing status, weak identity, identity conflict, unknown status, and lifecycle
  regression are quarantined as evidence only;
- no inventory balance is touched;
- replaying the same source snapshot must add zero rows and preserve the exact
  canonical/evidence fingerprint.
"""
import argparse
import hashlib
import json
import os
import subprocess
import uuid
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

DB=os.environ.get("PGDATABASE","warehouse_v7_test")
CONN=(f"host={os.environ.get('PGHOST','localhost')} "
      f"port={os.environ.get('PGPORT','5432')} dbname={DB} "
      f"user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}")
ENV=os.environ.copy(); ENV.setdefault("PGPASSWORD",os.environ.get("PGPASSWORD","postgres"))
NS=uuid.UUID("0ec9340f-9943-4838-b8c9-2c28673ac3ab")

STD_STATUS_RANK={"Draft":0,"In Progress":1,"Completed":2,"Archived":3}
SPECIAL_STATUS_RANK={"Ready for Pickup":1,"Picked Up":2,"Completed":3}

def run(sql,ok=True):
    r=subprocess.run(["psql",CONN,"-v","ON_ERROR_STOP=1","-Atc",sql],
                     text=True,capture_output=True,env=ENV)
    if ok and r.returncode!=0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r

def value(r):
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!="SET"]
    return xs[-1] if xs else ""

def q(v):
    return "'" + str(v).replace("'","''") + "'"

def norm(v):
    return str(v or "").strip()

def md5(s):
    return hashlib.md5(s.encode("utf-8")).hexdigest()

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
    return "business:"+md5("|".join(fields)) if all(fields) else None

def identity(dataset,row):
    p=row.get("payload") or {}
    recovery=norm(p.get("recoveryKey"))
    if recovery:
        return f"{dataset}:recovery:{recovery}","recovery"
    if dataset=="runlu_orders_v20":
        comp=strong_standard_composite(p)
        if comp:
            return f"{dataset}:{comp}","business_composite"
    return f"{dataset}:legacy:{row.get('record_id')}","legacy_weak"

def critical_signature(dataset,p):
    if dataset=="runlu_orders_v20":
        fields=[
            norm(p.get("type")),norm(p.get("soNumber")),norm(p.get("poNumber")),
            norm(p.get("customer")),norm(p.get("product")),
            norm(p.get("quantity")),norm(p.get("unit")),
        ]
    else:
        fields=[
            norm(p.get("po")),norm(p.get("customer")),norm(p.get("product")),
            norm(p.get("quantity")),norm(p.get("unit")),
        ]
    return md5("|".join(fields))

def presentation_signature(p):
    return md5("|".join([norm(p.get("status")),norm(p.get("location"))]))

def status_rank(dataset,status):
    status=norm(status)
    if dataset=="runlu_orders_v20":
        return STD_STATUS_RANK.get(status)
    return SPECIAL_STATUS_RANK.get(status)

def mapped_state(dataset,status):
    if dataset=="runlu_orders_v20":
        if status=="Draft": return "draft","unverified"
        if status=="In Progress": return "in_progress","unverified"
        if status=="Completed": return "completed","completed"
        if status=="Archived": return "archived","completed"
    else:
        if status=="Ready for Pickup": return "in_progress","ready_for_pickup"
        if status=="Picked Up": return "in_progress","picked_up"
        if status=="Completed": return "completed","completed"
    raise RuntimeError("ORDER_STATUS_MAPPING_MISSING:"+dataset+":"+status)

def classify(dataset,grp):
    grp=sorted(grp,key=lambda r:(norm(r.get("updated_at")),norm(r.get("record_id"))))
    strengths={r["_identity_strength"] for r in grp}
    critical={critical_signature(dataset,r.get("payload") or {}) for r in grp}
    presentation={presentation_signature(r.get("payload") or {}) for r in grp}

    explicit=[]
    unknown=[]
    prev=None
    regression=False
    for r in grp:
        s=norm((r.get("payload") or {}).get("status"))
        if not s:
            continue
        rank=status_rank(dataset,s)
        if rank is None:
            unknown.append(s)
            continue
        if prev is not None and rank<prev:
            regression=True
        prev=rank
        explicit.append((r,s,rank))

    if "legacy_weak" in strengths:
        return "deferred","WEAK_SOURCE_IDENTITY",False,None
    if len(critical)>1:
        return "identity_conflict","IDENTITY_CRITICAL_FIELDS_CONFLICT",False,None
    if unknown:
        return "deferred","UNKNOWN_STRUCTURED_STATUS",False,None
    if regression:
        return "lifecycle_regression","STRUCTURED_STATUS_MOVED_BACKWARD",False,None
    if not explicit:
        return "deferred","STRUCTURED_STATUS_MISSING",False,None

    if len(grp)==1:
        evidence_class="singleton"
    elif len(presentation)==1:
        evidence_class="replay_duplicate"
    else:
        evidence_class="lifecycle_evidence"

    return evidence_class,None,True,explicit[-1][1]

def state_fingerprint(tenant):
    return json.loads(value(run(f"""
      with orders as (
        select coalesce(md5(string_agg(
          concat_ws('|',
            id::text,order_kind,source_identity_key,coalesce(recovery_key,''),
            coalesce(sales_order_number,''),coalesce(purchase_order_number,''),
            coalesce(customer_label,''),coalesce(product_label,''),
            coalesce(source_location,''),coalesce(quantity::text,''),coalesce(unit,''),
            lifecycle,fulfillment_status,version::text
          ),E'\\n' order by id
        )),'') as fp,
        count(*)::int as n
        from warehouse_v7.order_record where tenant_id={q(tenant)}::uuid
      ), evidence as (
        select coalesce(md5(string_agg(
          concat_ws('|',
            id::text,coalesce(order_id::text,''),coalesce(exception_case_id::text,''),
            source_dataset,source_record_id,
            coalesce(recovery_key,''),evidence_class,source_fingerprint,
            coalesce(exception_reason,''),source_payload::text,
            coalesce(source_updated_at::text,'')
          ),E'\\n' order by id
        )),'') as fp,
        count(*)::int as n
        from warehouse_v7.order_source_evidence where tenant_id={q(tenant)}::uuid
      ), exceptions as (
        select coalesce(md5(string_agg(
          concat_ws('|',
            id::text,case_key,source_dataset,reason,status,group_fingerprint,
            evidence_count::text,required_confirmation::text,display_context::text,
            version::text,coalesce(resolved_order_id::text,'')
          ),E'\\n' order by id
        )),'') as fp,
        count(*)::int as n
        from warehouse_v7.order_exception_case where tenant_id={q(tenant)}::uuid
      )
      select jsonb_build_object(
        'orders',(select n from orders),
        'order_fingerprint',(select fp from orders),
        'evidence',(select n from evidence),
        'evidence_fingerprint',(select fp from evidence),
        'exception_cases',(select n from exceptions),
        'exception_fingerprint',(select fp from exceptions)
      )::text;
    """)))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("envelope")
    ap.add_argument("--report",required=True)
    ap.add_argument("--tenant",required=True)
    ap.add_argument("--actor",required=True)
    a=ap.parse_args()

    db=value(run("select current_database();"))
    if db!="warehouse_v7_test":
        raise RuntimeError("ORDER_REHEARSAL_REFUSES_DATABASE:"+db)

    env=json.loads(Path(a.envelope).read_text(encoding="utf-8"))
    if env.get("mode")!="READ_ONLY_V6_ORDER_SHADOW":
        raise RuntimeError("ORDER_SHADOW_MODE_INVALID")
    rows=env.get("rows")
    integ=env.get("source_integrity") or {}
    if not isinstance(rows,list) or len(rows)!=int(integ.get("total_live_rows",-1)):
        raise RuntimeError("ORDER_SHADOW_COUNT_MISMATCH")

    fps=[]
    for row in sorted(rows,key=lambda r:(norm(r.get("dataset_key")),norm(r.get("record_id")))):
        fp=norm(row.get("source_row_md5")).lower()
        if len(fp)!=32 or any(ch not in "0123456789abcdef" for ch in fp):
            raise RuntimeError("ORDER_SHADOW_ROW_FINGERPRINT_INVALID")
        fps.append(fp)
    if md5("\n".join(fps))!=norm(integ.get("snapshot_md5")).lower():
        raise RuntimeError("ORDER_SHADOW_FINGERPRINT_MISMATCH")

    run(f"""
      insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
      values({q(a.tenant)}::uuid,{q(a.actor)}::uuid,'admin','active')
      on conflict(tenant_id,user_id) do update set role='admin',lifecycle='active';
    """)

    groups=defaultdict(list)
    for row in rows:
        ds=norm(row.get("dataset_key"))
        if ds not in ("runlu_orders_v20","runlu_special_orders_v51"):
            raise RuntimeError("ORDER_SHADOW_UNEXPECTED_DATASET:"+ds)
        key,strength=identity(ds,row)
        row["_identity_key"]=key
        row["_identity_strength"]=strength
        groups[key].append(row)

    before=state_fingerprint(a.tenant)
    new_orders=0
    new_evidence=0
    new_exception_cases=0
    importable=0
    quarantine_counts=defaultdict(int)
    evidence_counts=defaultdict(int)

    for key,grp in sorted(groups.items()):
        grp=sorted(grp,key=lambda r:(norm(r.get("updated_at")),norm(r.get("record_id"))))
        ds=grp[0]["dataset_key"]
        eclass,reason,can_import,final_status=classify(ds,grp)
        evidence_counts[eclass]+=len(grp)
        if not can_import:
            quarantine_counts[reason]+=1

        order_id=None
        exception_case_id=None
        if not can_import:
            exception_case_id=str(uuid.uuid5(NS,"exception:"+key))
            case_key="v6:"+md5(key)
            group_fingerprint=md5("\n".join(
                norm(r.get("source_row_md5")).lower() for r in grp
            ))
            latest=grp[-1].get("payload") or {}
            if reason=="STRUCTURED_STATUS_MISSING":
                required=["lifecycle","fulfillment_status","resolution_note"]
            elif reason=="IDENTITY_CRITICAL_FIELDS_CONFLICT":
                required=[
                    "canonical_identity","lifecycle",
                    "fulfillment_status","resolution_note"
                ]
            elif reason=="STRUCTURED_STATUS_MOVED_BACKWARD":
                required=[
                    "final_lifecycle","final_fulfillment_status","resolution_note"
                ]
            elif reason=="WEAK_SOURCE_IDENTITY":
                required=[
                    "canonical_identity","lifecycle",
                    "fulfillment_status","resolution_note"
                ]
            else:
                required=["human_review","resolution_note"]

            context={
                "order_kind":"STANDARD" if ds=="runlu_orders_v20" else "SPECIAL",
                "sales_order_number":norm(latest.get("soNumber")) or None,
                "purchase_order_number":(
                    norm(latest.get("poNumber")) if ds=="runlu_orders_v20"
                    else norm(latest.get("po"))
                ) or None,
                "customer_label":norm(latest.get("customer")) or None,
                "product_label":norm(latest.get("product")) or None,
                "source_location":norm(latest.get("location")) or None,
                "quantity":norm(latest.get("quantity")) or None,
                "unit":norm(latest.get("unit")) or None,
                "latest_structured_status":norm(latest.get("status")) or None,
            }
            inserted_case=value(run(f"""
              with ins as (
                insert into warehouse_v7.order_exception_case(
                  tenant_id,id,case_key,source_dataset,reason,status,
                  group_fingerprint,evidence_count,required_confirmation,
                  display_context,version
                ) values(
                  {q(a.tenant)}::uuid,{q(exception_case_id)}::uuid,{q(case_key)},
                  {q(ds)},{q(reason)},'open',{q(group_fingerprint)},{len(grp)},
                  {q(json.dumps(required,separators=(",",":")))}::jsonb,
                  {q(json.dumps(context,separators=(",",":"),sort_keys=True))}::jsonb,
                  1
                )
                on conflict(tenant_id,case_key) do nothing
                returning 1
              ) select count(*) from ins;
            """))
            new_exception_cases+=int(inserted_case or 0)

        if can_import:
            importable+=1
            representative=grp[-1]
            p=representative.get("payload") or {}
            lifecycle,fulfillment=mapped_state(ds,final_status)
            order_id=str(uuid.uuid5(NS,"order:"+key))
            source_identity_key="v6:"+md5(key)
            recovery=norm(p.get("recoveryKey")) or None
            so=norm(p.get("soNumber")) or None
            po=(norm(p.get("poNumber")) if ds=="runlu_orders_v20" else norm(p.get("po"))) or None
            customer=norm(p.get("customer")) or None
            product=norm(p.get("product")) or None
            location=norm(p.get("location")) or None
            quantity=dec(p.get("quantity"))
            unit=norm(p.get("unit")).upper() or None
            kind="STANDARD" if ds=="runlu_orders_v20" else "SPECIAL"

            insert=value(run(f"""
              with ins as (
                insert into warehouse_v7.order_record(
                  tenant_id,id,order_kind,source_identity_key,recovery_key,
                  sales_order_number,purchase_order_number,customer_label,product_label,
                  source_location,quantity,unit,lifecycle,fulfillment_status,version
                ) values(
                  {q(a.tenant)}::uuid,{q(order_id)}::uuid,{q(kind)},{q(source_identity_key)},
                  {("null" if recovery is None else q(recovery))},
                  {("null" if so is None else q(so))},
                  {("null" if po is None else q(po))},
                  {("null" if customer is None else q(customer))},
                  {("null" if product is None else q(product))},
                  {("null" if location is None else q(location))},
                  {("null" if quantity is None else q(quantity)+"::numeric")},
                  {("null" if unit is None else q(unit))},
                  {q(lifecycle)},{q(fulfillment)},1
                )
                on conflict(tenant_id,order_kind,source_identity_key) do nothing
                returning 1
              ) select count(*) from ins;
            """))
            new_orders+=int(insert or 0)

        for row in grp:
            p=row.get("payload") or {}
            fp=norm(row.get("source_row_md5")).lower()
            evidence_id=str(uuid.uuid5(NS,"evidence:"+ds+":"+norm(row.get("record_id"))+":"+fp))
            recovery=norm(p.get("recoveryKey")) or None
            payload=json.dumps(p,separators=(",",":"),sort_keys=True)
            updated=norm(row.get("updated_at")) or None
            inserted=value(run(f"""
              with ins as (
                insert into warehouse_v7.order_source_evidence(
                  tenant_id,id,order_id,exception_case_id,source_dataset,source_record_id,recovery_key,
                  evidence_class,source_fingerprint,exception_reason,
                  source_payload,source_updated_at
                ) values(
                  {q(a.tenant)}::uuid,{q(evidence_id)}::uuid,
                  {("null" if order_id is None else q(order_id)+"::uuid")},
                  {("null" if exception_case_id is None else q(exception_case_id)+"::uuid")},
                  {q(ds)},{q(norm(row.get("record_id")))},
                  {("null" if recovery is None else q(recovery))},
                  {q(eclass)},{q(fp)},
                  {("null" if reason is None else q(reason))},
                  {q(payload)}::jsonb,
                  {("null" if updated is None else q(updated)+"::timestamptz")}
                )
                on conflict(tenant_id,source_dataset,source_record_id,source_fingerprint)
                do nothing
                returning 1
              ) select count(*) from ins;
            """))
            new_evidence+=int(inserted or 0)

    after=state_fingerprint(a.tenant)
    expected_evidence=len(rows)
    expected_exception_cases=sum(quarantine_counts.values())
    stops=[]
    if after["orders"]!=importable:
        stops.append("CANONICAL_ORDER_COUNT_MISMATCH")
    if after["evidence"]!=expected_evidence:
        stops.append("ORDER_EVIDENCE_COUNT_MISMATCH")
    if after["exception_cases"]!=expected_exception_cases:
        stops.append("ORDER_EXCEPTION_CASE_COUNT_MISMATCH")
    if sum(quarantine_counts.values())+importable!=len(groups):
        stops.append("ORDER_GROUP_RECONCILIATION_MISMATCH")

    report={
      "mode":"V7_ORDER_MIGRATION_REHEARSAL",
      "production_writes":0,
      "inventory_writes":0,
      "source_integrity":{
        "snapshot_md5":integ.get("snapshot_md5"),
        "rows":len(rows),
        "row_md5_chain_verified":True,
      },
      "expected":{
        "identity_groups":len(groups),
        "canonical_orders":importable,
        "source_evidence_rows":expected_evidence,
        "exception_cases":expected_exception_cases,
      },
      "actual":after,
      "new_rows":{
        "canonical_orders":new_orders,
        "source_evidence":new_evidence,
        "exception_cases":new_exception_cases,
      },
      "evidence_rows_by_class":dict(sorted(evidence_counts.items())),
      "quarantined_groups_by_reason":dict(sorted(quarantine_counts.items())),
      "state_changed":before!=after,
      "stop_reasons":stops,
      "verdict":"REHEARSAL_PASS" if not stops else "STOP",
    }
    Path(a.report).write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    if stops:
        raise SystemExit(1)
    print("V7 ORDER MIGRATION REHEARSAL: PASS")

if __name__=="__main__":
    main()
