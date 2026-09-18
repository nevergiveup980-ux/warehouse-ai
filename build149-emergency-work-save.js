// RUNLU Warehouse OS Build149 · Emergency Work Save
// If a managed dataset cannot fit in localStorage, preserve only the delta in the
// existing Cloud Master queue instead of dropping today's work.
// This layer never overwrites Cloud directly.
(() => {
'use strict';
if(window.__RUNLU_BUILD149_EMERGENCY_WORK_SAVE__)return;
window.__RUNLU_BUILD149_EMERGENCY_WORK_SAVE__=true;
const QUEUE='runlu_cloud_master_offline_queue_v680';
const VERSIONS='runlu_cloud_master_record_versions_v680';
const INV='runlu_inventory_records_v21';
const MANAGED=new Set(['runlu_product_master_v21','runlu_inventory_records_v21','runlu_carpet_inventory_v52','runlu_orders_v20','runlu_special_orders_v51','runlu_receiving_v50','runlu_operations_log_v52','runlu_cutting_log_v52','runlu_event_history_v52','runlu_remnants_v55','runlu_tasks_v50','runlu_tag_print_history_v53','runlu_settings_v20']);
const parse=s=>{try{return JSON.parse(s)}catch{return null}},clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const read=k=>parse(localStorage.getItem(k)||'null');
const sid=(d,r)=>{if(!r||typeof r!=='object')return'';if(d===INV)return String(r.inventoryId||r.id||r.cloudRecordId||'');return String(r.id||r.operationId||r.orderId||r.receivingId||r.cutId||r.eventId||r.rollId||r.remnantId||r.taskId||r.printId||r.productId||r.cloudRecordId||'')};
const eq=(a,b)=>{try{return JSON.stringify(a)===JSON.stringify(b)}catch{return false}};
const vkey=(d,id)=>d+'::'+id;
const ver=(d,id)=>Number((read(VERSIONS)||{})[vkey(d,id)]||0);
const qid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
function emergencyQueue(dataset,before,after){
  if(dataset==='runlu_settings_v20')return false; // never partial-save settings
  if(!Array.isArray(before))before=[];if(!Array.isArray(after))return false;
  const a=new Map(),b=new Map();before.forEach(r=>{const id=sid(dataset,r);if(id)a.set(id,r)});after.forEach(r=>{const id=sid(dataset,r);if(id)b.set(id,r)});
  const changes=[];
  for(const [id,row] of b){const old=a.get(id);if(!old||!eq(old,row))changes.push({datasetKey:dataset,recordId:id,op:'upsert',payload:clone(row),baseVersion:ver(dataset,id)})}
  for(const [id,row] of a){if(!b.has(id))changes.push({datasetKey:dataset,recordId:id,op:'delete',payload:clone(row),baseVersion:ver(dataset,id)})}
  if(!changes.length)return false;
  let q=read(QUEUE);if(!Array.isArray(q))q=[];
  for(const m of changes){
    const idx=q.findIndex(x=>x.datasetKey===m.datasetKey&&x.recordId===m.recordId&&!x.blocked);
    const item={...m,queuedAt:new Date().toISOString(),attempts:0,blocked:false,source:m.datasetKey===INV?'live-save':'build149-emergency-live-save',replayHeld:false,emergencyWorkSave:true};
    if(idx>=0)q[idx]={...q[idx],...item,id:q[idx].id};else q.push({id:qid(),...item});
  }
  try{localStorage.setItem(QUEUE,JSON.stringify(q))}catch{return false}
  return true;
}
function install(){
 const cur=window.save;if(typeof cur!=='function'||cur.__build149)return false;
 const original=cur;
 const wrapped=function(k,v){
   if(!MANAGED.has(k))return original.apply(this,arguments);
   const before=read(k);
   const ok=original.apply(this,arguments);
   if(ok!==false)return ok;
   if(emergencyQueue(k,before,v)){
     try{window.runluCloudMasterSync?.({silent:true})}catch{}
     return true;
   }
   return false;
 };
 wrapped.__build149=true;wrapped.__original=original;window.save=wrapped;return true;
}
window.RUNLUEmergencyWorkSaveBuild149={version:'149',install,emergencyQueue};
install();let n=0;const t=setInterval(()=>{install();if(++n>=300)clearInterval(t)},200);
})();