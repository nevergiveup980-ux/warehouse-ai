#!/usr/bin/env python3
"""Atomic V7 production opening-import wrapper.

This deliberately does NOT replace dry-run-loader.py. It validates the production
cutover lock, runs a caller-supplied SQL import script inside the same transaction,
then reconciles canonical/ledger counts before commit. Any failure rolls back all
opening-import writes. The SQL payload must be generated from the already-verified
manifest and may use only warehouse_v7 staging/classification/import APIs.
"""
import argparse, os, subprocess, sys

def lit(v): return "'" + str(v).replace("'","''") + "'"

def main():
    p=argparse.ArgumentParser()
    p.add_argument("import_sql")
    p.add_argument("--tenant",required=True)
    p.add_argument("--actor",required=True)
    p.add_argument("--expected-source-md5",required=True)
    p.add_argument("--expected-source-rows",type=int,required=True)
    p.add_argument("--confirm",required=True)
    a=p.parse_args()
    if a.confirm!="PRODUCTION_OPENING_IMPORT":
        raise SystemExit("STOP: explicit production confirmation missing")
    payload=open(a.import_sql,encoding="utf-8").read()
    forbidden=("public.warehouse_records","delete from public.","update public.warehouse_records","truncate ")
    if any(x in payload.lower() for x in forbidden):
        raise SystemExit("STOP: import SQL violates read-only V6 boundary")
    conn=f"host={os.getenv('PGHOST','')} port={os.getenv('PGPORT','5432')} dbname={os.getenv('PGDATABASE','postgres')} user={os.getenv('PGUSER','postgres')} password={os.getenv('PGPASSWORD','')}"
    sql=f"""
BEGIN;
SET LOCAL request.jwt.claim.sub={lit(a.actor)};
DO $guard$
DECLARE l warehouse_v7.production_cutover_lock;
BEGIN
 SELECT * INTO l FROM warehouse_v7.production_cutover_lock
 WHERE tenant_id={lit(a.tenant)}::uuid FOR UPDATE;
 IF NOT FOUND OR l.status<>'LOCKED' THEN RAISE EXCEPTION 'CUTOVER_NOT_LOCKED'; END IF;
 IF l.actor_id<>{lit(a.actor)}::uuid THEN RAISE EXCEPTION 'CUTOVER_ACTOR_MISMATCH'; END IF;
 IF l.source_snapshot_md5<>{lit(a.expected_source_md5)}
 OR l.source_live_rows<>{a.expected_source_rows} THEN RAISE EXCEPTION 'CUTOVER_SOURCE_LOCK_MISMATCH'; END IF;
 IF (SELECT count(*) FROM warehouse_v7.product WHERE tenant_id=l.tenant_id)<>0
 OR (SELECT count(*) FROM warehouse_v7.location WHERE tenant_id=l.tenant_id)<>0
 OR (SELECT count(*) FROM warehouse_v7.stock_item WHERE tenant_id=l.tenant_id)<>0
 OR (SELECT count(*) FROM warehouse_v7.carpet_roll WHERE tenant_id=l.tenant_id)<>0
 OR (SELECT count(*) FROM warehouse_v7.command WHERE tenant_id=l.tenant_id)<>0
 OR (SELECT count(*) FROM warehouse_v7.inventory_movement WHERE tenant_id=l.tenant_id)<>0
 THEN RAISE EXCEPTION 'CUTOVER_TARGET_NOT_EMPTY'; END IF;
 UPDATE warehouse_v7.production_cutover_lock SET status='IMPORTING' WHERE tenant_id=l.tenant_id;
END $guard$;
{payload}
DO $reconcile$
DECLARE l warehouse_v7.production_cutover_lock; p int; loc int; s int; c int; cmd int; mov int; evt int; bad int;
BEGIN
 SELECT * INTO l FROM warehouse_v7.production_cutover_lock WHERE tenant_id={lit(a.tenant)}::uuid FOR UPDATE;
 SELECT count(*) INTO p FROM warehouse_v7.product WHERE tenant_id=l.tenant_id;
 SELECT count(*) INTO loc FROM warehouse_v7.location WHERE tenant_id=l.tenant_id;
 SELECT count(*) INTO s FROM warehouse_v7.stock_item WHERE tenant_id=l.tenant_id;
 SELECT count(*) INTO c FROM warehouse_v7.carpet_roll WHERE tenant_id=l.tenant_id;
 SELECT count(*) INTO cmd FROM warehouse_v7.command WHERE tenant_id=l.tenant_id AND status='committed';
 SELECT count(*) INTO mov FROM warehouse_v7.inventory_movement WHERE tenant_id=l.tenant_id;
 SELECT count(*) INTO evt FROM warehouse_v7.event WHERE tenant_id=l.tenant_id;
 SELECT count(*) INTO bad FROM warehouse_v7.migration_staging WHERE tenant_id=l.tenant_id AND classification<>'imported' AND imported_entity_id IS NOT NULL;
 IF p<>l.expected_products OR loc<>l.expected_locations OR s<>l.expected_stock_items OR c<>l.expected_carpet_rolls
 OR cmd<>l.expected_opening_ledger_rows OR mov<>l.expected_opening_ledger_rows OR evt<>l.expected_opening_ledger_rows OR bad<>0
 THEN RAISE EXCEPTION 'CUTOVER_RECONCILIATION_FAILED p=% loc=% s=% c=% cmd=% mov=% evt=% bad=%',p,loc,s,c,cmd,mov,evt,bad; END IF;
 UPDATE warehouse_v7.production_cutover_lock SET status='RECONCILED',reconciled_at=now() WHERE tenant_id=l.tenant_id;
END $reconcile$;
COMMIT;
"""
    r=subprocess.run(["psql",conn,"-v","ON_ERROR_STOP=1"],input=sql,text=True,capture_output=True)
    if r.returncode:
        print(r.stderr,file=sys.stderr); raise SystemExit(r.returncode)
    print("PRODUCTION_OPENING_IMPORT_RECONCILED")

if __name__=="__main__": main()
