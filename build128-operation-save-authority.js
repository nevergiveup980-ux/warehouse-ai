// RUNLU Warehouse OS V6.12.33 Build128 · Operation Save Authority.
// Carpet-receiving identity guards are intentionally strict, but their legacy global
// busy/checking lane must never make ordinary Work saves silently return false.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD128_OPERATION_SAVE_AUTHORITY__)return;
  window.__RUNLU_BUILD128_OPERATION_SAVE_AUTHORITY__=true;

  const BUILD='128';

  function findLayer(fn,marker){
    let cur=fn,depth=0;
    while(typeof cur==='function'&&depth++<32){
      if(cur[marker])return cur;
      cur=cur.__original;
    }
    return null;
  }
  function currentItems(){
    const out=[];
    try{if(typeof operationItemsDraft!=='undefined'&&Array.isArray(operationItemsDraft))out.push(...operationItemsDraft)}catch(_){}
    try{if(typeof window.operationItemFromForm==='function'){const x=window.operationItemFromForm(true);if(x)out.push(x)}}catch(_){}
    return out;
  }
  function hasCarpetReceiving(){
    const top=document.getElementById('operationType')?.value||'';
    const line=document.getElementById('operationLineType')?.value||'';
    if(top==='Carpet Receiving'||line==='Carpet Receiving')return true;
    return currentItems().some(x=>String(x?.type||top)==='Carpet Receiving');
  }
  function install(){
    const current=window.saveOperation;
    if(typeof current!=='function')return false;
    if(current.__build128OperationSaveAuthority)return true;

    const build125=findLayer(current,'__build125');
    if(!build125)return false;
    const build120=findLayer(build125.__original,'__build120')||findLayer(current,'__build120');
    const ordinarySave=(build120&&typeof build120.__original==='function')?build120.__original:build125.__original;
    if(typeof ordinarySave!=='function')return false;

    const wrapped=async function(){
      try{
        // Carpet Receiving keeps the approved Build125/126/127 safety path, including
        // live cloud identity checks and pending-CHC adoption.
        if(hasCarpetReceiving())return await build125.apply(this,arguments);
        // Every other Work type goes straight to the pre-Build120 save chain. Build120's
        // carpet-only global checking flag cannot block Order Picking, Shipping, Record
        // Only, Non-stock, Transfers, Returns, or general material work anymore.
        return await ordinarySave.apply(this,arguments);
      }catch(e){
        console.error('[Build128] operation save failed',e);
        try{alert('Work save stopped: '+(e?.message||e))}catch(_){}
        return false;
      }
    };
    wrapped.__build128OperationSaveAuthority=true;
    // Compatibility ownership bits: Build120 and Build127 must not wrap/replace this
    // authority after it is installed. Carpet work still delegates to Build125 above.
    wrapped.__build125=true;
    wrapped.__build120=true;
    wrapped.__build124SharedRollPolicy=true;
    wrapped.__build127GuardAuthority=true;
    wrapped.__original=current;
    wrapped.__carpetReceivingGuard=build125;
    wrapped.__ordinarySave=ordinarySave;
    window.saveOperation=wrapped;
    document.documentElement.setAttribute('data-runlu-operation-save-authority',BUILD);
    return true;
  }

  install();
  let tries=0;
  const timer=setInterval(()=>{if(install()&&++tries>40)clearInterval(timer);else if(++tries>160)clearInterval(timer)},100);
  window.addEventListener('pageshow',()=>setTimeout(install,40));
  window.addEventListener('focus',()=>setTimeout(install,40));

  window.RUNLUOperationSaveAuthorityBuild128={version:BUILD,findLayer,hasCarpetReceiving,install};
})();
