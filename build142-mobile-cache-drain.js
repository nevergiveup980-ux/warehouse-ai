// RUNLU Warehouse OS V6.12.47 Build142 · Mobile Cache Drain
// Finishes the Build141 quota recovery seen on iPhone: blocked Cloud Master conflicts had
// multiple full payload copies in localStorage, and Build072 could reinstall its direct-save
// wrapper after Build141, bypassing the storage-headroom guard. This layer compacts only
// redundant sync metadata and pins the guarded save wrapper without touching business data.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD142_MOBILE_CACHE_DRAIN__)return;
  window.__RUNLU_BUILD142_MOBILE_CACHE_DRAIN__=true;

  const VERSION='6.12.47',BUILD='142';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const LAST_ERROR='runlu_cloud_master_last_error_v680';
  const SOFT_BYTES=2.85*1024*1024;
  const MANAGED=new Set([
    'runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20','runlu_receiving_v50',
    'runlu_tasks_v50','runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52',
    'runlu_cutting_log_v52','runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55',
    'runlu_settings_v20'
  ]);

  const parse=(s,fallback)=>{try{const v=JSON.parse(s||'');return v??fallback}catch{return fallback}};
  const readArray=k=>{const v=parse(localStorage.getItem(k),'__bad__');return Array.isArray(v)?v:[]};
  function bytes(){let n=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||'',v=localStorage.getItem(k)||'';n+=(k.length+v.length)*2}}catch(_){}return n}
  function safeReplaceSmaller(k,v){
    const next=JSON.stringify(v),prev=localStorage.getItem(k)||'';
    if(prev&&next.length>prev.length)return false;
    try{localStorage.setItem(k,next);return true}catch(_){return false}
  }
  function summaryPayload(p){
    p=p&&typeof p==='object'?p:{};
    const out={};
    ['name','collection','product','color','colour','location','poNumber','po','quantity','unit'].forEach(k=>{
      if(p[k]!==undefined&&p[k]!==null&&String(p[k]).trim()!=='')out[k]=p[k];
    });
    return out;
  }
  function compactServer(r){
    if(!r||typeof r!=='object')return r||null;
    const out={};
    ['version','deleted_at','updated_at','origin','record_id','dataset_key'].forEach(k=>{if(r[k]!==undefined)out[k]=r[k]});
    if(r.payload&&typeof r.payload==='object')out.payload=summaryPayload(r.payload);
    return out;
  }

  function compactBlockedMetadata(){
    const before=bytes(),q=readArray(QUEUE),cs=readArray(CONFLICTS);
    let compactedQueue=0,compactedConflicts=0;
    const nextQ=q.map(m=>{
      if(!m||typeof m!=='object'||!m.blocked||!m.serverRecord)return m;
      const slim=compactServer(m.serverRecord);
      if(JSON.stringify(slim).length<JSON.stringify(m.serverRecord).length){compactedQueue++;return {...m,serverRecord:slim}}
      return m;
    });
    const qById=new Map(nextQ.map(m=>[String(m?.id||''),m]));
    const nextC=cs.map(c=>{
      if(!c||typeof c!=='object')return c;
      const m=qById.get(String(c.queueId||''));
      const device=summaryPayload(c.devicePayload??m?.payload);
      const server=compactServer(c.serverRecord??m?.serverRecord);
      const next={...c,devicePayload:device,serverRecord:server};
      if(JSON.stringify(next).length<JSON.stringify(c).length)compactedConflicts++;
      return next;
    });
    const qOk=safeReplaceSmaller(QUEUE,nextQ),cOk=safeReplaceSmaller(CONFLICTS,nextC);
    return {beforeBytes:before,afterBytes:bytes(),compactedQueue,compactedConflicts,qOk,cOk};
  }

  function reclaimIfNeeded(){
    let report=compactBlockedMetadata();
    if(bytes()>SOFT_BYTES){
      try{window.RUNLUCloudStorageRecoveryBuild141?.reclaimDisposable?.()}catch(_){}
      report=compactBlockedMetadata();
    }
    const err=String(localStorage.getItem(LAST_ERROR)||'');
    if(bytes()<SOFT_BYTES&&/quota|exceed|local cache|storage/i.test(err))try{localStorage.removeItem(LAST_ERROR)}catch(_){}
    return {...report,storageBytes:bytes()};
  }

  function installPinnedSaveGuard(){
    const current=window.save;if(typeof current!=='function')return false;
    if(current.__build142PinnedSaveGuard)return true;
    const wrapped=function(k,v){
      if(MANAGED.has(String(k))){
        reclaimIfNeeded();
        try{window.RUNLUCloudStorageRecoveryBuild141?.ensureHeadroom?.()}catch(_){}
      }
      return current.apply(this,arguments);
    };
    // Build072's 200 ms installer only leaves wrappers carrying __build072 alone. Marking
    // this final guard as Build072-compatible prevents the older direct writer from being
    // placed back outside the recovery guard. Build141 likewise sees its marker and stops.
    wrapped.__build072=true;
    wrapped.__build141StorageHeadroom=true;
    wrapped.__build142PinnedSaveGuard=true;
    wrapped.__original=current;
    window.save=wrapped;
    return true;
  }

  function paint(){
    const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;
    document.documentElement.setAttribute('data-runlu-build',BUILD);
    document.documentElement.setAttribute('data-runlu-mobile-cache-drain',BUILD);
  }

  function boot(){
    reclaimIfNeeded();installPinnedSaveGuard();paint();
    let n=0;const t=setInterval(()=>{
      installPinnedSaveGuard();
      // During the first minute Build072 still runs its compatibility installer. Re-assert
      // the pinned marker and compact only redundant blocked metadata; no business record is changed.
      if(n%10===0)reclaimIfNeeded();
      paint();if(++n>=320)clearInterval(t);
    },200);
    setTimeout(async()=>{
      reclaimIfNeeded();
      try{
        const active=typeof window.protectedInputActive==='function'&&window.protectedInputActive();
        if(!active&&typeof window.runluCloudMasterSync==='function')await window.runluCloudMasterSync({silent:true});
      }catch(_){}
      reclaimIfNeeded();paint();
    },1200);
  }

  window.RUNLUMobileCacheDrainBuild142={version:VERSION,build:BUILD,bytes,summaryPayload,compactServer,compactBlockedMetadata,reclaimIfNeeded,installPinnedSaveGuard};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
