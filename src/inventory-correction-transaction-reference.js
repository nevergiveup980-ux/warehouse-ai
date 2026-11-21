'use strict';
// In-memory reference implementation of the cloud transaction contract.
// NOT a production database adapter. A future PostgreSQL RPC must enforce
// equivalent invariants inside one transaction with row locks.
const {planCorrection}=require('./inventory-correction-planner.js');
function assert(x,msg){if(!x)throw new Error(msg)}
function applyCorrectionTransaction(state,request){
  assert(state&&state.records&&state.inventory&&state.mutations,'Invalid transaction state');
  const {recordId,revision,mutationId,oldEffect,newEffect,dependents=[]}=request;
  assert(typeof mutationId==='string'&&mutationId.trim().length>0,'Mutation ID required');
  assert(Number.isSafeInteger(existingRevision(state.records[recordId])),'Invalid stored record revision');
  const prior=Object.hasOwn(state.mutations,mutationId)?state.mutations[mutationId]:null;
  // Replayed requests must match exactly; never silently accept a different payload.
  const fingerprint=JSON.stringify({recordId,revision,oldEffect,newEffect,dependents});
  if(prior){assert(prior.fingerprint===fingerprint,'Mutation ID reused with different request');return {state,result:prior.result,replayed:true}}
  const existing=state.records[recordId];
  assert(existing,'Record not found');
  assert(String(existing.revision)===String(revision),'Record revision conflict');
  assert(JSON.stringify(existing.effect)===JSON.stringify(oldEffect),'Original stock effect conflict');
  const plan=planCorrection(request);
  const inventory={...state.inventory};
  for(const delta of plan.deltas){
    const key=JSON.stringify([delta.itemId,delta.unit]);
    assert(Object.hasOwn(inventory,key),'Inventory balance missing');
    const before=inventory[key];
    assert(typeof before==='number'&&Number.isFinite(before),'Invalid inventory balance');
    const after=before+delta.delta;
    assert(Number.isFinite(after)&&after>=0,'Insufficient or invalid inventory balance');
    inventory[key]=after;
  }
  const records={...state.records};
  if(newEffect===null)delete records[recordId];
  else records[recordId]={...existing,effect:newEffect,revision:existingRevision(existing)+1};
  const result={recordId,action:plan.action,deltas:plan.deltas};
  return {state:{...state,inventory,records,mutations:{...state.mutations,[mutationId]:{fingerprint,result}}},result,replayed:false};
}
function existingRevision(record){return record?.revision;}
module.exports={applyCorrectionTransaction};
