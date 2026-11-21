const assert=require('node:assert/strict');
const test=require('node:test');
const {applyCorrectionTransaction}=require('../src/inventory-correction-transaction-reference.js');
const effect=(quantity,itemId='r1',unit='LF')=>({quantity,itemId,unit});
const key=(id='r1',unit='LF')=>JSON.stringify([id,unit]);
function state(balance=100){return {records:{a:{revision:1,effect:effect(100)}},inventory:{[key()]:balance},mutations:{}}}
const request=(newEffect,mutationId='m1')=>({recordId:'a',revision:'1',mutationId,oldEffect:effect(100),newEffect});
test('receipt edit commits record and balance together',()=>{const r=applyCorrectionTransaction(state(),request(effect(80)));assert.equal(r.state.inventory[key()],80);assert.equal(r.state.records.a.effect.quantity,80);assert.equal(r.state.records.a.revision,2)});
test('delete commits record removal and inventory reversal',()=>{const r=applyCorrectionTransaction(state(),request(null));assert.equal(r.state.inventory[key()],0);assert.equal(r.state.records.a,undefined)});
test('duplicate mutation does not apply twice',()=>{const q=request(effect(80));const first=applyCorrectionTransaction(state(),q);const second=applyCorrectionTransaction(first.state,q);assert.equal(second.replayed,true);assert.equal(second.state.inventory[key()],80)});
test('mutation ID reuse with different payload blocked',()=>{const first=applyCorrectionTransaction(state(),request(effect(80)));assert.throws(()=>applyCorrectionTransaction(first.state,request(effect(90))),/reused/)});
test('stale revision rejects without changing input',()=>{const s=state();assert.throws(()=>applyCorrectionTransaction(s,{...request(effect(80)),revision:'2'}),/revision conflict/);assert.equal(s.inventory[key()],100)});
test('old effect mismatch rejects',()=>assert.throws(()=>applyCorrectionTransaction(state(),{...request(effect(80)),oldEffect:effect(99)}),/Original stock effect conflict/));
test('negative balance blocked without partial write',()=>{const s=state(50);assert.throws(()=>applyCorrectionTransaction(s,request(null)),/Insufficient/);assert.equal(s.records.a.revision,1);assert.equal(s.inventory[key()],50)});
test('dependent records block correction',()=>assert.throws(()=>applyCorrectionTransaction(state(),{...request(null),dependents:['cut-1']}),/Dependent/));
test('cross-roll move checks both balances',()=>{const s=state();s.inventory[key('r2')]=10;const r=applyCorrectionTransaction(s,request(effect(100,'r2')));assert.equal(r.state.inventory[key()],0);assert.equal(r.state.inventory[key('r2')],110)});
test('missing target balance blocks move',()=>assert.throws(()=>applyCorrectionTransaction(state(),request(effect(100,'r2'))),/balance missing/));
