import json,os,subprocess,uuid
D='host=localhost port=5432 dbname=warehouse_v7_test user=postgres password=postgres';E=os.environ.copy();E['PGPASSWORD']='postgres'
T,A,P,L,S=[str(uuid.uuid4()) for _ in range(5)]
def run(sql,ok=True):
  r=subprocess.run(['psql',D,'-v','ON_ERROR_STOP=1','-Atc',sql],text=True,capture_output=True,env=E)
  if ok and r.returncode!=0:raise RuntimeError(r.stderr or r.stdout)
  return r
def val(r):
  xs=[x.strip() for x in r.stdout.splitlines() if x.strip() and x.strip()!='SET'];return xs[-1] if xs else ''
def j(sql):return json.loads(val(run(sql)))
def q(s):return "'" + str(s).replace("'","''") + "'"

run(f"""
insert into warehouse_v7.tenant_member(tenant_id,user_id,role,lifecycle) values('{T}','{A}','admin','active');
insert into warehouse_v7.product(tenant_id,id,legacy_record_id,name,colour,base_unit,lifecycle)
values('{T}','{P}','INV-P','Jasper','Natural','BOX','active');
insert into warehouse_v7.location(tenant_id,id,code,kind,lifecycle) values('{T}','{L}','12C','rack','active');
insert into warehouse_v7.stock_item(tenant_id,id,product_id,location_id,quantity,unit,version,lifecycle,legacy_record_id)
values('{T}','{S}','{P}','{L}',10,'BOX',1,'active','INV-STOCK');
""")

def stage(source_id,classification,reason,payload):
  raw=json.dumps(payload,separators=(',',':'))
  sid=val(run(f"select warehouse_v7.stage_legacy_record('{T}','derived_carpet_identity_v7',{q(source_id)},{q(raw)}::jsonb,{q(raw)}::jsonb);"))
  run(f"set request.jwt.claim.sub='{A}';select warehouse_v7.classify_legacy_record('{T}','{sid}','{classification}','{reason}','{A}');")

stage('INSTANCE:A','valid','CARPET_IDENTITY_V2_READY',{
  'legacy_instance_id':'A','company_roll_number':'RC100','shared_legacy_roll_number':False,
  'current_state':{'collection':'Classic','colour':'Blue','location':'12C','length':88.5,'measure':'CAL'}
})
stage('INSTANCE:C1','valid','CARPET_IDENTITY_V2_READY',{
  'legacy_instance_id':'C1','company_roll_number':'CHC022','shared_legacy_roll_number':True,
  'current_state':{'collection':'Classic Cut','colour':'Grey','location':'12C','length':146.0833,'measure':'FULL'}
})
stage('INSTANCE:C2','valid','CARPET_IDENTITY_V2_READY',{
  'legacy_instance_id':'C2','company_roll_number':'CHC022','shared_legacy_roll_number':True,
  'current_state':{'collection':'Classic Cut','colour':'Grey','location':'14D','length':157.4167,'measure':'FULL'}
})
stage('CONFLICT:E','conflict','LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE',{
  'legacy_instance_id':'E','roll_numbers':['RC2220','RC22220'],'conflict_type':'LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE'
})
raw=json.dumps({
  'legacy_instance_id':'R1','company_roll_number':'RC900','shared_legacy_roll_number':False,
  'reasons':['LOCATION_MISSING'],'current_state':{'collection':'Review Carpet','colour':'Stone','location':None,'length':77,'measure':'CAL'}
},separators=(',',':'))
sid=val(run(f"select warehouse_v7.stage_legacy_record('{T}','derived_carpet_review_v7','REVIEW:R1',{q(raw)}::jsonb,{q(raw)}::jsonb);"))
run(f"set request.jwt.claim.sub='{A}';select warehouse_v7.classify_legacy_record('{T}','{sid}','deferred','LOCATION_MISSING','{A}');")

center=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_inventory_command_center('{T}')::text;")
s=center['summary']
assert center['read_only'] is True and center['carpet_operational_cutover'] is False,center
assert s['ordinary_stock_items']==1,s
assert s['carpet_physical_instances']==3,s
assert s['carpet_distinct_company_roll_numbers']==2,s
assert s['shared_legacy_roll_instances']==2,s
assert s['carpet_identity_conflicts']==1,s
assert s['carpet_operational_deferred']==1,s
assert s['carpet_review_total']==2,s
assert center['carpet_identity_contract']['manufacturer_roll_role']=='reference_only'

carpet=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_inventory_command_center('{T}','CARPET',null,null,50)::text;")
shared=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_inventory_command_center('{T}','SHARED','CHC022',null,50)::text;")
loc=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_inventory_command_center('{T}','ALL',null,'12C',50)::text;")
search=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_inventory_command_center('{T}','ALL','jasper',null,50)::text;")
review=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_inventory_command_center('{T}','REVIEW',null,null,50)::text;")
conflict=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_inventory_command_center('{T}','CONFLICT','RC2220',null,50)::text;")
assert carpet['matching_count']==3,carpet
assert shared['matching_count']==2 and all(x['display_id']=='CHC022' for x in shared['items']),shared
assert loc['matching_count']==3,loc
assert search['matching_count']==1 and search['items'][0]['kind']=='STOCK',search
assert review['matching_count']==2,review
assert any(x['kind']=='REVIEW' and x['display_id']=='RC900' and 'LOCATION_MISSING' in (x.get('review_reason') or '') for x in review['items']),review
assert conflict['matching_count']==1 and 'RC2220' in conflict['items'][0]['display_id'],conflict

bad=run(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_inventory_command_center('{T}','NOPE',null,null,50)::text;",ok=False)
assert bad.returncode!=0 and 'INVALID_INVENTORY_KIND_FILTER' in (bad.stdout+bad.stderr),(bad.stdout,bad.stderr)

before=(val(run(f"select count(*) from warehouse_v7.command where tenant_id='{T}';")),val(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}';")))
_=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.get_inventory_command_center('{T}')::text;")
_=j(f"set request.jwt.claim.sub='{A}';select warehouse_v7.list_inventory_command_center('{T}','ALL',null,null,100)::text;")
after=(val(run(f"select count(*) from warehouse_v7.command where tenant_id='{T}';")),val(run(f"select count(*) from warehouse_v7.inventory_movement where tenant_id='{T}';")))
assert before==after,(before,after)
print('V7 Inventory Command Center read-only regression: PASS')
