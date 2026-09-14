// RUNLU Warehouse OS V6.12.37 Build132 · navigation quota guard.
// Navigation and access authorization are session-based and must not be blocked by a full localStorage cache.
// Only the disposable administrator-role marker is allowed to fail quietly; business-data writes still fail normally.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD132_NAVIGATION_QUOTA_GUARD__)return;
  window.__RUNLU_BUILD132_NAVIGATION_QUOTA_GUARD__=true;

  const VERSION='6.12.37', BUILD='132';
  const ROLE_KEY='runlu_access_role_v620';
  let roleGuardInstalled=false,showPageGuardInstalled=false;

  function isQuotaError(err){
    return !!(err&&(err.name==='QuotaExceededError'||err.name==='NS_ERROR_DOM_QUOTA_REACHED'||err.code===22||err.code===1014||/quota|storage.*full|exceeded/i.test(String(err.message||err))));
  }

  function installRoleMarkerGuard(){
    let storage,proto,current;
    try{storage=window.localStorage;proto=Object.getPrototypeOf(storage);current=proto&&proto.setItem}catch(_){return false}
    if(typeof current!=='function')return false;
    if(current.__build132RoleMarkerGuard){roleGuardInstalled=true;return true}
    const wrapped=function(key,value){
      try{return current.call(this,key,value)}
      catch(err){
        if(this===storage&&String(key)===ROLE_KEY&&isQuotaError(err)){
          console.warn('[Build132] local administrator role marker could not be refreshed because browser storage is full. Session authorization remains active; navigation continues.');
          try{window.sessionStorage?.setItem('runlu_build132_role_marker_skipped','1')}catch(_){ }
          return undefined;
        }
        throw err;
      }
    };
    wrapped.__build132RoleMarkerGuard=true;wrapped.__original=current;
    try{proto.setItem=wrapped}catch(_){return false}
    roleGuardInstalled=proto.setItem===wrapped||!!proto.setItem?.__build132RoleMarkerGuard;
    return roleGuardInstalled;
  }

  function fallbackNavigate(id){
    const requested=String(id||'home'),target=document.getElementById(requested)||document.getElementById('home');
    if(!target)return false;
    const actual=target.id||requested;
    try{document.querySelectorAll('.page').forEach(x=>x.classList.add('hidden'));target.classList.remove('hidden')}catch(_){ }
    try{document.body?.classList?.toggle('formEntry',['operationEditor','orderEditor','specialOrderEditor','receivingEditor','editor','carpetEditor','scan'].includes(actual))}catch(_){ }
    const renderers={
      home:'renderDashboard',carpetInventory:'renderCarpetInventory',products:'renderProducts',inventory:'renderInventory',
      generalTagCenter:'renderGeneralTags',warehouseMap:'renderMap',operations:'renderOperations',ordersHub:'renderOrders',
      specialOrders:'renderSpecialOrders',receiving:'renderReceiving',settings:'renderSettings'
    };
    const fn=renderers[actual]&&window[renderers[actual]];
    try{if(typeof fn==='function')fn()}catch(e){console.warn('[Build132] fallback render isolated',e)}
    try{window.scrollTo?.(0,0)}catch(_){ }
    return true;
  }

  function installShowPageGuard(){
    const current=window.showPage;
    if(typeof current!=='function')return false;
    if(current.__build132NavigationGuard){showPageGuardInstalled=true;return true}
    const wrapped=function(id,...rest){
      try{return current.call(this,id,...rest)}
      catch(err){
        if(!isQuotaError(err))throw err;
        console.warn('[Build132] navigation recovered from browser-storage quota pressure.',err);
        return fallbackNavigate(id);
      }
    };
    wrapped.__build132NavigationGuard=true;wrapped.__original=current;
    window.showPage=wrapped;showPageGuardInstalled=true;return true;
  }

  function install(){
    installRoleMarkerGuard();
    installShowPageGuard();
    if(roleGuardInstalled||showPageGuardInstalled)document.documentElement?.setAttribute('data-runlu-navigation-quota-guard',BUILD);
    return roleGuardInstalled&&showPageGuardInstalled;
  }

  function boot(){
    install();
    let n=0;const timer=setInterval(()=>{install();if(++n>120||roleGuardInstalled&&showPageGuardInstalled)clearInterval(timer)},100);
    window.addEventListener?.('pageshow',()=>setTimeout(install,30));
    window.addEventListener?.('focus',()=>setTimeout(install,30));
  }

  window.RUNLUNavigationQuotaBuild132={version:BUILD,appVersion:VERSION,install,isQuotaError,fallbackNavigate,get ready(){return roleGuardInstalled&&showPageGuardInstalled}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
