import os,subprocess,uuid,json
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T=str(uuid.uuid4())
def sql(q): return subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q],text=True,capture_output=True,env=E)
payload='{"legacy":"RC2291","status":"review"}'
q=f"select warehouse_v7.stage_legacy_record('{T}','carpet','RC2291','{payload}'::jsonb);"
a=sql(q);b=sql(q);assert a.returncode==0 and b.returncode==0,(a.stderr,b.stderr);assert a.stdout.strip()==b.stdout.strip()
n=sql(f"select count(*) from warehouse_v7.migration_staging where tenant_id='{T}' and source_record_id='RC2291';");assert n.stdout.strip()=='1'
ops=sql(f"select (select count(*) from warehouse_v7.carpet_roll where tenant_id='{T}')+(select count(*) from warehouse_v7.stock_item where tenant_id='{T}');");assert ops.stdout.strip()=='0'
changed=sql(f"""select warehouse_v7.stage_legacy_record('{T}','carpet','RC2291','{{"legacy":"RC2291","status":"changed"}}'::jsonb);""");assert changed.returncode!=0 and 'MIGRATION_SOURCE_CHANGED' in changed.stderr,changed.stderr
print('V7 migration quarantine/idempotency attack: PASS')
