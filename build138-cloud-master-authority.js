// RUNLU Warehouse OS V6.12.43 Build138 — Cloud Master Authority
// Retires the obsolete whole-dataset conflict engine. Supabase Cloud Master remains
// the sole synchronization authority; local storage is only an offline/cache layer.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD138_CLOUD_MASTER_AUTHORITY__) return;
  window.__RUNLU_BUILD138_CLOUD_MASTER_AUTHORITY__ = true;

  const VERSION='6.12.43', BUILD='138';
  const LEGACY_CONFLICT='runlu_cloud_dataset_conflicts_v659_';
  const LEGACY_DIRTY='runlu_cloud_dirty_keys_v5544';
  const LEGACY_ERROR='runlu_cloud_last_error_v5544';
  const MASTER_ERROR='runlu_cloud_master_last_error_v680';
  const MANAGED=new Set([
    'runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20','runlu_receiving_v50',
    'runlu_tasks_v50','runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52',
    'runlu_cutting_log_v52','runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55',
    'runlu_settings_v20','runlu_cycle_counts_v54','runlu_scan_dictionary_v55','runlu_scan_templates_v55'
  ]);

  const readArray=key=>{
    try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}
    catch{return []}
  };
  const writeArray=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  function clearLegacyDatasetState(){
    // Only retire conflict/dirty metadata for datasets now owned by Cloud Master.
    // Business records themselves are never changed here.
    const dirty=readArray(LEGACY_DIRTY).filter(k=>!MANAGED.has(String(k)));
    const conflicts=readArray(LEGACY_CONFLICT).filter(k=>!MANAGED.has(String(k)));
    writeArray(LEGACY_DIRTY,dirty);
    writeArray(LEGACY_CONFLICT,conflicts);
    localStorage.removeItem(LEGACY_ERROR);
  }

  function hideLegacyConflictUI(){
    const details=document.getElementById('cloudSyncDetails');
    if(details)details.style.display='none';
    const actions=document.getElementById('cloudConflictActions');
    if(actions){actions.classList.add('hidden');actions.style.display='none'}
    for(const id of ['build069MergeNotice','build065MergeNotice','build066MergeNotice']){
      const el=document.getElementById(id);if(el)el.style.display='none';
    }
    const settings=document.getElementById('settings')||document;
    const nodes=settings.querySelectorAll?.('div,span,p,small')||[];
    for(const el of nodes){
      const t=String(el.textContent||'').trim();
      if(/Conflict\s*[—-]\s*changed on this device and another device/i.test(t) ||
         (/Keep Cloud for Conflict Only/i.test(t)&&/Full Upload\/Download/i.test(t))){
        el.style.display='none';
      }
    }
  }

  function refreshCloudUI(){
    clearLegacyDatasetState();
    hideLegacyConflictUI();
    try{if(typeof window.renderCloudStatus==='function')window.renderCloudStatus()}catch(_){ }
    // renderCloudStatus is legacy and can recreate its details visually; hide them again.
    hideLegacyConflictUI();
    try{if(window.RUNLUCloudStatusUXBuild123?.paint)window.RUNLUCloudStatusUXBuild123.paint()}catch(_){ }
  }

  async function masterSync(options={}){
    clearLegacyDatasetState();
    const silent=!!options.silent;
    const fn=window.runluCloudMasterSync;
    if(typeof fn!=='function'){
      if(!silent)alert('Cloud Master is still loading. Please try Sync Now again in a moment.');
      return false;
    }
    const ok=await fn({silent});
    clearLegacyDatasetState();
    refreshCloudUI();
    return !!ok;
  }

  async function masterAutoRefresh(force=false){
    if(navigator.onLine===false)return false;
    try{if(typeof window.protectedInputActive==='function'&&window.protectedInputActive()&&!force)return false}catch(_){ }
    return masterSync({silent:true});
  }

  function replaceLegacyPolling(){
    try{
      if(typeof cloudPollTimer!=='undefined'&&cloudPollTimer){clearInterval(cloudPollTimer);cloudPollTimer=null}
    }catch(_){ }
    const start=function(){
      try{if(typeof cloudPollTimer!=='undefined'&&cloudPollTimer)clearInterval(cloudPollTimer)}catch(_){ }
      const timer=setInterval(()=>masterAutoRefresh(false),15000);
      try{cloudPollTimer=timer}catch(_){window.__RUNLU_BUILD138_POLL_TIMER__=timer}
      return timer;
    };
    try{cloudAutoRefresh=masterAutoRefresh}catch(_){ }
    try{cloudSmartSync=async silent=>masterSync({silent:!!silent})}catch(_){ }
    try{startCloudPolling=start}catch(_){ }
    window.cloudAutoRefresh=masterAutoRefresh;
    window.cloudSmartSync=async silent=>masterSync({silent:!!silent});
    window.startCloudPolling=start;
    start();
  }

  function installSyncButtonAuthority(){
    // Build072 already owns cloudSyncNow. Keep reinforcing the same record-level path
    // in case an older hotfix tries to restore the retired dataset-level function.
    const fn=async(...args)=>masterSync({silent:args[0]===true});
    fn.__build138=true;
    window.cloudSyncNow=fn;
  }

  function showVersion(){
    const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;
    document.documentElement.setAttribute('data-runlu-build',BUILD);
  }

  function install(){
    showVersion();
    clearLegacyDatasetState();
    replaceLegacyPolling();
    installSyncButtonAuthority();
    refreshCloudUI();
  }

  function boot(){
    install();
    // Older layers retry their installers for a short time. Reassert authority while
    // startup settles, then leave only the normal 15-second Cloud Master refresh.
    let n=0;const settle=setInterval(()=>{installSyncButtonAuthority();clearLegacyDatasetState();hideLegacyConflictUI();showVersion();if(++n>=50)clearInterval(settle)},200);
    setTimeout(()=>masterAutoRefresh(true),900);
    window.addEventListener('online',()=>masterAutoRefresh(true));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')masterAutoRefresh(false)});
  }

  window.RUNLUCloudMasterAuthorityBuild138={
    version:VERSION,build:BUILD,clearLegacyDatasetState,hideLegacyConflictUI,masterSync,masterAutoRefresh
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
