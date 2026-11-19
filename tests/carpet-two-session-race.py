#!/usr/bin/env python3
"""Two real PostgreSQL connections; disposable CI database only."""
import os, subprocess, sys, time, uuid

dsn=os.environ.get("RUNLU_DISPOSABLE_PG_DSN")
if not dsn or "localhost" not in dsn and "127.0.0.1" not in dsn:
    sys.exit("Refusing to run: RUNLU_DISPOSABLE_PG_DSN must point to localhost disposable PostgreSQL")
def psql(sql, *, check=True):
    return subprocess.run(["psql",dsn,"-X","-v","ON_ERROR_STOP=1","-At","-c",sql],text=True,capture_output=True,check=check)
def ins(record, roll, mfr, tenant="11111111-1111-1111-1111-111111111111"):
    return ("INSERT INTO public.warehouse_records(user_id,dataset_key,record_id,payload,deleted_at) "
            f"VALUES('{tenant}','runlu_carpet_inventory_v52','{record}',"
            f"""'{{"roll":"{roll}","manufacturerRoll":"{mfr}"}}'::jsonb,NULL);""")
def race(label, first, second, expect_second_success, expected_count):
    psql("TRUNCATE public.warehouse_records")
    a=subprocess.Popen(["psql",dsn,"-X","-v","ON_ERROR_STOP=1","-At"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    a.stdin.write("BEGIN;\n"+first+"\n\\echo FIRST_INSERTED\nSELECT pg_sleep(2);\nCOMMIT;\n")
    a.stdin.flush();a.stdin.close();a.stdin=None
    marker=a.stdout.readline().strip()
    if marker!="BEGIN":
        raise AssertionError(f"{label}: unexpected first output {marker!r}")
    marker=a.stdout.readline().strip()
    if marker!="INSERT 0 1": raise AssertionError(f"{label}: first insert failed {marker!r}")
    marker=a.stdout.readline().strip()
    if marker!="FIRST_INSERTED": raise AssertionError(f"{label}: no synchronization marker {marker!r}")
    b=psql("BEGIN; SET LOCAL lock_timeout='8s'; "+second+" COMMIT;",check=False)
    a.wait(timeout=15)
    if a.returncode!=0: raise AssertionError(f"{label}: first transaction failed: {a.stderr.read()}")
    if (b.returncode==0)!=expect_second_success:
        raise AssertionError(f"{label}: unexpected second result: {b.stdout} {b.stderr}")
    if not expect_second_success and "possible_duplicate_physical_roll" not in b.stderr:
        raise AssertionError(f"{label}: expected physical duplicate error, got {b.stderr}")
    n=int(psql("SELECT count(*) FROM public.warehouse_records WHERE deleted_at IS NULL").stdout.strip())
    if n!=expected_count: raise AssertionError(f"{label}: {n} active records, expected {expected_count}")
    print(f"PASS {label}: second_success={expect_second_success}, active={n}",flush=True)

race("identical physical identity",ins("a","RACE1","MFR1"),ins("b","RACE1","MFR1"),False,1)
race("reversed insertion",ins("b","RACE2","MFR2"),ins("a","RACE2","MFR2"),False,1)
race("distinct manufacturer roll",ins("a","RACE3","MFR3"),ins("b","RACE3","MFR4"),True,2)
race("ambiguous manufacturer roll",ins("a","RACE4","MFR4"),ins("b","RACE4",""),False,1)
race("tenant isolation",ins("a","RACE5","MFR5"),ins("b","RACE5","MFR5","22222222-2222-2222-2222-222222222222"),True,2)
print("ALL TWO-SESSION CASES PASSED")
