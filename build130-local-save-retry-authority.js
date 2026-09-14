// RUNLU Warehouse OS V6.12.35 Build130 · local-save retry authority.
// Fixes the Build072/Build128 storage path that could stop before the app's safe quota cleanup ran.
// A managed record is never queued to Warehouse Cloud unless its local cache write succeeds first.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD130_LOCAL_SAVE_RETRY_AUTHORITY__)return;
  window.__RUNLU_BUILD130_LOCAL_SAVE_RETRY_AUTHORITY__=true;

  const VERSION='6.12.35', BUILD='130';
  const STORAGE_ALERTS=new Set([
    'This device could not save the local cache. No cloud overwrite was attempted.',
    'Carpet cache could not be saved. No cloud record was changed.'
  ]);
  let installed=false;

  function chainHas(flag){
    let fn=window.save,depth=0;
    while(typeof fn==='function'&&depth++<80){if(fn[flag])return true;fn=fn.__original}
    return false;
  }
  function prerequisitesReady(){
    return typeof window.save==='function'&&chainHas('__build072')&&chainHas('__build122')&&chainHas('__build128CarpetIdentityAuthority');
  }
  function cleanupStorage(){
    let reclaimed=0;
    try{const r=typeof window.pruneLocalApplicationCache==='function'?window.pruneLocalApplicationCache(true):null;reclaimed+=Number(r?.reclaimedBytes||0)||0}catch(e){console.warn('[Build130] normal cache cleanup skipped',e)}
    try{const r=typeof window.aggressiveSafeStorageCleanup==='function'?window.aggressiveSafeStorageCleanup():null;reclaimed+=Number(r?.reclaimedBytes||0)||0}catch(e){console.warn('[Build130] deep cache cleanup skipped',e)}
    return reclaimed;
  }
  function invokeSuppressingStorageAlert(delegate,ctx,args){
    const realAlert=window.alert;let captured='';
    window.alert=function(message){
      const text=String(message??'');
      if(STORAGE_ALERTS.has(text)){captured=text;return}
      return realAlert.apply(window,arguments);
    };
    try{return {value:delegate.apply(ctx,args),captured}}
    finally{window.alert=realAlert}
  }
  function install(){
    const current=window.save;
    if(typeof current!=='function')return false;
    if(current.__build130){installed=true;return true}
    if(!prerequisitesReady())return false;
    const delegate=current;
    const wrapped=function(){
      const first=invokeSuppressingStorageAlert(delegate,this,arguments);
      if(first.value!==false||!first.captured)return first.value;

      const reclaimed=cleanupStorage();
      const second=invokeSuppressingStorageAlert(delegate,this,arguments);
      if(second.value!==false||!second.captured){
        if(second.value!==false)console.info(`[Build130] local save recovered after safe cleanup${reclaimed?` (${Math.round(reclaimed/1024)} KB reclaimed)`:''}.`);
        return second.value;
      }

      const amount=reclaimed?` Safe cleanup recovered ${(reclaimed/1024/1024).toFixed(1)} MB, but more room is still required.`:'';
      window.alert('This device still could not save the local cache after safe cleanup.'+amount+' No cloud overwrite was attempted. The current screen was kept unchanged.');
      return false;
    };
    // The delegate already contains these protection layers. Advertising the flags on
    // the authority wrapper stops legacy installers from stacking another wrapper above it.
    wrapped.__build130=true;
    wrapped.__build072=true;
    wrapped.__build122=true;
    wrapped.__build072CarpetRoll=true;
    wrapped.__build124SharedRollIdentity=true;
    wrapped.__build128CarpetIdentityAuthority=true;
    wrapped.__original=delegate;
    window.save=wrapped;
    installed=true;
    document.documentElement.setAttribute('data-runlu-local-save-retry-authority',BUILD);
    return true;
  }
  function boot(){
    let tries=0;
    const attempt=()=>{if(install()||++tries>300)return true;return false};
    if(!attempt()){
      const timer=setInterval(()=>{if(attempt())clearInterval(timer)},100);
    }
    window.addEventListener('pageshow',()=>setTimeout(install,40));
    window.addEventListener('focus',()=>setTimeout(install,40));
  }

  window.RUNLULocalSaveRetryBuild130={version:BUILD,appVersion:VERSION,install,cleanupStorage,chainHas};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
