// RUNLU Warehouse OS V8.0.1 Build130 · Product action routing authority.
// Prevents a stale Flooring OS URL handoff from reclaiming the page after the user
// deliberately starts Shipping / Receiving / Return from Product Inventory.
// Navigation only. Never mutates inventory, operations, quantities or cloud records.
(() => {
'use strict';
if(window.__RUNLU_BUILD130_PRODUCT_ACTION_ROUTING__)return;
window.__RUNLU_BUILD130_PRODUCT_ACTION_ROUTING__=true;
const q=id=>document.getElementById(id);
const handoffPresent=()=>{const p=new URLSearchParams(location.search);return (p.get('from')||'').toLowerCase()==='flooring'&&!!p.get('po')};
const stripFlooringHandoff=()=>{if(!handoffPresent())return;const u=new URL(location.href);['from','po','supplier','pickup','poStatus','pickupStatus','fulfillment','purchaseType','job','customer','items'].forEach(k=>u.searchParams.delete(k));history.replaceState(history.state,'',u.pathname+(u.search?u.search:'')+u.hash)};
function preserveOperationRoute(kind){stripFlooringHandoff();queueMicrotask(()=>{if(kind==='Shipping'){try{window.showPage?.('operationEditor')}catch(_){}if(q('operationEditorTitle'))q('operationEditorTitle').textContent='Ship Product to Customer'}})}
function wrap(name,kind){const base=window[name];if(typeof base!=='function'||base.__build130ProductRouting)return;const wrapped=function(){stripFlooringHandoff();const out=base.apply(this,arguments);preserveOperationRoute(kind);return out};wrapped.__build130ProductRouting=true;wrapped.__original=base;window[name]=wrapped}
function install(){wrap('newShippingForProduct','Shipping');wrap('newShippingForRecord','Shipping');wrap('newReceivingForProduct','Receiving');wrap('newReceivingForRecord','Receiving');wrap('newCustomerReturnForRecord','Customer Return');return true}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
let tries=0;const timer=setInterval(()=>{install();if(++tries>=40)clearInterval(timer)},150);
window.RUNLUProductActionRoutingBuild130={version:'130',install,stripFlooringHandoff};
})();