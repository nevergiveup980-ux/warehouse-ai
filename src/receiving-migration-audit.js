/* Read-only receiving migration preflight. No inventory mutation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RunluReceivingAudit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const norm=x=>String(x??'').trim().toLowerCase();
const key=r=>JSON.stringify([String(r.masterId??''),norm(r.location),norm(r.lotNumber),norm(r.unit)]);
function auditReceiving(receipts,inventory){
 if(!Array.isArray(receipts)||!Array.isArray(inventory))throw Error('Expected receiving and inventory arrays');
 const buckets=new Map(),issues=[];
 const inv=new Map();
 for(const row of inventory){
  const k=key(row);const list=inv.get(k)||[];list.push(row);inv.set(k,list);
 }
 for(const r of receipts){
  if(!r.inventoryPosted)continue;
  const k=key(r),q=Number(r.quantity),matches=inv.get(k)||[];
  const b=buckets.get(k)||{key:k,masterId:r.masterId,location:r.location,lotNumber:r.lotNumber,unit:r.unit,postedReceipts:0,postedQuantity:0,inventoryRows:matches.length,inventoryQuantity:matches.reduce((a,x)=>a+Number(x.quantity||0),0)};
  b.postedReceipts++;
  if(!Number.isFinite(q)||q<=0)issues.push({recordId:String(r.id),reason:'invalid_receipt_quantity'});
  else b.postedQuantity+=q;
  if(!r.masterId||!r.unit)issues.push({recordId:String(r.id),reason:'missing_identity'});
  if(matches.length===0)issues.push({recordId:String(r.id),reason:'no_matching_current_inventory'});
  if(matches.length>1)issues.push({recordId:String(r.id),reason:'multiple_matching_inventory_rows'});
  if(!r.inventoryRecordId)issues.push({recordId:String(r.id),reason:'missing_inventory_record_link'});
  buckets.set(k,b);
 }
 return {postedReceipts:[...buckets.values()].reduce((a,b)=>a+b.postedReceipts,0),groups:[...buckets.values()],issues};
}
return Object.freeze({auditReceiving});
});
