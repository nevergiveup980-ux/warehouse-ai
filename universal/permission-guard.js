/* RUNLU Warehouse OS — role enforcement for the mature local-first core. */
(function(global){
'use strict';
const W=global.RUNLUWorkspace;
if(!W)throw new Error('workspace.js must load before permission-guard.js');
const wrapped=new Set();
function deny(action){const labels={manageProducts:'Product Master changes require Manager or above.',editInventory:'Direct inventory corrections require Manager or above.',manageOrders:'Order creation and management require Manager or above.',manageWarehouse:'Warehouse settings require Administrator or Owner.',receive:'Receiving requires Staff or above.',transfer:'Transfers require Staff or above.',cutPick:'Cut / Pick requires Staff or above.',ship:'Shipping requires Staff or above.',returnStock:'Returns require Staff or above.',count:'Cycle count requires Staff or above.'};alert(labels[action]||'Your account does not have permission for this action.');return false}
function operationAction(type){const t=String(type||'').toLowerCase();if(t.includes('receiv')||t.includes('pickup')||t.includes('put-away'))return'receive';if(t.includes('transfer'))return'transfer';if(t.includes('cut'))return'cutPick';if(t.includes('ship')||t.includes('material issue'))return'ship';if(t.includes('return'))return'returnStock';if(t.includes('count')||t.includes('inspection'))return'count';return'count'}
function can(action){return W.can(action)}
function wrap(name,actionOrResolver){if(wrapped.has(name)||typeof global[name]!=='function')return;const original=global[name];const guarded=function(){let action=typeof actionOrResolver==='function'?actionOrResolver.apply(this,arguments):actionOrResolver;if(!can(action))return deny(action);return original.apply(this,arguments)};guarded.__runluPermissionGuard=true;guarded.__original=original;global[name]=guarded;wrapped.add(name)}
function install(){
  [['newProduct','manageProducts'],['scanNewProduct','manageProducts'],['saveProduct','manageProducts'],
   ['saveInventoryRecordEdits','editInventory'],['addInventoryRecordForManagedProduct','editInventory'],['deleteInventoryRecordSafely','editInventory'],['deleteUnusedInventoryRecord','editInventory'],['archiveInventoryRecord','editInventory'],
   ['newOrder','manageOrders'],['scanNewOrder','manageOrders'],['saveOrder','manageOrders'],['completeCurrentCustomerOrder','manageOrders'],['completeWorkspaceOrder','manageOrders'],['deleteCurrentCustomerOrder','manageOrders'],['archiveCurrentCustomerOrder','manageOrders'],
   ['newReceiving','receive'],['scanNewReceiving','receive'],['saveReceiving','receive'],['newReceivingForProduct','receive'],
   ['newShippingForProduct','ship'],['newCustomerReturnForRecord','returnStock'],['prepareProductDrivenCustomerReturn','returnStock'],['cutWorkspaceTask','cutPick'],
   ['deleteOperation','editInventory']].forEach(([n,a])=>wrap(n,a));
  wrap('saveOperation',()=>operationAction(document.getElementById('operationLineType')?.value||document.getElementById('operationType')?.value));
  wrap('setOperationStatus',function(id){try{const row=typeof global.operationRecords==='function'?global.operationRecords().find(r=>String(r.id)===String(id)):null;return operationAction(row?.type||row?.items?.[0]?.type)}catch(_){return'count'}});
  if(!wrapped.has('showPage')&&typeof global.showPage==='function'){
    const original=global.showPage;global.showPage=function(id){const page=String(id||'');if(['settings','developer','databaseHealth','databaseExplorer'].includes(page)&&!can('manageWarehouse'))return deny('manageWarehouse');if(page==='editor'&&!can('manageProducts'))return deny('manageProducts');if(page==='orderEditor'&&!can('manageOrders'))return deny('manageOrders');return original.apply(this,arguments)};wrapped.add('showPage')
  }
  applyUI();
}
function classifyButton(btn){const raw=((btn.getAttribute?.('onclick')||'')+' '+(btn.textContent||'')).toLowerCase();if(/saveproduct|newproduct|scannewproduct|add \/ edit product|product master/.test(raw))return'manageProducts';if(/saveinventoryrecordedits|addinventoryrecord|deleteinventoryrecord|archiveinventoryrecord|add \/ correct record/.test(raw))return'editInventory';if(/neworder|saveorder|completecurrentcustomerorder|deletecurrentcustomerorder|archivecurrentcustomerorder|\+ new order/.test(raw))return'manageOrders';if(/savereceiving|newreceiving|receive stock|supplier pickup/.test(raw))return'receive';if(/newshippingforproduct|ship to customer/.test(raw))return'ship';if(/customer return/.test(raw))return'returnStock';if(/company settings|developer|database explorer|database health/.test(raw))return'manageWarehouse';return null}
function applyUI(){const role=W.role();document.documentElement.setAttribute('data-runlu-local-role',role);document.querySelectorAll('button,[role="button"]').forEach(btn=>{let action=classifyButton(btn);if(role==='viewer'&&!action&&typeof global.accessMutationButtonIsWrite==='function'&&global.accessMutationButtonIsWrite(btn))action='editInventory';if(action&&!can(action)){btn.disabled=true;btn.setAttribute('aria-disabled','true');btn.title='Not available for '+(role==='member'?'Staff':role)+' role'}})}
const observer=new MutationObserver(()=>applyUI());
function boot(){install();observer.observe(document.documentElement,{subtree:true,childList:true});let tries=0;const timer=setInterval(()=>{install();if(++tries>40)clearInterval(timer)},250)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
global.RUNLUPermissions=Object.freeze({operationAction,install,applyUI,can});
})(window);
