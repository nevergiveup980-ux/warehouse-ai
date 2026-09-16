// RUNLU Warehouse OS V6.12.46 Build141 · Cloud Storage Recovery
// Repairs the quota/conflict storm visible on mobile without choosing between genuinely
// different warehouse records. Equivalent record conflicts are auto-cleared, disposable
// browser caches are reclaimed first, and active form saves get storage headroom before
// Cloud Master's local cache wrapper runs.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD141_CLOUD_STORAGE_RECOVERY__)return;
  window.__RUNLU_BUILD141_CLOUD_STORAGE_RECOVERY__=true;

  const VERSION='6.12.46',BUILD='141';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const VERSIONS='runlu_cloud_master_record_versions_v680';
  const LAST_ERROR='runlu_cloud_master_last_error_v680';
  const SNAPSHOT='runlu_local_snapshots_v515';
  const SOFT_BYTES=3.15*1024*1024;
  const MANAGED=new Set([
    'runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20','runlu_receiving_v50',
    'runlu_tasks_v50','runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52',
    'runlu_cutting_log_v52','runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55',
    'runlu_settings_v20'
  ]);
  const VOLATILE=new Set([
    'updatedAt','updated_at','lastUpdatedAt','last_updated_at','updated','createdAt','created_at','created',
    'syncedAt','synced_at','cloudUpdatedAt','cloud_updated_at','cloudVersion','version','origin','deviceId','device_id'
  ]);

  const text=v=>String(v??'').trim();
  const parse=(s,fallback)=>{try{const v=JSON.parse(s||'');return v??fallback}catch{return fallback}};
  const readArray=k=>{const v=parse(localStorage.getItem(k),'__bad__');return Array.isArray(v)?v:[]};
  const readObject=k=>{const v=parse(localStorage.getItem(k),'__bad__');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}};

  function storageBytes(){
    let n=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||'',v=localStorage.getItem(k)||'';n+=(k.length+v.length)*2}}catch(_){}
    return n;
  }
  function stripVolatile(v){
    if(Array.isArray(v))return v.map(stripVolatile);
    if(!v||typeof v!=='object')return v;
    const out={};
    Object.keys(v).sort().forEach(k=>{if(!VOLATILE.has(k))out[k]=stripVolatile(v[k])});
    return out;
  }
  function equivalentPayload(a,b){
    if(a==null||b==null)return a==null&&b==null;
    try{return JSON.stringify(stripVolatile(a))===JSON.stringify(stripVolatile(b))}catch{return false}
  }
  function safeSetSmaller(key,value){
    const encoded=JSON.stringify(value),before=localStorage.getItem(key)||'';
    // This helper is only for metadata repair. Never replace a larger business dataset here.
    if(before&&encoded.length>before.length)return false;
    try{localStorage.setItem(key,encoded);return true}catch(_){return false}
  }
  function reclaimDisposable(){
    const before=storageBytes();
    try{if(typeof window.aggressiveSafeStorageCleanup==='function')window.aggressiveSafeStorageCleanup()}catch(_){}
    [SNAPSHOT,'runlu_v516_preupgrade_backup','runlu_startup_error_log','runlu_photo_temp_cache','runlu_scan_temp_cache'].forEach(k=>{
      try{if(localStorage.getItem(k)!==null)localStorage.removeItem(k)}catch(_){}
    });
    return Math.max(0,before-storageBytes());
  }
  function versionKey(dataset,id){return dataset+'::'+id}

  function compactCloudState(){
    const beforeBytes=storageBytes();
    const queue=readArray(QUEUE),conflicts=readArray(CONFLICTS),versions=readObject(VERSIONS);
    const qById=new Map(queue.map(x=>[String(x?.id||''),x]));
    const removeQueueIds=new Set(),keepConflicts=[];
    let equivalentResolved=0,staleConflictRemoved=0;

    for(const c of conflicts){
      const qid=String(c?.queueId||''),m=qById.get(qid);
      if(!qid||!m){staleConflictRemoved++;continue}
      const server=c?.serverRecord||m?.serverRecord||null;
      const serverPayload=server?.payload;
      const devicePayload=c?.devicePayload??m?.payload;
      const sameDelete=m?.op==='delete'&&!!server?.deleted_at;
      const sameUpsert=m?.op!=='delete'&&serverPayload!=null&&equivalentPayload(devicePayload,serverPayload);
      if(sameDelete||sameUpsert){
        removeQueueIds.add(qid);equivalentResolved++;
        const sv=Number(server?.version||0);
        if(Number.isFinite(sv)&&sv>0)versions[versionKey(m.datasetKey,m.recordId)]=sv;
      }else keepConflicts.push(c);
    }

    // Remove exact duplicate queued mutations that carry the same current payload. This is
    // sync metadata only; genuine differing versions remain separate and reviewable.
    const seen=new Map(),dedupeIds=new Set();
    for(let i=queue.length-1;i>=0;i--){
      const m=queue[i];if(!m||removeQueueIds.has(String(m.id||'')))continue;
      const key=[m.datasetKey,m.recordId,m.op,JSON.stringify(stripVolatile(m.payload))].join('|');
      if(seen.has(key))dedupeIds.add(String(m.id||''));else seen.set(key,String(m.id||''));
    }
    const nextQueue=queue.filter(m=>!removeQueueIds.has(String(m?.id||''))&&!dedupeIds.has(String(m?.id||'')));
    const nextConflicts=keepConflicts.filter(c=>!dedupeIds.has(String(c?.queueId||'')));

    // Queue/conflict strings can be enormous. Replacing them with smaller strings is safe
    // even under quota pressure and frees room before we touch the versions map.
    const queueWritten=safeSetSmaller(QUEUE,nextQueue);
    const conflictWritten=safeSetSmaller(CONFLICTS,nextConflicts);
    if((equivalentResolved||staleConflictRemoved||dedupeIds.size)&&queueWritten&&conflictWritten){
      try{localStorage.setItem(VERSIONS,JSON.stringify(versions))}catch(_){}
    }
    const afterBytes=storageBytes();
    const err=text(localStorage.getItem(LAST_ERROR));
    if(afterBytes<SOFT_BYTES&&/quota|exceed|local cache|storage/i.test(err))try{localStorage.removeItem(LAST_ERROR)}catch(_){}
    return {
      beforeQueue:queue.length,afterQueue:nextQueue.length,beforeConflicts:conflicts.length,afterConflicts:nextConflicts.length,
      equivalentResolved,staleConflictRemoved,deduped:dedupeIds.size,reclaimedBytes:Math.max(0,beforeBytes-afterBytes),
      queueWritten,conflictWritten,storageBytes:afterBytes
    };
  }

  function ensureHeadroom(){
    let freed=0;if(storageBytes()>SOFT_BYTES)freed+=reclaimDisposable();
    const result=compactCloudState();
    if(storageBytes()>SOFT_BYTES)freed+=reclaimDisposable();
    return {...result,freedBytes:freed,storageBytes:storageBytes()};
  }

  function installSaveHeadroom(){
    const current=window.save;if(typeof current!=='function')return false;
    if(current.__build141StorageHeadroom)return true;
    const wrapped=function(k,v){
      if(MANAGED.has(String(k))&&storageBytes()>SOFT_BYTES)ensureHeadroom();
      return current.apply(this,arguments);
    };
    wrapped.__build141StorageHeadroom=true;wrapped.__original=current;window.save=wrapped;return true;
  }

  function installSyncRecovery(){
    const current=window.runluCloudMasterSync;if(typeof current!=='function')return false;
    if(current.__build141StorageRecovery)return true;
    const wrapped=async function(options={}){
      ensureHeadroom();
      let ok=await current.apply(this,arguments);
      const after=compactCloudState();
      // A pass can discover an equivalent stale-version conflict while flushing. Remove
      // that no-op conflict and retry once so PAUSED can return to ACTIVE automatically.
      if(ok===false&&after.equivalentResolved>0&&!options?.__build141Retry){
        const retry={...(options||{}),__build141Retry:true,silent:true};
        ok=await current.call(this,retry);
        compactCloudState();
      }
      return ok;
    };
    wrapped.__build141StorageRecovery=true;wrapped.__original=current;window.runluCloudMasterSync=wrapped;return true;
  }

  function paintStatus(report){
    const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;
    document.documentElement.setAttribute('data-runlu-build',BUILD);
    document.documentElement.setAttribute('data-runlu-storage-recovery',BUILD);
    const box=document.getElementById('build072CloudMasterPanel');
    if(box&&report&&(report.equivalentResolved||report.staleConflictRemoved||report.deduped)){
      box.dataset.build141Recovered=String((report.equivalentResolved||0)+(report.staleConflictRemoved||0)+(report.deduped||0));
    }
  }

  function bootRecovery(){
    reclaimDisposable();
    const report=compactCloudState();
    installSaveHeadroom();installSyncRecovery();paintStatus(report);
    let tries=0;const settle=setInterval(()=>{
      installSaveHeadroom();installSyncRecovery();paintStatus();
      if(++tries>=40)clearInterval(settle);
    },200);
    // Let the legacy/cloud layers finish installing, then safely reactivate Cloud Master.
    setTimeout(async()=>{
      try{
        const active=typeof window.protectedInputActive==='function'&&window.protectedInputActive();
        if(!active&&typeof window.runluCloudMasterSync==='function')await window.runluCloudMasterSync({silent:true});
      }catch(_){}
      paintStatus(compactCloudState());
    },1400);
  }

  window.RUNLUCloudStorageRecoveryBuild141={version:VERSION,build:BUILD,storageBytes,stripVolatile,equivalentPayload,reclaimDisposable,compactCloudState,ensureHeadroom,installSaveHeadroom,installSyncRecovery};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootRecovery,{once:true});else setTimeout(bootRecovery,0);
})();
