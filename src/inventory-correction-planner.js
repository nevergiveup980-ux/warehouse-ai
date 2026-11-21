/* Inventory correction planner: pure, side-effect-free. Not wired to production writes. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RunluInventoryCorrectionPlanner=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function assert(condition,message){if(!condition)throw new Error(message)}
  function normalized(effect){
    assert(effect&&typeof effect==='object','Original stock effect is required');
    const itemId=String(effect.itemId??'').trim();
    const unit=String(effect.unit??'').trim().toUpperCase();
    assert(typeof effect.quantity==='number'&&Number.isFinite(effect.quantity),'Invalid stock effect quantity');
    const quantity=effect.quantity;
    assert(itemId,'Stock item/roll ID is required');
    assert(['LF','SF','SYD','EA','CARTON','BOX'].includes(unit),'Unsupported inventory unit');
    assert(Number.isFinite(quantity),'Invalid stock effect quantity');
    assert(Math.abs(quantity)<=1e9,'Stock effect out of range');
    return {itemId,unit,quantity};
  }
  function planCorrection({recordId,revision,mutationId,oldEffect,newEffect,dependents=[]}){
    assert(String(recordId??'').trim(),'Record ID is required');
    assert(String(revision??'').trim(),'Expected revision is required');
    assert(String(mutationId??'').trim(),'Idempotency mutation ID is required');
    assert(Array.isArray(dependents),'Dependent references must be an array');
    assert(dependents.length===0,'Dependent records must be resolved before correction');
    const old=normalized(oldEffect);
    const next=newEffect===null?null:normalized(newEffect);
    const changes=new Map();
    function add(effect,amount){
      const key=JSON.stringify([effect.itemId,effect.unit]);
      const row=changes.get(key)||{itemId:effect.itemId,unit:effect.unit,delta:0};
      row.delta+=amount;changes.set(key,row);
    }
    add(old,-old.quantity);
    if(next)add(next,next.quantity);
    return Object.freeze({
      recordId:String(recordId),expectedRevision:String(revision),mutationId:String(mutationId),
      action:next?'edit':'delete',
      deltas:[...changes.values()].filter(x=>Math.abs(x.delta)>1e-9).map(x=>Object.freeze(x))
    });
  }
  return Object.freeze({planCorrection});
});
