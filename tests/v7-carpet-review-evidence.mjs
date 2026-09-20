import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v7-carpet-evidence-'));
const write=(n,o)=>{const p=path.join(dir,n);fs.writeFileSync(p,JSON.stringify(o));return p;};
const snapshot=[
 {dataset_key:'runlu_carpet_inventory_v52',record_id:'a1',payload:{id:'A',roll:'RC900',collection:'Test',colour:'Grey',location:'2A',measure:'CAL',length:77,originalLength:100,status:'ACTIVE',updatedAt:'2026-01-01'},updated_at:'2026-01-01'},
 {dataset_key:'runlu_carpet_inventory_v52',record_id:'y1',payload:{id:'Y',roll:'RC22220',collection:'Elevated',colour:'London Fog',location:'12D',measure:'TM',length:6,originalLength:6,status:'ACTIVE'},updated_at:'2025-01-01'},
 {dataset_key:'runlu_carpet_inventory_v52',record_id:'y2',payload:{id:'Y',roll:'RC2220',collection:'Elevated',colour:'London Fog',location:'12D',measure:'TM',length:6,originalLength:6,status:'ACTIVE'},updated_at:'2026-01-01'}
];
const cut={mode:'READ_ONLY_V6_CUT_SHADOW',rows:[{record_id:'c1',payload:{roll:'RC22220',beforeLength:10,cutLength:4,remainingLength:6},updated_at:'2025-02-01'}]};
const op={mode:'READ_ONLY_V6_OPERATION_SHADOW',rows:[{record_id:'o1',payload:{type:'Inventory Transfer',roll:'RC900',location:'1A',toLocation:'2A'},updated_at:'2025-03-01'}]};
const identity={mode:'V7_CARPET_IDENTITY_V2_REHEARSAL',production_writes:0,counts:{conflict_groups:1},physical_instances:[{legacy_instance_id:'A',company_roll_number:'RC900',current_state:{collection:'Test',colour:'Grey',location:null,length:77,original_length:100,measure:'CAL'},references:{}}],conflicts:[{type:'LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE',legacy_instance_id:'Y',roll_numbers:['RC2220','RC22220'],current_state:{collection:'Elevated',colour:'London Fog',location:'12D',length:6,original_length:6,measure:'TM'}}]};
const operational={mode:'V7_CARPET_IDENTITY_V2_OPERATIONAL_REHEARSAL',production_writes:0,readiness:{deferred_physical_instances:1},deferred:[{legacy_instance_id:'A',company_roll_number:'RC900',reasons:['LOCATION_MISSING']}]};
const out=path.join(dir,'out.json');
const r=spawnSync('python3',['v7/carpet-review-evidence.py',write('snapshot.json',snapshot),write('cut.json',cut),write('op.json',op),write('identity.json',identity),write('operational.json',operational),'--report',out],{encoding:'utf8'});
assert.equal(r.status,0,r.stderr||r.stdout);
const data=JSON.parse(fs.readFileSync(out,'utf8'));
assert.equal(data.mode,'V7_CARPET_REVIEW_EVIDENCE_PACK');
assert.equal(data.production_writes,0);
assert.equal(data.auto_resolution_allowed,false);
assert.equal(data.summary.cases_total,2);
const a=data.cases.find(x=>x.source_record_id==='REVIEW:A');
assert.deepEqual(a.candidates.locations,['2A']);
assert.equal(a.operation_history_by_roll_label.length,1);
assert.equal(a.policy.physical_confirmation_required,true);
const y=data.cases.find(x=>x.review_kind==='IDENTITY');
assert.equal(y.cut_history_by_roll_label.length,1);
assert.deepEqual(y.candidates.company_roll_numbers,['RC22220','RC2220']);
console.log('V7 Carpet Review evidence pack: PASS');
