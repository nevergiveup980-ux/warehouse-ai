// RUNLU Warehouse OS Build129 · Carpet Cut Cloud Atomic Commit r1
// Candidate only. Keeps the four cut-linked cloud datasets together and prevents
// two devices from silently overwriting the same stale carpet state.
(() => {
  const BUILD='129';
  const PENDING='runlu_carpet_cut_cloud_atomic_v129_pending';
  const LINKED=[window.CARPETDB||'runlu_carpet_inventory_v52',window.CUTDB||'runlu_cutting_log_v52',window.ODB||'runlu_orders_v20',window.EVENTDB||'runlu_event_history_v52'];
  const ENABLED='runlu_cloud_sync_enabled_v54',LOCAL_PREFIX='runlu_cloud_local_updated_v583_',SEEN_PREFIX='runlu_cloud_dataset_seen_v658_',PUSH_PREFIX='runlu_cloud_dataset_push_v583_',LAST_PUSH='runlu_cloud_last_push_v54',LAST_ERROR='runlu_cloud_last_error_v5544';
  const baseApply=window.applySingleOperationImpact,baseQueue=window.queueCloudSave,baseCloudPut=window.cloudPutDataset;
  if(typeof baseApply!=='function'||typeof baseQueue!=='function'||typeof baseCloudPut!=='function'){console.warn('[Build129] Atomic carpet-cut cloud guard not installed: base functions unavailable.');return}
  const parse=(raw,fallback)=>{try{return raw==null?fallback:JSON.parse(raw)}catch{return fallback}},clone=v=>parse(JSON.stringify(v),v),clean=v=>String(v??'').trim(),now=()=>new Date().toISOString();
  const isLinked=k=>LINKED.includes(k),pending=()=>parse(localStorage.getItem(PENDING),null),executionKey=r=>window.RUNLU_CUT_TRANSACTION_GUARD_V128?.executionKey?.(r)||['CUT',String(r?.id??''),String(r?.carpetRecordId??''),clean(r?.roll).toUpperCase().replace(/[^A-Z0-9]/g,'')].join('|');
  const isActualCut=r=>r?.type==='Carpet Cutting'&&r?.inventoryMode==='Stock'&&r?.status==='Completed',currentPayloads=()=>Object.fromEntries(LINKED.map(k=>[k,parse(localStorage.getItem(k),[])]));
  let chain=Promise.resolve();
  function setPending(r,phase='local_attempt'){const marker={version:1,build:BUILD,phase,executionKey:executionKey(r),operationId:r?.id??'',carpetRecordId:r?.carpetRecordId??'',roll:r?.roll||'',po:r?.po||'',updatedAt:now()};localStorage.setItem(PENDING,JSON.stringify(marker));return marker}
  function clearPendingIf(key){const p=pending();if(!p||p.executionKey===key)localStorage.removeItem(PENDING)}
  function markLinkedDirty(){for(const k of LINKED){try{window.markCloudDirty?.(k)}catch(_){}try{localStorage.setItem(LOCAL_PREFIX+k,now())}catch(_){}}}
  function conflictAll(message){try{window.setCloudConflictKeys?.((window.cloudConflictKeys?.()||[]).concat(LINKED))}catch(_){}try{localStorage.setItem(LAST_ERROR,message)}catch(_){}try{window.renderCloudStatus?.('Sync pending: '+message)}catch(_){}}
  function remoteChanged(meta,key,device){if(!meta)return false;const remote=window.cloudRemoteMs?.(meta)??new Date(meta.updated_at||0).getTime(),seen=window.cloudSeenMs?.(key)??new Date(localStorage.getItem(SEEN_PREFIX+key)||0).getTime();return !!meta.device_id&&meta.device_id!==device&&remote>0&&(!seen||remote>seen+500)}
  async function preparedPayloads(snapshot,s){const out={};for(const k of LINKED){const v=snapshot[k]??[];out[k]=window.cloudPreparePayload?await window.cloudPreparePayload(v,k,s):v}return out}
  async function atomicPush(ticket){
    if(localStorage.getItem(ENABLED)!=='1')throw new Error('Cloud is disabled; atomic carpet-cut sync is waiting.');
    const s=await window.cloudEnsureSession?.();if(!s)throw new Error('Cloud session is unavailable.');const device=window.cloudDeviceId?.()||'unknown-device',expected={};
    for(const k of LINKED){const meta=await window.cloudDatasetMeta(k,s);if(remoteChanged(meta,k,device))throw new Error('Atomic carpet-cut conflict: another device changed '+(window.cloudDatasetLabel?.(k)||k)+' after this device last saw it. No cloud dataset was overwritten.');expected[k]=meta?.updated_at||null}
    const payloads=await preparedPayloads(ticket.payloads,s),result=await window.cloudRequest('/rest/v1/rpc/commit_warehouse_carpet_cut_v1',{method:'POST',headers:window.cloudHeaders(s.access_token),body:JSON.stringify({p_execution_key:ticket.executionKey,p_operation_id:String(ticket.operationId??''),p_carpet_record_id:String(ticket.carpetRecordId??''),p_roll:ticket.roll||'',p_device_id:device,p_expected_versions:expected,p_payloads:payloads})});
    if(!result||!['committed','already_committed'].includes(result.status)){const names=Array.isArray(result?.conflicts)?result.conflicts.join(', '):'linked carpet-cut datasets';throw new Error('Atomic carpet-cut conflict on '+names+'. No partial cloud write was committed.')}
    const versions=result.versions||{};for(const k of LINKED){const stamp=versions[k]||now();try{localStorage.setItem(SEEN_PREFIX+k,stamp);localStorage.setItem(PUSH_PREFIX+k,stamp)}catch(_){}try{window.clearCloudDirty?.(k);window.clearCloudConflict?.(k)}catch(_){}}
    try{localStorage.setItem(LAST_PUSH,now());localStorage.removeItem(LAST_ERROR)}catch(_){}clearPendingIf(ticket.executionKey);try{window.renderCloudStatus?.('Cloud ✓')}catch(_){}return result
  }
  function enqueue(ticket){chain=chain.then(()=>atomicPush(ticket)).catch(err=>{conflictAll(String(err?.message||err));return {status:'pending',error:String(err?.message||err)}});return chain}
  function ticketFrom(r,payloads=currentPayloads()){return {executionKey:executionKey(r),operationId:r?.id??'',carpetRecordId:r?.carpetRecordId??'',roll:r?.roll||'',po:r?.po||'',payloads:clone(payloads)}}
  function resumePending(){const p=pending();if(!p||p.phase!=='local_committed')return Promise.resolve(null);markLinkedDirty();return enqueue({...p,payloads:currentPayloads()})}
  window.cloudPutDataset=async function build129CloudPutDataset(key,value){if(isLinked(key)&&pending())throw new Error('Atomic carpet-cut sync is pending; linked dataset push was deferred.');return baseCloudPut(key,value)};
  window.applySingleOperationImpact=function build129ApplySingleOperationImpact(r){
    if(!isActualCut(r))return baseApply(r);const captured={},originalQueue=window.queueCloudSave;let marker=null,ok=false;
    try{marker=setPending(r,'local_attempt');window.queueCloudSave=(k,v)=>{if(isLinked(k)){captured[k]=clone(v);return}return originalQueue(k,v)};ok=baseApply(r)===true}finally{window.queueCloudSave=originalQueue}
    if(!ok){clearPendingIf(marker?.executionKey);return false}const committed={...marker,phase:'local_committed',updatedAt:now()};localStorage.setItem(PENDING,JSON.stringify(committed));markLinkedDirty();const payloads=currentPayloads();for(const [k,v] of Object.entries(captured))payloads[k]=v;enqueue(ticketFrom(r,payloads));return true
  };
  setTimeout(()=>{resumePending().catch(()=>{})},0);const recoveryTimer=setInterval(()=>{if(pending()&&localStorage.getItem(ENABLED)==='1')resumePending().catch(()=>{})},15000);try{recoveryTimer.unref?.()}catch(_){}
  window.RUNLU_CUT_CLOUD_ATOMIC_V129={build:BUILD,pendingKey:PENDING,linkedKeys:LINKED.slice(),atomicPush,enqueue,resumePending,flush:()=>chain,ticketFrom};console.info('[Build129] Carpet Cut Cloud Atomic Commit active');
})();
