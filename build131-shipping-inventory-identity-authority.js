// RUNLU Warehouse OS V8.0.1 Build131 · Shipping Inventory Identity Authority.
// Generic rule for every inventory product: an explicit inventory record selected
// from Inventory remains the sole stock identity throughout Shipping.
// UI/identity authority only; stock mutation remains in the existing save pipeline.
(() => {
'use strict';
if(window.__RUNLU_BUILD131_SHIPPING_INVENTORY_IDENTITY__)return;
window.__RUNLU_BUILD131_SHIPPING_INVENTORY_IDENTITY__=true;
const q=id=>document.getElementById(id);
let lockedIdentity='';

function rows(){try{return typeof window.loadInventoryRecords==='function'?window.loadInventoryRecords():[]}catch(_){return[]}}
function identityOf(r){try{return typeof window.inventoryRecordIdentity==='function'?window.inventoryRecordIdentity(r):String(r?.inventoryId||r?.id||'')}catch(_){return String(r?.inventoryId||r?.id||'')}}
function exact(identity){const all=rows();try{if(typeof window.findInventoryRecordByIdentity==='function')return window.findInventoryRecordByIdentity(all,identity)}catch(_){}return all.find(r=>identityOf(r)===String(identity))}
function masterFor(r){try{return (window.loadMasters?.()||[]).find(m=>String(m.id)===String(r?.masterId))}catch(_){return null}}

function apply(identity){
 const r=exact(identity); if(!r)return false;
 const m=masterFor(r); if(!m)return false;
 lockedIdentity=identityOf(r);
 try{window.populateOperationInventoryPicker?.(m.id,lockedIdentity)}catch(_){}
 if(q('operationInventoryRecord')){q('operationInventoryRecord').value=lockedIdentity; q('operationInventoryRecord').dataset.lockedIdentity=lockedIdentity}
 if(q('operationProduct')){q('operationProduct').value=window.productDisplayLabel?window.productDisplayLabel(m):(m.name||'');q('operationProduct').dataset.productId=String(m.id)}
 if(q('operationCollection'))q('operationCollection').value=m.name||m.series||'';
 if(q('operationColour'))q('operationColour').value=m.color||'';
 if(q('operationLocation'))q('operationLocation').value=r.location||'';
 if(q('operationUnit'))q('operationUnit').value=r.unit||m.coverageUnit||'Box';
 if(q('operationLot'))q('operationLot').value=r.lotNumber||'';
 const search=q('operationProductSearchWrap'); if(search)search.style.display='none';
 try{window.updateOperationCalculationPreview?.()}catch(_){}
 document.documentElement.setAttribute('data-runlu-shipping-identity','locked');
 return true;
}

function unlockForBlankShipping(){
 lockedIdentity='';
 const search=q('operationProductSearchWrap'); if(search)search.style.display='';
 document.documentElement.removeAttribute('data-runlu-shipping-identity');
}

function wrapRecord(){
 const base=window.newShippingForRecord;
 if(typeof base!=='function'||base.__build131Identity)return;
 const wrapped=function(identity){
   const r=exact(identity); if(!r)return base.apply(this,arguments);
   const stable=identityOf(r);
   const out=base.call(this,stable);
   apply(stable); queueMicrotask(()=>apply(stable)); setTimeout(()=>apply(stable),80);
   return out;
 };
 wrapped.__build131Identity=true;wrapped.__original=base;window.newShippingForRecord=wrapped;
}

function wrapPrepare(){
 const base=window.prepareProductDrivenShipping;
 if(typeof base!=='function'||base.__build131Identity)return;
 const wrapped=function(masterId,recordId=''){
   const out=base.apply(this,arguments);
   if(recordId){apply(recordId);queueMicrotask(()=>apply(recordId));setTimeout(()=>apply(recordId),80)}
   else unlockForBlankShipping();
   return out;
 };
 wrapped.__build131Identity=true;wrapped.__original=base;window.prepareProductDrivenShipping=wrapped;
}

function install(){wrapPrepare();wrapRecord();return true}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
let tries=0;const timer=setInterval(()=>{install();if(++tries>=40)clearInterval(timer)},150);
window.RUNLUShippingInventoryIdentityBuild131={version:'131',apply,install,get lockedIdentity(){return lockedIdentity}};
})();