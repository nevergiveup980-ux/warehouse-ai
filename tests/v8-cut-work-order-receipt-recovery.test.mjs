import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('const V8_PENDING_CUT_KEY='),end=html.indexOf('\nfunction dataURLToBlob(',start);
assert.ok(start>=0&&end>start);
const code=html.slice(start,end);
function setup(){
 const map=new Map();let calls=0;
 const ctx={localStorage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},v8ReadCutRoll:async r=>r,RUNLU_V8_CUT_PLAN:()=>({requestedFeet:10,deductFeet:10,beforeFeet:50,remainingFeet:40,expectedVersion:1}),RUNLU_V8_BUILD_CUT_COMMAND:()=>({commandId:'cmd-1',rollId:'roll-1'}),v8ExecuteCutCommand:async()=>{calls++;return {status:'committed'}},RUNLU_V8_VALIDATE_CUT_RESULT:()=>{}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx,map,calls:()=>calls};
}
const op=()=>({id:7,date:'2026-10-21',po:'181886',customer:'Paul',quantity:10,numberOfCuts:1});
const roll={canonicalId:'roll-1'};
test('committed receipt persists and repeated work-order save does not repeat cut',async()=>{
 const h=setup();await h.ctx.v8CommitCutOperation(op(),roll);
 const p=JSON.parse(h.map.get('runlu_v8_pending_cut_command'));
 assert.equal(p.committedReceipt.commandId,'cmd-1');
 await h.ctx.v8CommitCutOperation(op(),roll);
 assert.equal(h.calls(),1);
});
test('changed order identity cannot reuse committed receipt',async()=>{
 const h=setup();await h.ctx.v8CommitCutOperation(op(),roll);
 await assert.rejects(()=>h.ctx.v8CommitCutOperation({...op(),quantity:11},roll),/previous cut is awaiting confirmation/);
 assert.equal(h.calls(),1);
});
test('tampered receipt is rejected without executing cut',async()=>{
 const h=setup();await h.ctx.v8CommitCutOperation(op(),roll);
 const p=JSON.parse(h.map.get('runlu_v8_pending_cut_command'));p.committedReceipt.commandId='other';h.map.set('runlu_v8_pending_cut_command',JSON.stringify(p));
 await assert.rejects(()=>h.ctx.v8CommitCutOperation(op(),roll),/does not match this order/);
 assert.equal(h.calls(),1);
});
