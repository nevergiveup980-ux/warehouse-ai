import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('v7/release-readiness-gate.py','utf8');
assert.match(script,/V7_ENGINEERING_RELEASE_READINESS_GATE/);
assert.match(script,/production_write_authorized/);
assert.match(script,/CARPET_REVIEW_OPEN/);
assert.match(script,/CARPET_REVIEW_PROMOTION_PENDING/);
assert.match(script,/automatic_promotion_disabled/);
assert.match(script,/production_promotion_disabled/);
assert.doesNotMatch(script,/supabase\.co|service_role|SUPABASE_SERVICE/i);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v7-release-gate-'));
const write=(name,obj)=>{const p=path.join(dir,name);fs.writeFileSync(p,JSON.stringify(obj));return p;};
const dry={mode:'DISPOSABLE_POSTGRES_DRY_RUN',production_writes:0,reconciliation:{pass:true,actual:{x:1}}};
const identity={mode:'V7_CARPET_IDENTITY_V2_REHEARSAL',production_writes:0,counts:{active_source_rows:469,legacy_instance_candidates:239,accepted_physical_instances:238,conflict_groups:1}};
const operational={production_writes:0,pass:true,readiness:{ready_physical_instances:225,deferred_physical_instances:13}};
const review={production_writes:0,pass:true,expected_review_total:14,summary:{total:14,open:14,resolved:0}};
const evidence={mode:'V7_CARPET_REVIEW_EVIDENCE_PACK',production_writes:0,auto_resolution_allowed:false,summary:{cases_total:14}};
const promotion={production_writes:0,pass:true,automatic_promotion:false,production_enabled:false,summary:{total:14,promoted:0,promotable:0}};
const inventory={verdict:'HTTP_E2E_PASS'};
const reviewHttp={verdict:'REAL_HTTP_E2E_PASS'};
const shadow={production_writes:0,verdict:'SHADOW_PASS'};
const args=[
  'v7/release-readiness-gate.py',
  '--dry-run-1',write('d1.json',dry),'--dry-run-2',write('d2.json',dry),
  '--identity',write('identity.json',identity),'--operational',write('op.json',operational),
  '--review',write('review.json',review),'--review-evidence',write('evidence.json',evidence),'--promotion',write('promotion.json',promotion),
  '--inventory-http',write('inventory.json',inventory),'--review-http',write('review-http.json',reviewHttp),
  '--cut-shadow',write('cut.json',shadow),'--receive-shadow',write('receive.json',shadow),
  '--shipping-shadow',write('ship.json',shadow),'--transfer-shadow',write('transfer.json',shadow),
  '--return-shadow',write('return.json',shadow),'--supplier-return-shadow',write('supplier.json',shadow),
  '--carpet-lifecycle-shadow',write('carpet.json',shadow),'--order-audit',write('order.json',shadow),
  '--report',path.join(dir,'report.json')
];
const r=spawnSync('python3',args,{encoding:'utf8'});
assert.equal(r.status,0,r.stderr||r.stdout);
const out=JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8'));
assert.equal(out.technical_gate_pass,true);
assert.equal(out.release_allowed,false);
assert.equal(out.verdict,'RELEASE_BLOCKED');
assert.equal(out.carpet.review_open,14);
assert.equal(out.carpet.review_evidence_cases,14);
assert.ok(out.release_blockers.some(x=>x.code==='CARPET_REVIEW_OPEN'&&x.count===14));
assert.ok(out.release_blockers.some(x=>x.code==='CARPET_REVIEW_PROMOTION_PENDING'&&x.count===14));

const readyReview={...review,summary:{total:14,open:0,resolved:14}};
const readyPromotion={...promotion,summary:{total:14,promoted:14,promotable:0}};
const readyArgs=[...args];
readyArgs[readyArgs.indexOf('--review')+1]=write('review-ready.json',readyReview);
readyArgs[readyArgs.indexOf('--promotion')+1]=write('promotion-ready.json',readyPromotion);
readyArgs[readyArgs.indexOf('--report')+1]=path.join(dir,'ready.json');
const rr=spawnSync('python3',readyArgs,{encoding:'utf8'});
assert.equal(rr.status,0,rr.stderr||rr.stdout);
const ready=JSON.parse(fs.readFileSync(path.join(dir,'ready.json'),'utf8'));
assert.equal(ready.release_allowed,true);
assert.equal(ready.verdict,'RELEASE_READY');
assert.deepEqual(ready.release_blockers,[]);
console.log('V7 release readiness gate: PASS');
