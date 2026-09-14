// RUNLU Warehouse OS Build123 · quiet header cloud status.
// Keep exact Cloud Master queue counts in Settings; the compact header shows only
// a semantic state so large maintenance backlogs do not dominate the mobile UI.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD123_CLOUD_STATUS_UX__) return;
  window.__RUNLU_BUILD123_CLOUD_STATUS_UX__ = true;

  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const LAST_ERROR='runlu_cloud_master_last_error_v680';
  let observer=null;
  let painting=false;

  const arrayValue=key=>{
    try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}
    catch{return []}
  };

  function desiredState(){
    const queue=arrayValue(QUEUE),conflicts=arrayValue(CONFLICTS),error=String(localStorage.getItem(LAST_ERROR)||'').trim();
    if(navigator.onLine===false)return {
      cls:'cloudPill offline',text:'Offline',
      title:`Offline. ${queue.length?`${queue.length} change${queue.length===1?'':'s'} safely queued on this device.`:'No queued cloud changes.'}`,
      queue:queue.length,conflicts:conflicts.length
    };
    if(conflicts.length)return {
      cls:'cloudPill offline',text:'Review',
      title:`${conflicts.length} cloud record conflict${conflicts.length===1?'':'s'} need review in Settings.`,
      queue:queue.length,conflicts:conflicts.length
    };
    if(error&&queue.length)return {
      cls:'cloudPill offline',text:'Cloud issue',
      title:`Cloud sync needs attention. ${queue.length} queued change${queue.length===1?'':'s'} remain; details are in Settings.`,
      queue:queue.length,conflicts:0
    };
    if(queue.length)return {
      cls:'cloudPill syncing',text:'Syncing…',
      title:`${queue.length} queued cloud change${queue.length===1?'':'s'}. Exact queue details are available in Settings.`,
      queue:queue.length,conflicts:0
    };
    if(error)return {
      cls:'cloudPill offline',text:'Cloud issue',
      title:'Cloud sync needs attention. Details are available in Settings.',
      queue:0,conflicts:0
    };
    return {cls:'cloudPill online',text:'Cloud ✓',title:'Warehouse Cloud is synchronized.',queue:0,conflicts:0};
  }

  function paint(){
    const el=document.getElementById('headerCloudPill');
    if(!el||painting)return;
    painting=true;
    try{
      const s=desiredState();
      if(el.className!==s.cls)el.className=s.cls;
      if(el.textContent!==s.text)el.textContent=s.text;
      el.title=s.title;
      el.setAttribute('aria-label',s.title);
      el.dataset.queueCount=String(s.queue);
      el.dataset.conflictCount=String(s.conflicts);
    }finally{painting=false}
  }

  function wrapLegacyPainter(){
    const current=window.updateHeaderCloudPill;
    if(typeof current!=='function'||current.__build123)return;
    const wrapped=function(...args){
      const out=current.apply(this,args);
      queueMicrotask(paint);
      return out;
    };
    wrapped.__build123=true;
    wrapped.__original=current;
    window.updateHeaderCloudPill=wrapped;
  }

  function watchPill(){
    const el=document.getElementById('headerCloudPill');
    if(!el)return;
    if(observer)observer.disconnect();
    observer=new MutationObserver(()=>queueMicrotask(paint));
    observer.observe(el,{childList:true,characterData:true,subtree:true});
  }

  function install(){wrapLegacyPainter();paint();watchPill()}
  function boot(){
    install();
    setTimeout(install,250);
    setTimeout(install,900);
    setInterval(paint,1500);
    window.addEventListener('online',paint);
    window.addEventListener('offline',paint);
    window.addEventListener('pageshow',install);
    window.addEventListener('focus',paint);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')paint()});
  }

  window.RUNLUCloudStatusUXBuild123={paint,desiredState,version:'123'};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
