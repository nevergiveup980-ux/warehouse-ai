#!/usr/bin/env python3
import json,os,subprocess
ENV=os.environ.copy();ENV.setdefault("PGPASSWORD","postgres")
CONN=f"host={os.environ.get('PGHOST','localhost')} port={os.environ.get('PGPORT','5432')} dbname={os.environ.get('PGDATABASE','warehouse_v7_test')} user={os.environ.get('PGUSER','postgres')} password={os.environ.get('PGPASSWORD','postgres')}"
T='57575757-5757-4757-8757-575757575757'
A='68686868-6868-4868-8868-686868686868'
O='69696969-6969-4969-8969-696969696969'

def run(sql,ok=True):
    r=subprocess.run(['psql',CONN,'-v','ON_ERROR_STOP=1','-At'],input=sql,text=True,capture_output=True,env=ENV)
    if ok and r.returncode: raise RuntimeError(r.stderr or r.stdout)
    return r

def val(sql):
    r=run(sql);xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET'];return xs[-1] if xs else ''

def j(sql): return json.loads(val(sql))
def q(s): return "'" + str(s).replace("'","''") + "'"

run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle) values
('{T}','{A}','admin','active'),('{T}','{O}','operator','active')
on conflict do nothing;
""")

def stage(dataset,record_id,classification,reason,payload):
    raw=json.dumps(payload,separators=(',',':'))
    sid=val(f"select warehouse_v7.stage_legacy_record('{T}','{dataset}',{q(record_id)},{q(raw)}::jsonb,{q(raw)}::jsonb);")
    run(f"set request.jwt.claim.sub='{A}';select warehouse_v7.classify_legacy_record('{T}','{sid}','{classification}',{q(reason)},'{A}');")
    return sid

stage('derived_carpet_review_v7','REVIEW:X','deferred','LOCATION_MISSING',{
  'legacy_instance_id':'X','company_roll_number':'RC900','shared_legacy_roll_number':False,
  'reasons':['LOCATION_MISSING'],'current_state':{'collection':'Test Carpet','colour':'Stone','location':None,'length':77,'original_length':100,'measure':'CAL'}
})
stage('derived_carpet_identity_v7','CONFLICT:Y','conflict','LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE',{
  'legacy_instance_id':'Y','roll_numbers':['RC2220','RC22220'],'conflict_type':'LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE'
})
evidence=json.dumps({
  'policy':{'auto_resolution_allowed':False,'historical_candidates_are_reference_only':True,'physical_confirmation_required':True},
  'candidates':{'locations':['2A'],'measures':['CAL'],'products':[{'collection':'Test Carpet','colour':'Stone'}],'company_roll_numbers':['RC900']},
  'exact_legacy_instance_history':[{'source_record_id':'old-x'}],
  'cut_history_by_roll_label':[],'operation_history_by_roll_label':[]
},separators=(',',':'))
run(f"""set request.jwt.claim.sub='{A}';
insert into warehouse_v7.carpet_review_evidence(tenant_id,source_dataset,source_record_id,evidence)
values('{T}','derived_carpet_review_v7','REVIEW:X',{q(evidence)}::jsonb);""")

before=j(f"""set request.jwt.claim.sub='{A}';select jsonb_build_object(
 'carpet',(select count(*) from warehouse_v7.carpet_roll where tenant_id='{T}'),
 'commands',(select count(*) from warehouse_v7.command where tenant_id='{T}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}')
)::text;""")

w=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_carpet_review_workbench('{T}','open')::text;")
assert w['mode']=='V7_CARPET_REVIEW_WORKBENCH'
assert w['can_resolve'] is True and w['operational_cutover'] is False
assert w['summary']=={'total':2,'open':2,'resolved':0,'identity':1,'operational':1},w
assert len(w['cases'])==2
x=next(c for c in w['cases'] if c['source_record_id']=='REVIEW:X')
assert x['evidence']['policy']['auto_resolution_allowed'] is False
assert x['evidence']['candidates']['locations']==['2A']

bad=run(f"""set request.jwt.claim.sub='{A}';
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',0,'{{"note":"still looking"}}'::jsonb,'{A}');""",ok=False)
assert bad.returncode!=0 and 'CARPET_REVIEW_LOCATION_REQUIRED' in bad.stderr,bad.stderr

operator=run(f"""set request.jwt.claim.sub='{O}';
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',0,'{{"location_code":"2A"}}'::jsonb,'{O}');""",ok=False)
assert operator.returncode!=0 and 'ADMIN_ROLE_REQUIRED' in operator.stderr,operator.stderr

r1=j(f"""set request.jwt.claim.sub='{A}';
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',0,'{{"location_code":" 2A ","note":"physical rack confirmed"}}'::jsonb,'{A}')::text;""")
assert r1['status']=='resolved' and r1['version']==1
assert r1['resolution_payload']['location_code']=='2A'
assert r1['operational_inventory_writes']==0 and r1['promotion_performed'] is False

stale=run(f"""set request.jwt.claim.sub='{A}';
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',0,'{{"location_code":"3A"}}'::jsonb,'{A}');""",ok=False)
assert stale.returncode!=0 and 'CARPET_REVIEW_VERSION_CONFLICT' in stale.stderr,stale.stderr

r2=j(f"""set request.jwt.claim.sub='{A}';
select warehouse_v7.resolve_carpet_review('{T}','derived_carpet_identity_v7','CONFLICT:Y',0,'{{"company_roll_number":" rc2220 "}}'::jsonb,'{A}')::text;""")
assert r2['resolution_payload']['company_roll_number']=='RC2220'

resolved=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_carpet_review_workbench('{T}','resolved')::text;")
assert resolved['summary']['open']==0 and resolved['summary']['resolved']==2
assert len(resolved['cases'])==2

reopen=j(f"""set request.jwt.claim.sub='{A}';
select warehouse_v7.reopen_carpet_review('{T}','derived_carpet_review_v7','REVIEW:X',1,'{A}')::text;""")
assert reopen['status']=='open' and reopen['version']==2
openq=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_carpet_review_workbench('{T}','open')::text;")
assert openq['summary']['open']==1 and len(openq['cases'])==1

after=j(f"""set request.jwt.claim.sub='{A}';select jsonb_build_object(
 'carpet',(select count(*) from warehouse_v7.carpet_roll where tenant_id='{T}'),
 'commands',(select count(*) from warehouse_v7.command where tenant_id='{T}'),
 'movements',(select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}'),
 'events',(select count(*) from warehouse_v7.event where tenant_id='{T}')
)::text;""")
assert before==after,(before,after)

stage_rows=j(f"""set request.jwt.claim.sub='{A}';select jsonb_build_object(
 'review_class',(select classification from warehouse_v7.migration_staging where tenant_id='{T}' and source_dataset='derived_carpet_review_v7' and source_record_id='REVIEW:X'),
 'identity_class',(select classification from warehouse_v7.migration_staging where tenant_id='{T}' and source_dataset='derived_carpet_identity_v7' and source_record_id='CONFLICT:Y')
)::text;""")
assert stage_rows=={'review_class':'deferred','identity_class':'conflict'},stage_rows

print('V7 Carpet Review Workbench explicit-resolution overlay: PASS')
