import os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'; e=os.environ.copy();e['PGPASSWORD']='postgres'
T,P,L,R,A=[str(uuid.uuid4()) for _ in range(5)]
setup=f"""insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values('{T}','{A}','operator');
insert into warehouse_v7.product(tenant_id,id,name,base_unit,lifecycle) values('{T}','{P}','Cut Attack Product','1/16_IN','active');
insert into warehouse_v7.location(tenant_id,id,code,lifecycle) values('{T}','{L}','13C','active');
insert into warehouse_v7.carpet_roll(tenant_id,id,roll_number,product_id,location_id,original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle) values('{T}','{R}','ATTACK-RC','{P}','{L}',1600,1600,'FULL',1,'active');"""
subprocess.check_call(['psql',D,'-v','ON_ERROR_STOP=1','-c',setup],env=e)
cmds=[str(uuid.uuid4()),str(uuid.uuid4())]
def q(c): return f"set request.jwt.claim.sub='{A}'; select warehouse_v7.cut_carpet_roll('{T}','{c}','{R}',1,1000,'{{\"attack\":\"same-roll-version\"}}','{A}','DEV');"
ps=[subprocess.Popen(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',q(c)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=e) for c in cmds]
out=[p.communicate(timeout=20) for p in ps]
assert all(p.returncode==0 for p in ps),out
joined=' '.join(x[0] for x in out)
assert joined.count('\"status\": \"committed\"')==1,joined
assert joined.count('\"code\": \"STALE_VERSION\"')==1,joined
row=subprocess.check_output(['psql',D,'-Atc',f"select remaining_sixteenths||'|'||version from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{R}';"],text=True,env=e).strip()
assert row=='600|2',row
m=subprocess.check_output(['psql',D,'-Atc',f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and carpet_roll_id='{R}' and movement_type='CUT_CONSUME';"],text=True,env=e).strip()
ev=subprocess.check_output(['psql',D,'-Atc',f"select count(*) from warehouse_v7.event where tenant_id='{T}' and entity_id='{R}' and event_type='CUT';"],text=True,env=e).strip()
assert m=='1' and ev=='1',(m,ev)
print('V7 same-roll same-version concurrent CUT attack: PASS')