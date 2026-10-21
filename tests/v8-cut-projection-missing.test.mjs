import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const src=html.slice(html.indexOf('const V8_PENDING_CUT_KEY='),html.indexOf('function dataURLToBlob('));
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
test('missing carpet projection retains pending command and prevents blind retry',async()=>{
 const store=new Map();let sends=0;
 const c={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},v8ReadCutRoll:async r=>({...r,_cloudVersion:1}),RUNLU_V8_CUT_PLAN:()=>({remainingFeet:20}),RUNLU_V8_BUILD_CUT_COMMAND:()=>({commandId:'stable',rollId:id}),v8ExecuteCutCommand:async()=>{sends++;throw Error('CARPET_PROJECTION_MISSING')}};
 vm.createContext(c);vm.runInContext(src,c);
 const op={id:10,date:'2026-10-21',po:'PO-1',customer:'A',quantity:10,numberOfCuts:1},roll={canonicalId:id};
 await assert.rejects(()=>c.v8CommitCutOperation(op,roll),/CARPET_PROJECTION_MISSING/);
 const pending=JSON.parse(store.get('runlu_v8_pending_cut_command'));
 assert.equal(pending.projectionBlocked,true);
 assert.equal(pending.command.commandId,'stable');
 await assert.rejects(()=>c.v8CommitCutOperation(op,roll),/blocked until/);
 assert.equal(sends,1);
});
