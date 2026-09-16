// RUNLU Warehouse OS V6.12.45 Build140 · Fast Entry / Mobile Input Stability.
// Performance-only layer: no inventory math, identity, cloud authority, or business rules change.
// The operation editor had accumulated several expensive per-keystroke recalculations plus
// background hidden carpet renders. On iPhone/iPad that made ordinary typing feel sticky.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD140_FAST_ENTRY__)return;
  window.__RUNLU_BUILD140_FAST_ENTRY__=true;

  const VERSION='6.12.45', BUILD='140';
  const timers=new Map();
  let draftTimer=null;
  const FORM_IDS=new Set(['operationEditor','orderEditor','specialOrderEditor','receivingEditor','editor','carpetEditor','scan']);
  const STRUCTURE_TYPING_IDS=new Set(['operationProduct','operationCollection','operationColour']);
  const PREVIEW_TYPING_IDS=new Set(['operationProduct','operationCollection','operationColour','operationQty','operationInches','operationLocation','operationLot','operationRoll','operationManufacturerRoll','operationNotes']);

  const byId=id=>document.getElementById(id);
  const visible=id=>{const el=byId(id);return !!el&&!el.classList.contains('hidden')};
  const formEntryVisible=()=>[...FORM_IDS].some(visible);
  const activeControl=()=>{
    const el=document.activeElement;
    if(!el)return null;
    const tag=String(el.tagName||'').toUpperCase();
    return ['INPUT','TEXTAREA','SELECT'].includes(tag)||el.isContentEditable?el:null;
  };
  const operationTyping=(ids=PREVIEW_TYPING_IDS)=>{
    if(!visible('operationEditor'))return false;
    const el=activeControl();
    return !!el&&ids.has(el.id);
  };
  const userTypingNow=()=>{
    const el=activeControl();
    return !!el&&formEntryVisible();
  };

  function showVersion(){
    const hv=byId('headerVersion');if(hv)hv.textContent='V'+VERSION;
    document.documentElement.setAttribute('data-runlu-build',BUILD);
    document.documentElement.setAttribute('data-runlu-fast-entry','on');
  }

  function defer(name,fn,ctx,args,delay){
    const old=timers.get(name);if(old)clearTimeout(old);
    const timer=setTimeout(()=>{
      timers.delete(name);
      try{fn.apply(ctx,args)}catch(e){console.warn('[Build140] deferred '+name,e?.message||e)}
    },delay);
    timers.set(name,timer);
  }

  function wrapDebounced(name,ids,delay){
    const current=window[name];
    if(typeof current!=='function'||current.__build140FastEntry)return false;
    const wrapped=function(){
      if(!operationTyping(ids))return current.apply(this,arguments);
      defer(name,current,this,Array.from(arguments),delay);
      return true;
    };
    wrapped.__build140FastEntry=true;
    wrapped.__original=current;
    window[name]=wrapped;
    return true;
  }

  function installDraftDebounce(){
    const current=window.scheduleOperationDraft;
    const saveNow=window.saveOperationDraftNow;
    if(typeof current!=='function'||typeof saveNow!=='function'||current.__build140FastEntry)return false;
    const wrapped=function(){
      if(!visible('operationEditor')||!userTypingNow())return current.apply(this,arguments);
      if(draftTimer)clearTimeout(draftTimer);
      const state=byId('operationDraftState');if(state)state.textContent='Saving draft…';
      draftTimer=setTimeout(()=>{
        draftTimer=null;
        try{saveNow()}catch(e){console.warn('[Build140] draft save',e?.message||e)}
      },700);
      return true;
    };
    wrapped.__build140FastEntry=true;
    wrapped.__original=current;
    window.scheduleOperationDraft=wrapped;
    return true;
  }

  function installProtectedInputGuard(){
    const current=window.protectedInputActive;
    if(typeof current==='function'&&current.__build140FastEntry)return false;
    const wrapped=function(){
      try{if(typeof current==='function'&&current.apply(this,arguments))return true}catch(_){ }
      return userTypingNow();
    };
    wrapped.__build140FastEntry=true;
    wrapped.__original=current;
    window.protectedInputActive=wrapped;
    return true;
  }

  function installHiddenCarpetRenderGuard(){
    const current=window.renderCarpetInventory;
    if(typeof current!=='function'||current.__build140FastEntry)return false;
    const wrapped=function(){
      // Several legacy installer loops call this even while another page is open.
      // Rendering a full carpet workbench every 500 ms while the iOS keyboard is active
      // creates visible input lag. Hidden-page renders have no user-visible benefit.
      const page=byId('carpetInventory');
      if(page&&page.classList.contains('hidden'))return false;
      if(userTypingNow()&&!visible('carpetInventory'))return false;
      return current.apply(this,arguments);
    };
    wrapped.__build140FastEntry=true;
    wrapped.__original=current;
    window.renderCarpetInventory=wrapped;
    return true;
  }

  function trimDatalist(id,max){
    const list=byId(id);if(!list)return 0;
    const options=Array.from(list.querySelectorAll('option'));
    if(options.length<=max)return options.length;
    const seen=new Set(),keep=[];
    for(const o of options){
      const v=String(o.value||'').trim();if(!v)continue;
      const k=v.toUpperCase();if(seen.has(k))continue;seen.add(k);keep.push(v);
      if(keep.length>=max)break;
    }
    list.innerHTML=keep.map(v=>`<option value="${String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}"></option>`).join('');
    return keep.length;
  }

  function trimOperationMemory(){
    // iOS native datalist search becomes noticeably heavier once these lists grow into
    // hundreds of historical values. Product Search remains the exact-linking control;
    // free-text memory lists are intentionally kept compact for fast keyboard response.
    trimDatalist('operation_collection_memory',100);
    trimDatalist('operation_roll_memory',120);
    trimDatalist('operation_customer_memory',80);
    trimDatalist('operation_supplier_memory',80);
    trimDatalist('operation_sales_memory',60);
    trimDatalist('operation_operator_memory',40);
  }

  function installMemoryTrim(){
    const current=window.refreshOperationMemory;
    if(typeof current!=='function'||current.__build140FastEntry)return false;
    const wrapped=function(){
      const out=current.apply(this,arguments);
      trimOperationMemory();
      return out;
    };
    wrapped.__build140FastEntry=true;
    wrapped.__original=current;
    window.refreshOperationMemory=wrapped;
    trimOperationMemory();
    return true;
  }

  function install(){
    showVersion();
    wrapDebounced('operationProductChanged',new Set(['operationProduct']),120);
    wrapDebounced('updateOperationForm',STRUCTURE_TYPING_IDS,180);
    wrapDebounced('updateOperationCalculationPreview',PREVIEW_TYPING_IDS,180);
    installDraftDebounce();
    installProtectedInputGuard();
    installHiddenCarpetRenderGuard();
    installMemoryTrim();
    trimOperationMemory();
  }

  function boot(){
    install();
    // Reassert only during the short startup race among historical compatibility layers.
    // Unlike older installers, this ends after five seconds and never continuously rerenders UI.
    let n=0;const timer=setInterval(()=>{install();if(++n>=20)clearInterval(timer)},250);
    window.addEventListener('pageshow',()=>setTimeout(install,40));
    window.addEventListener('focus',()=>setTimeout(install,40));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(install,40)});
    document.addEventListener('focusin',()=>{if(formEntryVisible())document.documentElement.setAttribute('data-runlu-user-typing','1')},true);
    document.addEventListener('focusout',()=>setTimeout(()=>{if(!activeControl())document.documentElement.removeAttribute('data-runlu-user-typing')},250),true);
  }

  window.RUNLUFastEntryBuild140={version:VERSION,build:BUILD,install,userTypingNow,trimOperationMemory};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
