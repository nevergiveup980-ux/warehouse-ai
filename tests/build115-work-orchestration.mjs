import assert from 'node:assert/strict';

const uiStatus=s=>s==='Scheduled'?'Waiting':String(s||'Waiting');
const open=t=>!['Completed','Cancelled'].includes(uiStatus(t.status));
const actions=s=>{
  s=uiStatus(s);const out=[];
  if(s==='Waiting'||s==='Delayed')out.push('Start');
  if(['In Progress','Partial'].includes(s))out.push('Partial','Pickup Complete');
  if(['Picked Up','Ready'].includes(s))out.push('Complete Task');
  if(!['Picked Up','Ready','Completed','Cancelled'].includes(s))out.push('Delayed');
  return out;
};
let n=0;const ok=f=>{f();n++};
ok(()=>assert.equal(uiStatus('Scheduled'),'Waiting'));
ok(()=>assert.equal(open({status:'Waiting'}),true));
ok(()=>assert.equal(open({status:'Completed'}),false));
ok(()=>assert.deepEqual(actions('Waiting'),['Start','Delayed']));
ok(()=>assert.deepEqual(actions('In Progress'),['Partial','Pickup Complete','Delayed']));
ok(()=>assert.deepEqual(actions('Partial'),['Partial','Pickup Complete','Delayed']));
ok(()=>assert.deepEqual(actions('Picked Up'),['Complete Task']));
ok(()=>assert.deepEqual(actions('Ready'),['Complete Task']));
ok(()=>assert.deepEqual(actions('Completed'),[]));
ok(()=>assert.deepEqual(actions('Cancelled'),[]));
console.log(`Warehouse Build115 work board: ${n}/${n} PASS`);
