import os, subprocess, time, uuid
DSN="host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres"
tenant=str(uuid.uuid4()); cmd=str(uuid.uuid4()); entity=str(uuid.uuid4()); actor=str(uuid.uuid4())
payload='{"attack":"same-uuid"}'
sql=f"""select (warehouse_v7.begin_command('{tenant}'::uuid,'{cmd}'::uuid,'ATTACK','stock_item','{entity}'::uuid,0,'{payload}'::jsonb,'{actor}'::uuid,'A')).id;"""
env=os.environ.copy(); env["PGPASSWORD"]="postgres"
procs=[subprocess.Popen(["psql",DSN,"-v","ON_ERROR_STOP=1","-Atc",sql],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env) for _ in range(2)]
outs=[p.communicate(timeout=20) for p in procs]
assert all(p.returncode==0 for p in procs), outs
assert all(cmd in o[0] for o in outs), outs
count=subprocess.check_output(["psql",DSN,"-Atc",f"select count(*) from warehouse_v7.command where tenant_id='{tenant}' and id='{cmd}';"],text=True,env=env).strip()
assert count=="1", count
bad=f"""select warehouse_v7.begin_command('{tenant}'::uuid,'{cmd}'::uuid,'ATTACK','stock_item','{entity}'::uuid,0,'{{"attack":"changed"}}'::jsonb,'{actor}'::uuid,'B');"""
p=subprocess.run(["psql",DSN,"-v","ON_ERROR_STOP=1","-Atc",bad],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
assert p.returncode!=0 and "COMMAND_FINGERPRINT_MISMATCH" in p.stderr, p.stderr
print("V7 same-UUID concurrent attack: PASS")
