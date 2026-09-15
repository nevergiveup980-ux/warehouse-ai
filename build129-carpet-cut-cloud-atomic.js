// RUNLU Warehouse OS Build129 · Carpet Cut Cloud Atomic Commit
// Candidate only. Keeps the four cut-linked cloud datasets together and prevents
// two devices from silently overwriting the same stale carpet state.
(() => {
  const BUILD='129';
  const PENDING='runlu_carpet_cut_cloud_atomic_v129_pending';
  const LINKED=[
    window.CARPETDB||'runlu_carpet_inventory_v52',
    window.CUTDB||'runlu_cutting_log_v52',
    window.ODB||'runlu_orders_v20',
    window.EVENTDB||'runlu_event_history_v52'
  ];
  const baseApply=window.applySingleOperationImpact;
  const baseQueue=window.queueCloudSave;
  const baseCloudPut=window.cloudPutDataset;
  if(typeof baseApply!=='function'||typeof baseQueue!=='function'||typeof baseCloudPut!=='function'){
    console.warn('[Build129] Atomic carpet-cut cloud guard not installed: base cloud/runtime functions unavailable.');
    return;
  }

  const parse=(raw,fallback)=>{try{return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
  const clone=v=>parse(JSON.stringify(v),v);
  const clean=v=>String(v??'').trim();
  const isLinked=k=>LINKED.includes(k);
  const now=()=>new Date().toISOString();
  const pending=()=>parse(localStorage.getItem(PENDING),null);
  const executionKey=r=>window.RUNLU_CUT_TRANSACTION_GUARD_V128?.executionKey?.(r)||['CUT',String(r?.id??''),String(r?.carpetRecordId??''),clean(r?.roll).toUpperCase().replace(/[^A-Z0-9]/g,'')].join('|');
  const isActualCut=r=>r?.type==='Carpet Cutting'&&r?.inventoryMode==='Stock'&&r?.status==='Completed';
  const currentPayloads=()=>Object.fromEntries(LINKED.map(k=>[k,parse(localStorage.getItem(k),[])]));
  let chain=Promise.resolve();

  function setPending(r,phase='local_attempt'){
    const marker={version:1,build:BUILD,phase,executionKey:executionKey(r),operationId:r?.id??'',carpetRecordId:r?.carpetRecordId??'',roll:r?.roll||'',po:r?.po||'',updatedAt:now()};
    localStorage.setItem(PENDING,JSON.stringify(marker));return marker;
  }
  function clearPendingIf(key){
    const p=pending();if(!p||p.executionKey===key)localStorage.removeItem(PENDING);
  }
  function markLinkedDirty(){
    for(const k of LINKED){
      try{if(typeof window.markCloudDirty==='function')window.markCloudDirty(k)}catch(_){}
      try{localStorage.setItem(window.CLOUD_LOCAL_UPDATED_PREFIX?window.CLOUD_LOCAL_UPDATED_PREFIX+k:'runlu_cloud_local_updated_v583_'+k,now())}catch(_){}
    }
  }
  function conflictAll(message){
    try{if(typeof window.setCloudConflictKeys==='function')window.setCloudConflictKeys((window.cloudConflictKeys?.()||[]).concat(LINKED))}catch(_){}
    try{localStorage.setItem(window.CLOUD_LAST_ERROR_KEY||'runlu_cloud_last_error_v5544',message)}catch(_){}
    try{window.renderCloudStatus?.('Sync pending: '+message)}catch(_){}
  }
  function remoteChanged(meta,key,device){
    if(!meta)return false;
    const remote=typeof window.cloudRemoteMs==='function'?window.cloudRemoteMs(meta):new Date(meta.updated_at||0).getTime();
    const seen=typeof window.cloudSeenMs==='function'?window.cloudSeenMs(key):new Date(localStorage.getItem((window.CLOUD_DATASET_SEEN_PREFIX||'runlu_cloud_dataset_seen_v658_')+key)||0).getTime();
    return !!meta.device_id&&meta.device_id!==device&&remote>0&&(!seen||remote>seen+500);
  }
  async function preparedPayloads(snapshot,s){
    const out={};
    for(const k of LINKED){const v=snapshot[k]??[];out[k]=typeof window.cloudPreparePayload==='function'?await window.cloudPreparePayload(v,k,s):v}
    return out;
  }
  async function atomicPush(ticket){
    const enabledKey=window.CLOUD_ENABLED_KEY||'runlu_cloud_enabled_v54';
    if(localStorage.getItem(enabledKey)!=='1')throw new Error('Cloud is disabled; atomic carpet-cut sync is waiting.');
    const s=await window.cloudEnsureSession?.();if(!s)throw new Error('Cloud session is unavailable.');
    const device=window.cloudDeviceId?.()||'unknown-device',expected={};
    for(const k of LINKED){
      const meta=await window.cloudDatasetMeta(k,s);
      if(remoteChanged(meta,k,device))throw new Error('Atomic carpet-cut conflict: another device changed '+(window.cloudDatasetLabel?.(k)||k)+' after this device last saw it. No cloud dataset was overwritten.');
      expected[k]=meta?.updated_at||null;
    }
    const payloads=await preparedPayloads(ticket.payloads,s);
    const result=await window.cloudRequest('/rest/v1/rpc/commit_warehouse_carpet_cut_v1',{
      method:'POST',headers:window.cloudHeaders(s.access_token),body:JSON.stringify({
        p_execution_key:ticket.executionKey,p_operation_id:String(ticket.operationId??''),p_carpet_record_id:String(ticket.carpetRecordId??''),p_roll:ticket.roll||'',p_device_id:device,p_expected_versions:expected,p_payloads:payloads
      })
    });
    if(!result||!['committed','already_committed'].includes(result.status)){
      const names=Array.isArray(result?.conflicts)?result.conflicts.join(', '):'linked carpet-cut datasets';
      throw new Error('Atomic carpet-cut conflict on '+names+'. No partial cloud write was committed.');
    }
    const versions=result.versions||{};
    for(const k of LINKED){
      const stamp=versions[k]||now();
      try{localStorage.setItem((window.CLOUD_DATASET_SEEN_PREFIX||'runlu_cloud_dataset_seen_v658_')+k,stamp)}catch(_){}
      try{localStorage.setItem((window.CLOUD_DATASET_PUSH_PREFIX||'runlu_cloud_dataset_push_v583_')+k,stamp)}catch(_){}
      try{window.clearCloudDirty?.(k);window.clearCloudConflict?.(k)}catch(_){}
    }
    try{localStorage.setItem(window.CLOUD_LAST_PUSH_KEY||'runlu_cloud_last_push_v54',now());localStorage.removeItem(window.CLOUD_LAST_ERROR_KEY||'runlu_cloud_last_error_v5544')}catch(_){}
    clearPendingIf(ticket.executionKey);
    try{window.renderCloudStatus?.('Cloud ✓')}catch(_){}
    return result;
  }
  function enqueue(ticket){
    chain=chain.then(()=>atomicPush(ticket)).catch(err=>{conflictAll(String(err?.message||err));return {status:'pending',error:String(err?.message||err)}});
    return chain;
  }
  function ticketFrom(r,payloads=currentPayloads()){
    return {executionKey:executionKey(r),operationId:r?.id??'',carpetRecordId:r?.carpetRecordId??'',roll:r?.roll||'',po:r?.po||'',payloads:clone(payloads)};
  }
  function resumePending(){
    const p=pending();if(!p||p.phase!=='local_committed')return Promise.resolve(null);
    markLinkedDirty();return enqueue({...p,payloads:currentPayloads()});
  }

  // While an atomic cut is pending, never let a legacy per-dataset push split the four datasets.
  window.cloudPutDataset=async function build129CloudPutDataset(key,value){
    if(isLinked(key)&&pending())throw new Error('Atomic carpet-cut sync is pending; linked dataset push was deferred.');
    return baseCloudPut(key,value);
  };

  window.applySingleOperationImpact=function build129ApplySingleOperationImpact(r){
    if(!isActualCut(r))return baseApply(r);
    const captured={};const originalQueue=window.queueCloudSave;let marker=null,ok=false;
    try{
      marker=setPending(r,'local_attempt');
      window.queueCloudSave=(k,v)=>{if(isLinked(k)){captured[k]=clone(v);return}return originalQueue(k,v)};
      ok=baseApply(r)===true;
    }finally{window.queueCloudSave=originalQueue}
    if(!ok){clearPendingIf(marker?.executionKey);return false}
    const committed={...marker,phase:'local_committed',updatedAt:now()};localStorage.setItem(PENDING,JSON.stringify(committed));markLinkedDirty();
    const payloads=currentPayloads();for(const [k,v] of Object.entries(captured))payloads[k]=v;
    enqueue(ticketFrom(r,payloads));return true;
  };

  // Resume an interrupted local-committed/cloud-pending cut without falling back to four independent pushes.
  setTimeout(()=>{resumePending().catch(()=>{})},0);
  const recoveryTimer=setInterval(()=>{if(pending()&&localStorage.getItem(window.CLOUD_ENABLED_KEY||'runlu_cloud_enabled_v54')==='1')resumePending().catch(()=>{})},15000);
  try{recoveryTimer.unref?.()}catch(_){}

  window.RUNLU_CUT_CLOUD_ATOMIC_V129={build:BUILD,pendingKey:PENDING,linkedKeys:LINKED.slice(),atomicPush,enqueue,resumePending,flush:()=>chain,ticketFrom};
  console.info('[Build129] Carpet Cut Cloud Atomic Commit active');
})();
