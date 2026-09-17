// RUNLU Build144 · Warehouse Data Hygiene Guard
// Product-link recovery may proceed when the only Cloud orphans are inert zero-stock
// PHYSICAL COUNT REQUIRED placeholders. Inventory business data is never rewritten here.
(() => {
'use strict';
if(window.__RUNLU_BUILD144_DATA_HYGIENE__)return;window.__RUNLU_BUILD144_DATA_HYGIENE__=true;
const PM='runlu_product_master_v21',INV='runlu_inventory_records_v21';
const parse=s=>{try{return JSON.parse(s)}catch{return null}},read=k=>parse(localStorage.getItem(k)||'null');
const arr=k=>{const v=read(k);return Array.isArray(v)?v:[]},text=v=>String(v??'').trim();
const productId=p=>text(p?.id||p?.cloudRecordId),masterId=r=>text(r?.masterId);
function inertOrphan(r){return Number(r?.quantity||0)===0&&text(r?.location).toUpperCase()==='PHYSICAL COUNT REQUIRED'}
function orphanInventory(products,inventory){const known=new Set(products.map(productId).filter(Boolean));return inventory.filter(r=>masterId(r)&&!known.has(masterId(r)))}
function planProductRecovery(localProducts,localInventory,cloudRows){
 const active=(Array.isArray(cloudRows)?cloudRows:[]).filter(r=>!r?.deleted_at),cp=active.filter(r=>r.dataset_key===PM).map(r=>({...r.payload,id:text(r.record_id||r.payload?.id)})),ci=active.filter(r=>r.dataset_key===INV).map(r=>r.payload||{}),byId=new Map(cp.map(p=>[productId(p),p]));
 const cloudOrphans=orphanInventory(cp,ci),blocking=cloudOrphans.filter(r=>!inertOrphan(r)),localOrphans=orphanInventory(localProducts,localInventory),missing=[...new Set(localOrphans.map(masterId))],unresolved=missing.filter(id=>!byId.has(id)&&!localOrphans.filter(r=>masterId(r)===id).every(inertOrphan)),localIds=new Set(localProducts.map(productId)),recovered=cp.filter(p=>!localIds.has(productId(p)));
 return {cloudOrphans,blocking,localOrphans,unresolved,recovered,merged:[...localProducts,...recovered]};
}
function applyProductPlan(plan){if(plan.blocking.length||plan.unresolved.length)return {status:'blocked'};const before=JSON.stringify(arr(INV));if(plan.recovered.length)localStorage.setItem(PM,JSON.stringify(plan.merged));if(JSON.stringify(arr(INV))!==before)throw new Error('Build144 inventory immutability failure');return {status:'recovered',recovered:plan.recovered.length,remaining:orphanInventory(arr(PM),arr(INV)).length}}
function inventoryKey(r){if(!r||typeof r!=='object')return '';const master=text(r.masterId).toLowerCase(),po=text(r.po||r.poNumber).toLowerCase(),loc=text(r.location).toLowerCase(),unit=text(r.unit).toLowerCase(),qty=Number(r.quantity);if(!master||!loc||!unit||!Number.isFinite(qty))return '';return [master,po,loc,unit,String(qty)].join('|')}
function isProtected(r){return /\brc\d+\b/i.test(JSON.stringify(r||{}))||text(r?.category).toLowerCase()==='carpet'}
function planInventory(){const groups=new Map();for(const r of arr(INV)){if(isProtected(r))continue;const k=inventoryKey(r);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}return [...groups].filter(([,v])=>v.length>1).map(([key,items])=>({key,keep:items[0],remove:items.slice(1)}))}
window.RUNLUDataHygieneBuild144={inertOrphan,orphanInventory,planProductRecovery,applyProductPlan,inventoryKey,isProtected,planInventory};
})();
