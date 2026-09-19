import json,os,subprocess,uuid

D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres'
E=os.environ.copy(); E['PGPASSWORD']='postgres'
T,A,P,L1,L2=[str(uuid.uuid4()) for _ in range(5)]

def run(sql,ok=True):
    r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
    if ok and r.returncode!=0: raise RuntimeError(r.stderr or r.stdout)
    return r

def val(r):
    xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET']
    return xs[-1] if xs else ''

run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle)
values('{T}','{A}','admin','active');
insert into warehouse_v7.product(tenant_id,id,name,base_unit,coverage_unit,lifecycle)
values('{T}','{P}','Carpet Lifecycle Regression','1/16_IN','1/16_IN','active');
insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle) values
('{T}','{L1}','CARPET-WH','rack','active'),
('{T}','{L2}','CARPET-STORE','external','active');
""")

# Whole-roll transfer: 9 ft = 1728 sixteenths.
W,CW=[str(uuid.uuid4()) for _ in range(2)]
run(f"""
insert into warehouse_v7.carpet_roll(
 tenant_id,id,roll_number,product_id,location_id,original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle
) values('{T}','{W}','RC-WHOLE','{P}','{L1}',1728,1728,'TM',1,'active');
""")
def whole():
    return json.loads(val(run(f"""
      set request.jwt.claim.sub='{A}';
      select warehouse_v7.transfer_carpet_roll(
        '{T}','{CW}','{W}',1,'{L2}','{{"regression":"whole"}}','{A}','TEST'
      )::text;
    """)))
w1=whole()
assert w1['status']=='committed' and int(w1['remaining_sixteenths'])==1728 and int(w1['new_version'])==2,w1
wstate=json.loads(val(run(f"""
select jsonb_build_object(
 'loc',(select location_id::text from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{W}'),
 'remain',(select remaining_sixteenths from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{W}'),
 'ver',(select version from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{W}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{CW}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{CW}')
)::text;
""")))
assert wstate['loc']==L2 and wstate['remain']==1728 and wstate['ver']==2,wstate
assert wstate['movements']==1 and wstate['events']==1,wstate
assert whole()==w1

# Partial transfer: 28'9" = 5520; transfer 6'3" = 1200; remain 22'6" = 4320.
S,CH,CP=[str(uuid.uuid4()) for _ in range(3)]
run(f"""
insert into warehouse_v7.carpet_roll(
 tenant_id,id,roll_number,manufacturer_roll,source_roll,product_id,location_id,
 original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle
) values('{T}','{S}','RC2323B','4146','RC2323','{P}','{L1}',5520,5520,'TM',1,'active');
""")
def piece():
    return json.loads(val(run(f"""
      set request.jwt.claim.sub='{A}';
      select warehouse_v7.transfer_carpet_piece(
        '{T}','{CP}','{S}',1,'{CH}','RC2323BA',1200,'{L2}',
        '{{"regression":"partial"}}','{A}','TEST'
      )::text;
    """)))
p1=piece()
assert p1['status']=='committed' and int(p1['source_before_sixteenths'])==5520,p1
assert int(p1['transferred_sixteenths'])==1200 and int(p1['source_remaining_sixteenths'])==4320,p1
assert p1.get('advisory')=='REMNANT_WHOLE_ROLL_PREFERRED',p1
pstate=json.loads(val(run(f"""
select jsonb_build_object(
 'src_remain',(select remaining_sixteenths from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{S}'),
 'src_ver',(select version from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{S}'),
 'child_remain',(select remaining_sixteenths from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{CH}'),
 'child_loc',(select location_id::text from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{CH}'),
 'child_source',(select source_roll from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{CH}'),
 'child_measure',(select measure_status from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{CH}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{CP}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{CP}')
)::text;
""")))
assert pstate['src_remain']==4320 and pstate['src_ver']==2,pstate
assert pstate['child_remain']==1200 and pstate['child_loc']==L2,pstate
assert pstate['child_source']=='RC2323B' and pstate['child_measure']=='TM',pstate
assert pstate['movements']==2 and pstate['events']==2,pstate
assert piece()==p1

# Carpet return: create a synthetic original outbound cause; returned piece becomes a new TM child.
SRCRET,OUT,RET,CR=[str(uuid.uuid4()) for _ in range(4)]
run(f"""
insert into warehouse_v7.carpet_roll(
 tenant_id,id,roll_number,manufacturer_roll,product_id,location_id,
 original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle
) values('{T}','{SRCRET}','RC2250','2799','{P}','{L1}',6960,1104,'CAL',1,'active');

insert into warehouse_v7.command(
 tenant_id,id,command_type,entity_type,entity_id,payload,payload_fingerprint,status,actor_id,device_id
) values('{T}','{OUT}','CARPET_OUT_FIXTURE','carpet_roll','{SRCRET}',
 '{{"shadow_fixture":true}}','fixture','committed','{A}','FIXTURE');

insert into warehouse_v7.inventory_movement(
 tenant_id,command_id,product_id,carpet_roll_id,movement_type,quantity,unit,from_location_id
) values('{T}','{OUT}','{P}','{SRCRET}','CARPET_OUT',2592,'1/16_IN','{L1}');
""")
def ret():
    return json.loads(val(run(f"""
      set request.jwt.claim.sub='{A}';
      select warehouse_v7.return_carpet_piece(
        '{T}','{CR}','{SRCRET}','{RET}','RC2250A',2592,'{L1}','{OUT}',
        '{{"regression":"carpet-return"}}','{A}','TEST'
      )::text;
    """)))
r1=ret()
assert r1['status']=='committed' and int(r1['returned_sixteenths'])==2592,r1
rstate=json.loads(val(run(f"""
select jsonb_build_object(
 'source_remain',(select remaining_sixteenths from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{SRCRET}'),
 'source_ver',(select version from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{SRCRET}'),
 'child_remain',(select remaining_sixteenths from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{RET}'),
 'child_source',(select source_roll from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{RET}'),
 'child_measure',(select measure_status from warehouse_v7.carpet_roll where tenant_id='{T}' and id='{RET}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}' and command_id='{CR}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}' and command_id='{CR}')
)::text;
""")))
assert rstate['source_remain']==1104 and rstate['source_ver']==1,rstate
assert rstate['child_remain']==2592 and rstate['child_source']=='RC2250' and rstate['child_measure']=='TM',rstate
assert rstate['movements']==1 and rstate['events']==1,rstate
assert ret()==r1

print('V7 carpet transfer/return lifecycle regression: PASS')
