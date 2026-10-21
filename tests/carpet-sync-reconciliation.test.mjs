import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCarpetSync} from '../tools/carpet-sync-reconciliation.mjs';
const row=(id,more={})=>({id,roll:'RC2249',name:'Sample',color:'Blue',dyelot:'D1',length:80,width:12,status:'FULL',...more});
test('identical device and cloud copies are review-only candidates',()=>{
 const a=analyzeCarpetSync({deviceRows:[row('a')],cloudRows:[row('a')]});
 assert.equal(a.groups[0].classification,'candidate_duplicate');
 assert.equal(a.groups[0].deleteAllowed,false);
});
test('same roll but different lengths is a conflict, not automatic duplicate',()=>{
 const a=analyzeCarpetSync({deviceRows:[row('a')],cloudRows:[row('b',{length:72})]});
 assert.equal(a.groups[0].classification,'conflicting_records');
 assert.equal(a.groups[0].deleteAllowed,false);
});
test('pending operations are counted and never mutated',()=>{
 const ops=[{record_id:'a',base_version:null}];const before=JSON.stringify(ops);
 const a=analyzeCarpetSync({deviceRows:[row('a'),row('b')],outbox:ops});
 assert.equal(a.missingBaseVersionCount,1);
 assert.equal(a.groups[0].pendingOperationCount,1);
 assert.equal(JSON.stringify(ops),before);
});
test('different rolls are not classified as duplicates',()=>{
 const a=analyzeCarpetSync({deviceRows:[row('a'),row('b',{roll:'RC2250'})]});
 assert.equal(a.groups.length,0);
});
