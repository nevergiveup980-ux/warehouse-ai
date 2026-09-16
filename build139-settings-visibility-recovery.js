// RUNLU Warehouse OS V6.12.44 Build139 — Settings Visibility Recovery
// Recovery guard for the Build138 Settings blank-page regression. It never edits
// warehouse business data; it only restores the primary Settings card if an older
// cached UI layer hid it by inline style.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD139_SETTINGS_VISIBILITY_RECOVERY__)return;
  window.__RUNLU_BUILD139_SETTINGS_VISIBILITY_RECOVERY__=true;

  const VERSION='6.12.44',BUILD='139';
  let observer=null;

  function mainSettingsCard(){
    const settings=document.getElementById('settings');
    if(!settings)return null;
    return Array.from(settings.children||[]).find(el=>el?.classList?.contains?.('card'))||null;
  }

  function recoverSettings(){
    const card=mainSettingsCard();
    if(card?.style?.display==='none'){
      if(typeof card.style.removeProperty==='function')card.style.removeProperty('display');
      else card.style.display='';
    }
    return !!card;
  }

  function showVersion(){
    const hv=document.getElementById('headerVersion');
    if(hv)hv.textContent='V'+VERSION;
    document.documentElement?.setAttribute?.('data-runlu-build',BUILD);
  }

  function installObserver(){
    const card=mainSettingsCard();
    if(!card||typeof MutationObserver!=='function')return;
    try{observer?.disconnect?.()}catch(_){ }
    observer=new MutationObserver(()=>{recoverSettings();showVersion()});
    observer.observe(card,{attributes:true,attributeFilter:['style']});
  }

  function install(){
    recoverSettings();
    showVersion();
    installObserver();
  }

  function boot(){
    install();
    // Keep the recovery guard active while older startup layers finish their delayed
    // installers. This is UI-only; no records, queues, conflicts or cloud errors change.
    let n=0;
    const settle=setInterval(()=>{recoverSettings();showVersion();if(++n>=60)clearInterval(settle)},200);
    window.addEventListener('pageshow',install);
    window.addEventListener('focus',()=>{recoverSettings();showVersion()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){recoverSettings();showVersion()}});
  }

  window.RUNLUSettingsVisibilityBuild139={version:VERSION,build:BUILD,recoverSettings,showVersion,mainSettingsCard};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
