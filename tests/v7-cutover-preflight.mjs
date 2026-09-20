import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('v7/cutover-preflight.py','utf8');
assert.match(script,/--release-readiness/);
assert.match(script,/release_allowed/);
assert.match(script,/RELEASE_READY/);
assert.match(script,/release_blockers_empty/);
assert.match(script,/production_write_authorized/);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v7-cutover-preflight-'));
const write=(n,o)=>{const p=path.join(dir,n);fs.writeFileSync(p,JSON.stringify(o));return p;};
const integrity={algorithm:'postgres-jsonb-row-md5-chain-v1',snapshot_md5:'abc123',total_live_rows:787,postgres_jsonb_text_verified:true,datasets:[{dataset_key:'runlu_carpet_inventory_v52',live_rows:530,content_md5:'c'}]};
const dry={mode:'DISPOSABLE_POSTGRES_DRY_RUN',production_writes:0,source_integrity:{snapshot_md5:'abc123'},manifest_summary:{rows:787},reconciliation:{pass:true,expected:{x:1},actual:{x:1,invalid_with_canonical_link:0},checks:{x:true},expected_stock_quantity_by_unit:{},expected_carpet_remaining_sixteenths:10}};
const blocked={mode:'V7_ENGINEERING_RELEASE_READINESS_GATE',production_write_authorized:false,production_writes:0,technical_gate_pass:true,release_allowed:false,verdict:'RELEASE_BLOCKED',release_blockers:[{code:'CARPET_REVIEW_OPEN',count:14}],human_action_items:Array.from({length:14},()=>({verification_question:'confirm'}))};
const ready={...blocked,release_allowed:true,verdict:'RELEASE_READY',release_blockers:[],human_action_items:[]};
function run(release,name){
  const out=path.join(dir,name+'.json');
  const r=spawnSync('python3',['v7/cutover-preflight.py',
    '--start-integrity',write(name+'-start.json',integrity),
    '--end-integrity',write(name+'-end.json',integrity),
    '--dry-run-1',write(name+'-d1.json',dry),
    '--dry-run-2',write(name+'-d2.json',dry),
    '--release-readiness',write(name+'-release.json',release),
    '--report',out,
    '--expected-source-md5','abc123'
  ],{encoding:'utf8'});
  return {r,out:JSON.parse(fs.readFileSync(out,'utf8'))};
}
const b=run(blocked,'blocked');
assert.notEqual(b.r.status,0);
assert.equal(b.out.verdict,'STOP');
assert.equal(b.out.release_readiness.release_allowed,false);
assert.ok(b.out.stop_reasons.includes('release_allowed'));
assert.ok(b.out.stop_reasons.includes('release_verdict_ready'));
assert.ok(b.out.stop_reasons.includes('release_blockers_empty'));
const ok=run(ready,'ready');
assert.equal(ok.r.status,0,ok.r.stderr||ok.r.stdout);
assert.equal(ok.out.verdict,'PREFLIGHT_PASS');
assert.equal(ok.out.release_readiness.release_allowed,true);
assert.deepEqual(ok.out.stop_reasons,[]);
console.log('V7 controlled cutover preflight release gate: PASS');
