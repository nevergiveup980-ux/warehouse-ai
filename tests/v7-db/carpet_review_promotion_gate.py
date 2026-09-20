#!/usr/bin/env python3
import json,os,subprocess
ENV=os.environ.copy();ENV.setdefault("PGPASSWORD","postgres")
CONN=f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={os.environ.get('PGDATABASE','warehouse_v7_test')} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}"
T='71717171-7171-4717-8717-717171717171'
A='72727272-7272-4727-8727-727272727272'

def run(sql,ok=True):
    r=subprocess.run(['psql',CONN,'-v','ON_ERROR_STOP=1','-At'],input=sql,text=True,capture_output=True,env=ENV)
    if ok and r.returncode: raise RuntimeError(r.stderr or r.stdout)
    return r
def val(sql):
    r=run(sql);xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET'];return xs[-1] if xs else ''
def j(sql): return json.loads(val(sql))
def q(s): return "'" + str(s).replace("'","''") + "'"
def stage(dataset,record,classification,reason,payload):
    raw=json.dumps(payload,separators=(',',':'))
    sid=val(f"select warehouse_v7.stage_legacy_record('{T}','{dataset}',{q(record)},{q(raw)}::jsonb,{q(raw)}::jsonb);")
    run(f"set request.jwt.claim.sub='{A}';select warehouse_v7.classify_legacy_record('{T}','{sid}','{classification}',{q(reason)},'{A}');")

run(f"insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle) values('{T}','{A}','admin','active') on conflict do nothing;")

stage('derived_carpet_review_v7','REVIEW:X','deferred','LOCATION_MISSING',{
 'legacy_instance_id':'X','company_roll_number':'RC900','shared_legacy_roll_number':False,
 'reasons':['LOCATION_MISSING'],
 'current_state':{'collection':'Test Carpet','colour':'Stone','location':None,'length':77,'original_length':100,'measure':'CAL'},
 'references':{'manufacturer_roll':'M-REF','source_roll':'RC800'}
})
stage('derived_carpet_identity_v7','CONFLICT:Y','conflict','LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE',{
 'legacy_instance_id':'Y','company_roll_number':None,'roll_numbers':['RC2220','RC22220'],
 'conflict_type':'LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE',
 'current_state':{'collection':'Elevated','colour':'London Fog','location':'12D','length':6,'original_length':6,'measure':'TM'},
 'references':{'manufacturer_roll':'M-Y','source_roll':None}
})
stage('derived_carpet_review_v7','REVIEW:C1','deferred','LOCATION_MISSING',{
 'legacy_instance_id':'C1','company_roll_number':'CHC022','shared_legacy_roll_number':True,
 'reasons':['LOCATION_MISSING'],
 'current_state':{'collection':'Classic Cut','colour':'Grey','location':None,'length':150,'original_length':150,'measure':'FULL'},
 'references':{}
})
stage('derived_carpet_review_v7','REVIEW:C2','deferred','LOCATION_MISSING',{
 'legacy_instance_id':'C2','company_roll_number':'CHC022','shared_legacy_roll_number':True,
 'reasons':['LOCATION_MISSING'],
 'current_state':{'collection':'Classic Cut','colour':'Grey','location':None,'length':140,'original_length':140,'measure':'FULL'},
 'references':{}
})

gate0=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_carpet_review_promotion_gate('{T}')::text;")
assert gate0['summary']['total']==4 and gate0['summary']['open']==4 and gate0['summary']['promotable']==0,gate0

run(f"""set request.jwt.claim.sub='{A}';
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',0,'{{"location_code":"2A"}}'::jsonb,'{A}');
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_identity_v7','CONFLICT:Y',0,'{{"company_roll_number":"RC2220"}}'::jsonb,'{A}');
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_review_v7','REVIEW:C1',0,'{{"location_code":"12C"}}'::jsonb,'{A}');
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_review_v7','REVIEW:C2',0,'{{"location_code":"14D"}}'::jsonb,'{A}');
""")

px=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.preview_carpet_review_promotion_case('{T}','derived_carpet_review_v7','REVIEW:X')::text;")
assert px['ready'] is True and px['company_roll_number']=='RC900'
assert px['manufacturer_roll_used_for_identity'] is False and px['source_roll_used_for_identity'] is False

py=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.preview_carpet_review_promotion_case('{T}','derived_carpet_identity_v7','CONFLICT:Y')::text;")
assert py['ready'] is True and py['company_roll_number']=='RC2220' and py['location_code']=='12D',py

p1=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.promote_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',1,'{A}')::text;")
assert p1['status']=='promoted' and p1['idempotent_retry'] is False
p1r=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.promote_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',1,'{A}')::text;")
assert p1r['status']=='already_promoted' and p1r['carpet_roll_id']==p1['carpet_roll_id'] and p1r['idempotent_retry'] is True

row=j(f"""set request.jwt.claim.sub='{A}';select jsonb_build_object(
 'roll',r.roll_number,'physical_key',r.physical_key,'manufacturer',r.manufacturer_roll,'source_roll',r.source_roll,
 'remaining',r.remaining_sixteenths,'measure',r.measure_status,'location',l.code,'product',p.name,
 'commands',(select count(*) from warehouse_v7.command c where c.tenant_id='{T}' and c.command_type='MIGRATION_REVIEW_PROMOTED_CARPET'),
 'movements',(select count(*) from warehouse_v7.inventory_movement m where m.tenant_id='{T}' and m.movement_type='OPENING_REVIEW_PROMOTION'),
 'events',(select count(*) from warehouse_v7.event e where e.tenant_id='{T}' and e.event_type='MIGRATED_REVIEWED_CARPET')
)::text
from warehouse_v7.carpet_roll r
join warehouse_v7.location l on l.tenant_id=r.tenant_id and l.id=r.location_id
join warehouse_v7.product p on p.tenant_id=r.tenant_id and p.id=r.product_id
where r.tenant_id='{T}' and r.id='{p1["carpet_roll_id"]}';""")
assert row['roll']=='RC900' and row['physical_key']=='legacy_instance:X'
assert row['manufacturer']=='M-REF' and row['source_roll']=='RC800'
assert row['remaining']==77*192 and row['measure']=='CAL' and row['location']=='2A'
assert row['commands']==1 and row['movements']==1 and row['events']==1,row

reopen=run(f"set request.jwt.claim.sub='{A}';select warehouse_v7.reopen_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',1,'{A}');",ok=False)
assert reopen.returncode!=0 and 'CARPET_REVIEW_ALREADY_PROMOTED' in reopen.stderr,reopen.stderr

p2=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.promote_carpet_review('{T}','derived_carpet_identity_v7','CONFLICT:Y',1,'{A}')::text;")
assert p2['status']=='promoted'

c1=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.promote_carpet_review('{T}','derived_carpet_review_v7','REVIEW:C1',1,'{A}')::text;")
c2=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.promote_carpet_review('{T}','derived_carpet_review_v7','REVIEW:C2',1,'{A}')::text;")
assert c1['status']=='promoted' and c2['status']=='promoted'
shared=int(val(f"set request.jwt.claim.sub='{A}';select count(*) from warehouse_v7.carpet_roll where tenant_id='{T}' and roll_number='CHC022';"))
assert shared==2,shared

stage('derived_carpet_review_v7','REVIEW:DUP','deferred','LOCATION_MISSING',{
 'legacy_instance_id':'DUP','company_roll_number':'RC900','shared_legacy_roll_number':False,
 'reasons':['LOCATION_MISSING'],
 'current_state':{'collection':'Other','colour':'Blue','location':None,'length':50,'original_length':50,'measure':'FULL'},
 'references':{}
})
run(f"""set request.jwt.claim.sub='{A}';
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_review_v7','REVIEW:DUP',0,'{"location_code":"3A"}'::jsonb,'{A}');""")
dup=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.preview_carpet_review_promotion_case('{T}','derived_carpet_review_v7','REVIEW:DUP')::text;")
assert dup['ready'] is False and 'COMPANY_ROLL_ALREADY_ACTIVE' in dup['blockers'],dup
bad=run(f"set request.jwt.claim.sub='{A}';select warehouse_v7.promote_carpet_review('{T}','derived_carpet_review_v7','REVIEW:DUP',1,'{A}');",ok=False)
assert bad.returncode!=0 and 'CARPET_REVIEW_PROMOTION_NOT_READY' in bad.stderr,bad.stderr

gate=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_carpet_review_promotion_gate('{T}')::text;")
assert gate['summary']['promoted']==4 and gate['automatic_promotion'] is False and gate['production_enabled'] is False,gate
print('V7 Carpet Review Promotion Gate: PASS')
