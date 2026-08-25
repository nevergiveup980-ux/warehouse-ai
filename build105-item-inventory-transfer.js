// RUNLU Warehouse OS V6.12.12 Build105 · Item Inventory Handling transfer clarity.
// UI-only Transfer mode maps to the existing Stock-backed Inventory Transfer engine.
// Ordinary Stock keeps one Location field; Transfer shows and validates From + To.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD105_ITEM_INVENTORY_TRANSFER__) return;
  window.__RUNLU_BUILD105_ITEM_INVENTORY_TRANSFER__ = true;

  const q=id=>document.getElementById(id);
  const TRANSFER_VALUE='Transfer';
  let handlingChange=false;
  let lastNonTransferType='Shipping';

  function ensureTransferOption(){
    const mode=q('operationLineInventoryMode');
    if(!mode)return;
    let option=[...mode.options].find(o=>o.value===TRANSFER_VALUE);
    if(!option){
      option=document.createElement('option');
      option.value=TRANSFER_VALUE;
      option.textContent='Transfer — From Location → To Location';
      const stock=[...mode.options].find(o=>o.value==='Stock');
      if(stock?.nextSibling)mode.insertBefore(option,stock.nextSibling);else mode.appendChild(option);
    }else{
      option.textContent='Transfer — From Location → To Location';
    }
    const meta=mode.parentElement?.querySelector('.meta');
    if(meta)meta.innerHTML='<b>This setting applies to this item.</b> Stock uses one Location. Transfer moves stock from From Location to To Location; only Transfer requires both locations.';
  }

  function applyTransferPresentation(isTransfer){
    const sourceLabel=q('operationLocationLabel');
    const source=q('operationLocation');
    const toWrap=q('operationToLocationWrap');
    const to=q('operationToLocation');
    if(sourceLabel)sourceLabel.textContent=isTransfer?'From Location':'Location';
    if(source){
      if(isTransfer)source.placeholder='Source location';
      else if(source.placeholder==='Source location')source.removeAttribute('placeholder');
    }
    if(toWrap)toWrap.style.display=isTransfer?'block':'none';
    if(to)to.placeholder=isTransfer?'Destination location — example: Store 1':'Example: Store Samples';
  }

  function install(){
    ensureTransferOption();
    const mode=q('operationLineInventoryMode');
    const type=q('operationLineType');
    if(!mode||!type||typeof window.updateOperationForm!=='function'||typeof window.operationItemFromForm!=='function')return false;
    if(window.__RUNLU_BUILD105_INSTALLED__)return true;
    window.__RUNLU_BUILD105_INSTALLED__=true;

    document.addEventListener('change',e=>{
      if(e.target===mode)handlingChange=true;
    },true);

    const baseUpdate=window.updateOperationForm;
    window.updateOperationForm=function(){
      ensureTransferOption();
      const m=q('operationLineInventoryMode');
      const t=q('operationLineType');
      const changedByHandling=handlingChange;
      handlingChange=false;

      if(t?.value && t.value!=='Inventory Transfer')lastNonTransferType=t.value;

      if(changedByHandling && m && t){
        if(m.value===TRANSFER_VALUE){
          if(t.value!=='Inventory Transfer')lastNonTransferType=t.value||lastNonTransferType;
          t.value='Inventory Transfer';
        }else if(t.value==='Inventory Transfer'){
          t.value=lastNonTransferType||'Shipping';
        }
      }

      baseUpdate.apply(this,arguments);

      const isTransfer=q('operationLineType')?.value==='Inventory Transfer';
      const currentMode=q('operationLineInventoryMode');
      if(currentMode && !currentMode.disabled){
        if(isTransfer)currentMode.value=TRANSFER_VALUE;
        else if(currentMode.value===TRANSFER_VALUE)currentMode.value='Stock';
      }
      applyTransferPresentation(isTransfer);
    };

    const baseItemFromForm=window.operationItemFromForm;
    window.operationItemFromForm=function(requireContent=false){
      const m=q('operationLineInventoryMode');
      const uiTransfer=!!m && m.value===TRANSFER_VALUE;
      if(uiTransfer)m.value='Stock';
      try{
        const item=baseItemFromForm.call(this,requireContent);
        if(item && uiTransfer){
          item.inventoryMode='Stock';
          item.type='Inventory Transfer';
        }
        return item;
      }finally{
        if(uiTransfer && m)m.value=TRANSFER_VALUE;
      }
    };

    window.updateOperationForm();
    return true;
  }

  function boot(){
    if(install())return;
    let tries=0;
    const timer=setInterval(()=>{if(install()||++tries>=20)clearInterval(timer)},150);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',()=>setTimeout(()=>{ensureTransferOption();try{window.updateOperationForm?.()}catch(_){}},100));
})();
