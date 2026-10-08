// RUNLU V8 Build148 — carpet return save diagnostics, no inventory mutation.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD148_RETURN_SAVE_DIAGNOSTICS__)return;
  window.__RUNLU_BUILD148_RETURN_SAVE_DIAGNOSTICS__=true;
  const text=v=>String(v??'');
  const isReturn=r=>r&&['Cut Piece Return','Installer Return'].includes(r.type)&&r.inventoryMode==='Stock';
  function install(){
    const original=window.save;
    if(typeof original!=='function'||original.__runluBuild148)return false;
    const wrapped=function(key,rows){
      if(key!==window.CARPETDB)return original.apply(this,arguments);
      const before=localStorage.getItem(key),previous=Array.isArray(JSON.parse(before||'null'))?JSON.parse(before):[];
      const added=Array.isArray(rows)?rows.filter(r=>!previous.some(p=>text(p.roll)===text(r.roll)&&text(p.sourceOperationId)===text(r.sourceOperationId))):[];
      const result=original.apply(this,arguments);
      if(result!==false)return result;
      let bytes=0;try{bytes=new Blob([JSON.stringify(rows)]).size}catch{}
      const details={at:new Date().toISOString(),dataset:key,attemptedRows:Array.isArray(rows)?rows.length:null,previousRows:previous.length,attemptedBytes:bytes,addedRolls:added.slice(0,5).map(r=>({roll:r.roll,sourceOperationId:r.sourceOperationId})),storageLength:localStorage.length};
      try{sessionStorage.setItem('runlu_build148_carpet_save_failure',JSON.stringify(details))}catch{}
      document.documentElement.setAttribute('data-runlu-build148-carpet-save','failed');
      console.error('[Build148] Carpet Inventory local save returned false',details);
      alert('Carpet Inventory could not be saved locally. The return was not completed. Keep this draft open. Diagnostic: '+rows?.length+' rows / '+Math.round(bytes/1024)+' KB. See runlu_build148_carpet_save_failure in session storage. Do not retry until the local storage problem is resolved.');
      return false;
    };
    wrapped.__runluBuild148=true;wrapped.__original=original;
    window.save=wrapped;return true;
  }
  function boot(){
    if(!install()){let n=0;const t=setInterval(()=>{if(install()||++n>40)clearInterval(t)},100)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
