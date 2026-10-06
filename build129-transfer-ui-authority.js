// RUNLU Warehouse OS V8.0.1 Build129 · Inventory Transfer UI Authority.
// Final presentation guard: Transfer must expose both source and destination fields.
// UI only. It never mutates inventory, locations, quantities, or operation records.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD129_TRANSFER_UI_AUTHORITY__)return;
  window.__RUNLU_BUILD129_TRANSFER_UI_AUTHORITY__=true;

  const q=id=>document.getElementById(id);
  const isTransfer=()=>q('operationLineType')?.value==='Inventory Transfer' ||
    q('operationType')?.value==='Inventory Transfer';

  function apply(){
    const transfer=isTransfer();
    const sourceLabel=q('operationLocationLabel');
    const source=q('operationLocation');
    const toWrap=q('operationToLocationWrap');
    const to=q('operationToLocation');
    if(sourceLabel)sourceLabel.textContent=transfer?'From Location':'Location';
    if(source){
      if(transfer)source.placeholder='Source location';
      else if(source.placeholder==='Source location')source.removeAttribute('placeholder');
    }
    if(toWrap){
      toWrap.style.display=transfer?'block':'none';
      toWrap.classList.toggle('hidden',!transfer);
    }
    if(to)to.placeholder=transfer?'Destination location — example: Store':'Example: Store Samples';
    document.documentElement.setAttribute('data-runlu-transfer-ui',transfer?'from-to':'single-location');
  }

  function wrap(name){
    const base=window[name];
    if(typeof base!=='function'||base.__build129TransferUiAuthority)return;
    const wrapped=function(){
      const result=base.apply(this,arguments);
      apply();
      queueMicrotask(apply);
      return result;
    };
    wrapped.__build129TransferUiAuthority=true;
    wrapped.__original=base;
    window[name]=wrapped;
  }

  function install(){
    wrap('updateOperationForm');
    wrap('operationLineTypeChanged');
    wrap('editOperation');
    apply();
    return !!(q('operationLocation')&&q('operationToLocation'));
  }

  document.addEventListener('change',e=>{
    if(['operationLineType','operationType','operationLineInventoryMode'].includes(e.target?.id))queueMicrotask(apply);
  },true);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  let tries=0;
  const timer=setInterval(()=>{install();if(++tries>=40)clearInterval(timer)},150);
  window.addEventListener('pageshow',()=>setTimeout(install,40));
  window.addEventListener('focus',()=>setTimeout(apply,40));

  window.RUNLUTransferUiAuthorityBuild129={version:'129',apply,install};
})();
