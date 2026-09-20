#!/usr/bin/env python3
import argparse,json,urllib.error,urllib.parse,urllib.request

def get(url):
  with urllib.request.urlopen(url,timeout=8) as r:return r.status,json.loads(r.read().decode())
def post(url,body):
  req=urllib.request.Request(url,method='POST',data=json.dumps(body).encode(),headers={'content-type':'application/json'})
  try:
    with urllib.request.urlopen(req,timeout=8) as r:return r.status,json.loads(r.read().decode())
  except urllib.error.HTTPError as e:return e.code,json.loads(e.read().decode())

def main():
  ap=argparse.ArgumentParser();ap.add_argument('--base-url',required=True);ap.add_argument('--mode',choices=['synthetic','real'],required=True);ap.add_argument('--review-report');ap.add_argument('--report',required=True);args=ap.parse_args()
  base=args.base_url.rstrip('/')
  with urllib.request.urlopen(base+'/carpet-review-workbench.html',timeout=8) as r:html=r.read().decode()
  assert 'Carpet Review Workbench' in html and 'No field is guessed' in html
  _,env=get(base+'/api/carpet-review?action=list&status=open');data=env['data']
  assert data['mode']=='V7_CARPET_REVIEW_WORKBENCH' and data['operational_cutover'] is False
  if args.mode=='real':
    assert args.review_report
    expected=int(json.load(open(args.review_report)).get('review_total') or 0)
    assert expected>0 and data['summary']['open']==expected and len(data['cases'])==expected,(expected,data['summary'])
    assert all((c.get('evidence') or {}).get('policy',{}).get('auto_resolution_allowed') is False for c in data['cases'])
    assert all((c.get('evidence') or {}).get('policy',{}).get('physical_confirmation_required') is True for c in data['cases'])
    _,gate=get(base+'/api/carpet-review?action=gate')
    assert gate['data']['summary']['open']==expected
    assert gate['data']['summary']['promotable']==0 and gate['data']['summary']['promoted']==0
    out={'mode':'V7_CARPET_REVIEW_WORKBENCH_REAL_HTTP_E2E','open_cases':expected,'evidence_cases':expected,'mutations_performed':0,'promotion_gate_opened':False,'verdict':'REAL_HTTP_E2E_PASS'}
  else:
    assert data['summary']['open']>=1
    target=next((x for x in data['cases'] if 'LOCATION_MISSING' in (x.get('reasons') or [])),None)
    assert target,target
    status,bad=post(base+'/api/carpet-review',{'action':'resolve','source_dataset':target['source_dataset'],'source_record_id':target['source_record_id'],'expected_version':target['resolution_version'],'resolution':{'note':'missing explicit location'}})
    assert status==400 and bad['error']=='CARPET_REVIEW_LOCATION_REQUIRED',(status,bad)
    status,ok=post(base+'/api/carpet-review',{'action':'resolve','source_dataset':target['source_dataset'],'source_record_id':target['source_record_id'],'expected_version':target['resolution_version'],'resolution':{'location_code':'2B','note':'HTTP synthetic proof'}})
    assert status==200 and ok['data']['promotion_performed'] is False and ok['data']['operational_inventory_writes']==0
    qs=urllib.parse.urlencode({'action':'preview','dataset':target['source_dataset'],'record':target['source_record_id']})
    _,preview=get(base+'/api/carpet-review?'+qs)
    assert preview['data']['ready'] is True,preview
    out={'mode':'V7_CARPET_REVIEW_WORKBENCH_SYNTHETIC_HTTP_E2E','required_field_rejected':True,'overlay_resolution_saved':True,'promotion_performed':False,'verdict':'SYNTHETIC_HTTP_E2E_PASS'}
  json.dump(out,open(args.report,'w'),indent=2);open(args.report,'a').write('\n')
  print(json.dumps(out,indent=2))
if __name__=='__main__':main()
