// RUNLU Warehouse OS V8.0.1 Build132 · Product-level Shipping Selection Authority.
// Generic for all inventory products. Product-level "Ship to Customer" keeps the
// selected Product Master fixed. One positive inventory record => auto-lock it.
// Multiple records => user chooses the exact Existing Inventory Record. No guessing.
(() => {
'use strict';
if(window.__RUNLU_BUILD132_PRODUCT_SHIPPING_SELECTION__)return;
window.__RUNLU_BUILD132_PRODUCT_SHIPPING_SELECTION__=true;
const q=id=>document.getElementById(id);
const currentRows=masterId=>{try{return (window.localInventoryRecordsForProduct?.(masterId)||[]).filter(r=>Number(r.quantity||0)>0)}catch(_){return[]}};
const identity=r=>{try{return window.inventoryRecordIdentity?.(r)||String(r.inventoryId||r.id||'')}catch(_){return String(r.inventoryId||r.id||'')}};
const master=masterId=>{try{return (window.loadMasters?.()||[]).find(m=>String(m.id)===String(masterId))}catch(_){return null}};

function lockProduct(masterId){
 const m=master(masterId); if(!m)return false;
 if(q('operationProduct')){q('operationProduct').value=window.productDisplayLabel?window.productDisplayLabel(m):(m.name||'');q('operationProduct').dataset.productId=String(m.id);q('operationProduct').readOnly=true}
 if(q('operationCollection'))q('operationCollection').value=m.name||m.series||'';
 if(q('operationColour'))q('operationColour').value=m.color||'';
 const search=q('operationProductSearchWrap'); if(search)search.style.display='none';
 return true;
}
function applyProductShipping(masterId){
 const m=master(masterId); if(!m)return false;
 lockProduct(masterId);
 const rs=currentRows(masterId);
 try{window.populateOperationInventoryPicker?.(masterId,rs.length===1?identity(rs[0]):'')}catch(_){}
 if(rs.length===1){
   const id=identity(rs[0]);
   if(window.RUNLUShippingInventoryIdentityBuild131?.apply)window.RUNLUShippingInventoryIdentityBuild131.apply(id);
   else if(q('operationInventoryRecord')){q('operationInventoryRecord').value=id;window.operationInventoryRecordChanged?.()}
 }else{
   if(q('operationInventoryRecord'))q('operationInventoryRecord').value='';
   if(q('operationLocation'))q('operationLocation').value='';
 }
 document.documentElement.setAttribute('data-runlu-product-shipping',rs.length===1?'auto-record':'choose-record');
 return true;
}
function wrap(){
 const base=window.newShippingForProduct;
 if(typeof base!=='function'||base.__build132Selection)return;
 const wrapped=function(masterId){
   const out=base.apply(this,arguments);
   applyProductShipping(masterId);
   queueMicrotask(()=>applyProductShipping(masterId));
   setTimeout(()=>applyProductShipping(masterId),100);
   return out;
 };
 wrapped.__build132Selection=true;wrapped.__original=base;window.newShippingForProduct=wrapped;
}
function install(){wrap();return true}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
let tries=0;const timer=setInterval(()=>{install();if(++tries>=40)clearInterval(timer)},150);
window.RUNLUProductShippingSelectionBuild132={version:'132',install,applyProductShipping};
})();