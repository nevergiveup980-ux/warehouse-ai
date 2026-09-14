// RUNLU Warehouse OS V6.13.0 Build133 · Cloud-First Pilot
// Supabase Warehouse Cloud is the business-data authority. Company datasets live only in runtime RAM on the terminal.
// No offline business queue: a failed network write is reported immediately and the cloud-confirmed record stays authoritative.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD133_CLOUD_FIRST_PILOT__)return;
  window.__RUNLU_BUILD133_CLOUD_FIRST_PILOT__=true;

  const VERSION='6.13.0', BUILD='133';
  const API='https://ekrnknlawekeoszzkamd.supabase.co';
  const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const SESSION='runlu_cloud_session_v54';
  const ENABLED='runlu_cloud_sync_enabled_v54';
  const LEGACY_QUEUE='runlu_cloud_master_offline_queue_v680';
  const LEGACY_VERSIONS='runlu_cloud_master_record_versions_v680';
  const LEGACY_CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const LEGACY_BOOTSTRAP='runlu_cloud_master_bootstrap_v680';
  const LEGACY_SUMMARY='runlu_cloud_master_summary_v680';
  const LAST_SYNC='runlu_cloud_master_last_sync_v680';
  const LAST_ERROR='runlu_cloud_master_last_error_v680';
  const DRAFT='runlu_operation_draft_v55';
  const LEGACY_DB='runlu_inventory_v20';

  const ARRAY_KEYS=new Set([
    'runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20','runlu_receiving_v50','runlu_tasks_v50',
    'runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52','runlu_cutting_log_v52',
    'runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55','runlu_showroom_price_catalog_v1'
  ]);
  const DOCUMENT_KEYS=new Set([
    'runlu_settings_v20','runlu_count_sessions_v30','runlu_health_history_v518','runlu_location_master_v5518',
    'runlu_scan_learning_dictionary','runlu_scan_supplier_templates_v1',DRAFT
  ]);
  const CLOUD_KEYS=new Set([...ARRAY_KEYS,...DOCUMENT_KEYS]);
  const META_KEYS=new Set([LEGACY_QUEUE,LEGACY_VERSIONS,LEGACY_CONFLICTS,LEGACY_BOOTSTRAP,LEGACY_SUMMARY]);
  const TRANSIENT_KEYS=new Set([LEGACY_DB]);
  const VIRTUAL_KEYS=new Set([...CLOUD_KEYS,...META_KEYS,...TRANSIENT_KEYS]);
  const ESSENTIAL=['runlu_product_master_v21','runlu_inventory_records_v21','runlu_carpet_inventory_v52','runlu_operations_log_v52'];
  const EXTRA_DOCS=[...DOCUMENT_KEYS].filter(k=>k!=='runlu_settings_v20');

  const ram=new Map(),confirmed=new Map(),versions=new Map(),pendingByKey=new Map(),chains=new Map(),revisions=new Map();
  let ready=false,booting=false,paused=false,pending=0,lastError='',sessionMemory=null,deviceId='',refreshTimer=null;
  let storage=null,proto=null,rawGet=null,rawSet=null,rawRemove=null,originalLoad=null,originalLoadObj=null,originalSave=null;
  let storageInstalled=false,coreInstalled=false,draftInstalled=false,statusObserver=null;

  const q=id=>document.getElementById(id);
  const text=v=>String(v??'').trim();
  const parse=(s,f=null)=>{try{return JSON.parse(s)}catch{return f}};
  const clone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}};
  const eq=(a,b)=>{try{return JSON.stringify(a)===JSON.stringify(b)}catch{return false}};
  const rawRead=k=>{try{return rawGet.call(storage,k)}catch{return null}};
  const rawWrite=(k,v)=>{try{rawSet.call(storage,k,String(v));return true}catch{return false}};
  const rawDelete=k=>{try{rawRemove.call(storage,k);return true}catch{return false}};
  const jsonRaw=(k,f=null)=>parse(rawRead(k),f);
  const rowKey=(dataset,id)=>dataset+'::'+id;
  const rowTime=v=>Math.max(...['lastUpdatedAt','updatedAt','updated','completedAt','receivedAt','createdAt','created','date'].map(k=>new Date(v?.[k]||0).getTime()||0),0);
  const fnv=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};

  function stableId(dataset,row){
    if(DOCUMENT_KEYS.has(dataset))return '__document__';
    if(!row||typeof row!=='object')return '';
    if(dataset==='runlu_inventory_records_v21')return text(row.inventoryId||row.id||row.cloudRecordId);
    return text(row.id||row.cloudRecordId||row.roll||row.operationId||row.code||row.priceId||row.catalogId||row.sku||row.seen||row.templateId||row.poNumber||row.po||('AUTO-'+fnv(JSON.stringify(row))));
  }
  function sortRows(dataset,rows){
    if(dataset==='runlu_product_master_v21')return rows.sort((a,b)=>text(a.name).localeCompare(text(b.name))||text(a.color||a.colour).localeCompare(text(b.color||b.colour)));
    if(dataset==='runlu_inventory_records_v21')return rows;
    return rows.sort((a,b)=>rowTime(b)-rowTime(a));
  }
  function currentSession(){if(sessionMemory?.access_token)return sessionMemory;const s=jsonRaw(SESSION,null);if(s?.access_token)sessionMemory=s;return s}
  function headers(s,extra={}){return {apikey:KEY,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json',...extra}}

  async function request(path,options={},timeout=16000){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
    try{
      const res=await fetch(API+path,{...options,signal:c.signal});let body=null;try{body=await res.json()}catch{}
      if(!res.ok)throw new Error(body?.message||body?.error_description||body?.error||body?.hint||`Warehouse Cloud request failed (${res.status})`);
      return body;
    }catch(e){if(e?.name==='AbortError')throw new Error('Warehouse Cloud request timed out.');throw e}finally{clearTimeout(timer)}
  }
  async function ensureSession(){
    let s=currentSession();if(!s?.access_token)throw new Error('Warehouse Cloud sign-in is required.');
    const exp=(Number(s.expires_at||0)||0)*1000;if(!exp||exp>Date.now()+60000)return s;
    if(!s.refresh_token)throw new Error('Warehouse Cloud session expired. Sign in again.');
    const n=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
    if(!n?.access_token)throw new Error('Warehouse Cloud session could not be refreshed.');sessionMemory=n;rawWrite(SESSION,JSON.stringify(n));return n;
  }
  function cloudDeviceId(){
    if(deviceId)return deviceId;deviceId=text(rawRead('runlu_cloud_master_device_v680'))||text(rawRead('runlu_cloud_device_id_v54'));
    if(!deviceId)deviceId='CF-'+(crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));return deviceId;
  }
  async function fetchRecords(){const s=await ensureSession();const rows=await request('/rest/v1/warehouse_records?select=dataset_key,record_id,payload,version,deleted_at,updated_at,origin,device_id&order=dataset_key.asc,record_id.asc',{headers:headers(s)});return Array.isArray(rows)?rows:[]}
  async function fetchState(){const s=await ensureSession();const rows=await request('/rest/v1/warehouse_cloud_state?select=mode,protocol_version,updated_at,metadata&limit=1',{headers:headers(s)});return Array.isArray(rows)&&rows[0]?rows[0]:null}
  async function applyMutation(dataset,recordId,payload,baseVersion=0,del=false){
    const s=await ensureSession(),rpcPayload=del?{...(payload&&typeof payload==='object'?payload:{}),_runluDeleteIntent:'explicit-user-delete'}:(payload??{});
    const res=await request('/rest/v1/rpc/warehouse_apply_mutation',{method:'POST',headers:headers(s),body:JSON.stringify({p_dataset_key:dataset,p_record_id:String(recordId),p_payload:rpcPayload,p_base_version:Number(baseVersion||0),p_delete:!!del,p_device_id:cloudDeviceId()})});
    if(res?.status==='conflict'){const err=new Error(`Cloud conflict on ${dataset} / ${recordId}. The cloud copy was kept.`);err.cloudConflict=res;throw err}
    if(res?.status==='blocked')throw new Error(`Cloud protected ${dataset} / ${recordId}: ${res.reason||'mutation blocked'}.`);
    if(res?.status!=='ok')throw new Error(`Warehouse Cloud did not confirm ${dataset} / ${recordId}.`);
    return res.record||null;
  }

  function overlay(title='Opening Warehouse Cloud…',body='Loading live warehouse data. Company databases will not remain on this device.'){
    let el=q('runluCloudFirstBoot');if(!el){el=document.createElement('div');el.id='runluCloudFirstBoot';el.style.cssText='position:fixed;inset:0;z-index:9997;background:rgba(7,22,47,.95);color:white;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif';el.innerHTML='<div style="max-width:440px"><div style="font-size:12px;letter-spacing:.1em;opacity:.68">RUNLU WAREHOUSE OS · CLOUD-FIRST</div><div id="runluCFTitle" style="font-size:25px;font-weight:900;margin-top:10px"></div><div id="runluCFBody" style="font-size:13px;line-height:1.55;opacity:.82;margin-top:10px"></div></div>';document.body.appendChild(el)}
    q('runluCFTitle').textContent=title;q('runluCFBody').textContent=body;el.style.display='flex';
  }
  function hideOverlay(){const el=q('runluCloudFirstBoot');if(el)el.style.display='none'}
  function paint(){
    const pill=q('headerCloudPill');let cls='cloudPill syncing',label='Cloud opening…';
    if(paused){cls='cloudPill offline';label='Migration paused'}else if(lastError){cls='cloudPill offline';label='Not saved'}else if(pending){cls='cloudPill syncing';label='Saving…'}else if(ready){cls='cloudPill online';label='Cloud Live ✓'}
    if(pill){if(pill.className!==cls)pill.className=cls;if(pill.textContent!==label)pill.textContent=label}
    const box=q('runluCloudRecoveryBanner'),t=q('runluCloudRecoveryTitle'),b=q('runluCloudRecoveryText');
    if(box&&lastError){box.classList.remove('hidden');if(t)t.textContent='Warehouse open · Cloud save needs attention';if(b)b.textContent=lastError+' No failed change is being stored as an offline company-data queue.'}
    else if(box&&ready&&!pending)box.classList.add('hidden');
    document.documentElement.setAttribute('data-runlu-cloud-first',ready?'ready':paused?'paused':'opening');
  }
  function observeStatus(){const p=q('headerCloudPill');if(!p||statusObserver)return;statusObserver=new MutationObserver(()=>paint());statusObserver.observe(p,{childList:true,characterData:true,subtree:true,attributes:true})}

  function buildVersions(rows){const map={};versions.clear();for(const r of rows){const v=Number(r.version||0);versions.set(rowKey(r.dataset_key,r.record_id),v);map[rowKey(r.dataset_key,r.record_id)]=v}ram.set(LEGACY_VERSIONS,map)}
  function groupRecords(rows){
    const grouped=new Map();for(const k of CLOUD_KEYS)grouped.set(k,DOCUMENT_KEYS.has(k)?null:[]);
    for(const r of rows){if(!CLOUD_KEYS.has(r.dataset_key)||r.deleted_at)continue;if(DOCUMENT_KEYS.has(r.dataset_key)){if(r.record_id==='__document__'||grouped.get(r.dataset_key)==null)grouped.set(r.dataset_key,clone(r.payload));continue}grouped.get(r.dataset_key).push(clone(r.payload))}
    for(const [k,v] of grouped){const value=ARRAY_KEYS.has(k)?sortRows(k,Array.isArray(v)?v:[]):(v??(k==='runlu_settings_v20'?{}:[]));ram.set(k,clone(value));confirmed.set(k,clone(value))}
  }
  function buildMeta(rows){
    buildVersions(rows);ram.set(LEGACY_QUEUE,[]);ram.set(LEGACY_CONFLICTS,[]);ram.set(LEGACY_BOOTSTRAP,{});
    const counts={};for(const r of rows)if(!r.deleted_at)counts[r.dataset_key]=(counts[r.dataset_key]||0)+1;ram.set(LEGACY_SUMMARY,{at:new Date().toISOString(),counts,totalActive:Object.values(counts).reduce((a,b)=>a+b,0)});
  }

  function installStorageVirtualization(){
    if(storageInstalled)return true;if(!storage||!proto)return false;
    const prevGet=proto.getItem,prevSet=proto.setItem,prevRemove=proto.removeItem;if(typeof prevGet!=='function'||typeof prevSet!=='function'||typeof prevRemove!=='function')return false;
    const g=function(key){const k=String(key);if(this===storage&&ready&&VIRTUAL_KEYS.has(k)){const v=ram.get(k);return v===undefined?null:JSON.stringify(v)}return prevGet.call(this,key)};
    const s=function(key,value){const k=String(key);if(this===storage&&ready&&VIRTUAL_KEYS.has(k)){const v=parse(String(value),undefined);if(v===undefined)throw new TypeError('Cloud-first virtual data must be valid JSON.');ram.set(k,clone(v));if(k===LEGACY_VERSIONS&&v&&typeof v==='object')for(const [rk,rv] of Object.entries(v))versions.set(rk,Number(rv||0));if(CLOUD_KEYS.has(k)&&!pendingByKey.get(k))confirmed.set(k,clone(v));return undefined}return prevSet.call(this,key,value)};
    const r=function(key){const k=String(key);if(this===storage&&ready&&VIRTUAL_KEYS.has(k)){if(k===DRAFT){ram.delete(k);queueDeleteDocument(DRAFT)}else if(META_KEYS.has(k)||TRANSIENT_KEYS.has(k))ram.delete(k);return undefined}return prevRemove.call(this,key)};
    g.__build133=true;g.__original=prevGet;s.__build133=true;s.__original=prevSet;r.__build133=true;r.__original=prevRemove;
    try{proto.getItem=g;proto.setItem=s;proto.removeItem=r}catch(e){console.error('[Build133] virtual storage unavailable',e);return false}storageInstalled=true;return true;
  }

  function recordMap(dataset,value){const m=new Map();if(DOCUMENT_KEYS.has(dataset)){if(value!==undefined&&value!==null)m.set('__document__',value);return m}for(const row of Array.isArray(value)?value:[]){const id=stableId(dataset,row);if(id)m.set(id,row)}return m}
  function diffDataset(dataset,before,after){
    const a=recordMap(dataset,before),b=recordMap(dataset,after),out=[];
    for(const [id,row] of b){const old=a.get(id);if(!old||!eq(old,row))out.push({id,payload:row,del:false})}
    for(const [id,row] of a)if(!b.has(id))out.push({id,payload:row,del:true});return out;
  }
  async function refreshOne(dataset,{updateRam=true}={}){
    const all=await fetchRecords();buildVersions(all);const rows=all.filter(r=>r.dataset_key===dataset);let value=DOCUMENT_KEYS.has(dataset)?null:[];
    for(const r of rows){if(r.deleted_at)continue;if(DOCUMENT_KEYS.has(dataset)){if(r.record_id==='__document__'||value==null)value=clone(r.payload)}else value.push(clone(r.payload))}
    if(ARRAY_KEYS.has(dataset))value=sortRows(dataset,value);if(value==null)value=dataset==='runlu_settings_v20'?{}:[];confirmed.set(dataset,clone(value));if(updateRam)ram.set(dataset,clone(value));return value;
  }
  function queueSave(dataset,value,{draft=false}={}){
    const key=String(dataset),rev=(revisions.get(key)||0)+1;revisions.set(key,rev);ram.set(key,clone(value));pending++;pendingByKey.set(key,(pendingByKey.get(key)||0)+1);lastError='';paint();
    const prior=chains.get(key)||Promise.resolve();
    const task=prior.catch(()=>{}).then(async()=>{
      const before=clone(confirmed.get(key)??(DOCUMENT_KEYS.has(key)?null:[])),changes=diffDataset(key,before,value);
      for(const c of changes){const base=Number(versions.get(rowKey(key,c.id))||0),rec=await applyMutation(key,c.id,c.payload,base,c.del);if(c.del)versions.delete(rowKey(key,c.id));else if(rec)versions.set(rowKey(key,c.id),Number(rec.version||base+1))}
      confirmed.set(key,clone(value));lastError='';return true;
    }).catch(async err=>{
      console.error('[Build133] cloud write failed',key,err);const latest=revisions.get(key)===rev;
      try{await refreshOne(key,{updateRam:latest})}catch(refreshErr){console.warn('[Build133] cloud recovery refresh failed',refreshErr)}
      if(latest){lastError=(draft?'Draft not saved: ':'Cloud save failed: ')+String(err?.message||err);setTimeout(()=>alert((draft?'Draft was not saved to Warehouse Cloud. ':'Warehouse change was not saved to Cloud. ')+String(err?.message||err)+'\n\nThe cloud-confirmed record remains authoritative.'),0)}
      throw err;
    }).finally(()=>{pending=Math.max(0,pending-1);pendingByKey.set(key,Math.max(0,(pendingByKey.get(key)||1)-1));paint();rerender()});
    chains.set(key,task);return task;
  }
  function queueDeleteDocument(dataset){
    const key=String(dataset),rev=(revisions.get(key)||0)+1;revisions.set(key,rev);pending++;pendingByKey.set(key,(pendingByKey.get(key)||0)+1);lastError='';paint();
    const prior=chains.get(key)||Promise.resolve(),task=prior.catch(()=>{}).then(async()=>{const base=Number(versions.get(rowKey(key,'__document__'))||0),payload=confirmed.get(key)||{};if(base>0)await applyMutation(key,'__document__',payload,base,true);versions.delete(rowKey(key,'__document__'));confirmed.delete(key);ram.delete(key);lastError='';return true}).catch(async err=>{const latest=revisions.get(key)===rev;try{await refreshOne(key,{updateRam:latest})}catch{}if(latest){lastError='Cloud delete failed: '+String(err?.message||err);setTimeout(()=>alert(lastError),0)}throw err}).finally(()=>{pending=Math.max(0,pending-1);pendingByKey.set(key,Math.max(0,(pendingByKey.get(key)||1)-1));paint()});
    chains.set(key,task);return task;
  }

  function installCoreHooks(){
    if(coreInstalled)return true;if(typeof window.load!=='function'||typeof window.loadObj!=='function'||typeof window.save!=='function')return false;
    originalLoad=originalLoad||window.load;originalLoadObj=originalLoadObj||window.loadObj;originalSave=originalSave||window.save;
    const l=function(k){const key=String(k);if(ready&&VIRTUAL_KEYS.has(key)){const v=ram.get(key);return v===undefined?[]:clone(v)}return originalLoad.apply(this,arguments)};
    const lo=function(k){const key=String(k);if(ready&&VIRTUAL_KEYS.has(key)){const v=ram.get(key);return v===undefined?{}:clone(v)}return originalLoadObj.apply(this,arguments)};
    const sv=function(k,v){const key=String(k);if(ready&&CLOUD_KEYS.has(key)){queueSave(key,v,{draft:key===DRAFT});return true}if(ready&&TRANSIENT_KEYS.has(key)){ram.set(key,clone(v));return true}return originalSave.apply(this,arguments)};
    Object.assign(sv,{__build133CloudFirst:true,__build130:true,__build072:true,__build122:true,__build072CarpetRoll:true,__build124SharedRollIdentity:true,__build128CarpetIdentityAuthority:true,__original:originalSave});
    window.load=l;window.loadObj=lo;window.save=sv;coreInstalled=true;return true;
  }

  function installDraftHook(){
    if(draftInstalled||typeof window.operationDraftPayload!=='function')return false;
    const fn=function(){const editor=q('operationEditor');if(!editor||editor.classList.contains('hidden'))return Promise.resolve(false);let payload;try{payload=window.operationDraftPayload()}catch(e){return Promise.reject(e)}try{operationDraftDirty=true}catch{}const el=q('operationDraftState');if(el){el.textContent='Saving draft to Cloud…';el.style.color='var(--muted)'}const p=queueSave(DRAFT,payload,{draft:true});p.then(()=>{if(el){el.textContent='✓ Draft saved to Cloud '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});el.style.color='var(--green)'}}).catch(()=>{if(el){el.textContent='⚠ Draft not saved · Retry';el.style.color='var(--red)'}});return p};
    fn.__build129=true;fn.__build133CloudDraft=true;window.saveOperationDraftNow=fn;draftInstalled=true;return true;
  }

  function activePage(){return document.querySelector('.page:not(.hidden)')?.id||'home'}
  function rerender(){if(typeof window.protectedInputActive==='function'&&window.protectedInputActive())return;const id=activePage(),map={home:'renderDashboard',products:'renderProducts',inventory:'renderInventory',carpetInventory:'renderCarpetInventory',operations:'renderOperations',operationsDay:'renderOperationsDay',ordersHub:'renderOrders',specialOrders:'renderSpecialOrders',receiving:'renderReceiving',warehouseMap:'renderMap',settings:'renderSettings'};const fn=map[id]&&window[map[id]];try{if(typeof fn==='function')fn()}catch(e){console.warn('[Build133] render isolated',e)}}
  async function refreshAll(announce=false){
    if(!ready||pending)return false;try{const rows=await fetchRecords();buildVersions(rows);groupRecords(rows);buildMeta(rows);lastError='';paint();settingsStatus();rerender();if(announce)alert('Warehouse Cloud is current.');return true}catch(e){lastError='Cloud refresh failed: '+String(e?.message||e);paint();if(announce)alert(lastError);return false}
  }
  function disableLegacyDatasetSync(){
    window.cloudAutoRefresh=async()=>refreshAll(false);window.cloudDownloadAll=async()=>refreshAll(true);window.cloudSyncNow=async()=>refreshAll(true);window.cloudUploadAll=async()=>{alert('Cloud-First Pilot is active. Device-wide upload is retired because Warehouse Cloud is authoritative.');return false};window.startCloudPolling=function(){startRefreshLoop();return refreshTimer};
    const publicSync=async({silent=false}={})=>refreshAll(!silent);publicSync.__build069=true;publicSync.__build071=true;publicSync.__build072=true;publicSync.__build133=true;window.runluCloudMasterSync=publicSync;
    const old=window.updateHeaderCloudPill;const status=()=>{paint()};status.__build133=true;status.__original=old;window.updateHeaderCloudPill=status;
  }
  function startRefreshLoop(){clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshAll(false)},15000);return refreshTimer}

  async function flushLegacyQueue(){
    const conflicts=jsonRaw(LEGACY_CONFLICTS,[]);if(Array.isArray(conflicts)&&conflicts.length)throw new Error('A record-level Cloud Master conflict is waiting for review. Migration will not remove the device copy yet.');
    let queue=jsonRaw(LEGACY_QUEUE,[]);if(!Array.isArray(queue))queue=[];if(queue.some(x=>x?.blocked))throw new Error('A blocked offline change is waiting for conflict review.');
    for(let i=0;i<queue.length;i++){const m=queue[i];const rec=await applyMutation(m.datasetKey,m.recordId,m.payload||{},Number(m.baseVersion||0),m.op==='delete');if(rec?.version)versions.set(rowKey(m.datasetKey,m.recordId),Number(rec.version));queue[i]=null;rawWrite(LEGACY_QUEUE,JSON.stringify(queue.filter(Boolean)))}
    rawDelete(LEGACY_QUEUE);rawDelete(LEGACY_CONFLICTS);
  }
  async function legacyDatasetRows(){try{const s=await ensureSession();const rows=await request('/rest/v1/user_datasets?select=dataset_key,payload,updated_at&order=updated_at.asc',{headers:headers(s)});return Array.isArray(rows)?rows:[]}catch{return[]}}
  function localCandidate(key){const raw=rawRead(key);if(raw==null)return undefined;return parse(raw,undefined)}
  async function bestDraftCandidate(legacy){
    let best=localCandidate(DRAFT),time=new Date(best?.savedAt||0).getTime()||0;
    try{const row=await window.RUNLUOperationDraftBuild129?.readFallback?.();const p=row?.payload,t=new Date(p?.savedAt||row?.savedAt||0).getTime()||0;if(p&&t>time){best=p;time=t}}catch{}
    const old=legacy.find(r=>r.dataset_key===DRAFT)?.payload,tOld=new Date(old?.savedAt||0).getTime()||0;if(old&&tOld>time)best=old;return best;
  }
  async function migrateExtraDocuments(rows){
    const legacy=await legacyDatasetRows();
    for(const key of EXTRA_DOCS){
      const remote=rows.find(r=>r.dataset_key===key&&r.record_id==='__document__'),active=remote&&!remote.deleted_at;
      let candidate=key===DRAFT?await bestDraftCandidate(legacy):localCandidate(key);if(candidate===undefined||candidate===null)candidate=legacy.find(r=>r.dataset_key===key)?.payload;
      if(candidate===undefined||candidate===null)continue;if(Array.isArray(candidate)&&!candidate.length&&key!==DRAFT)continue;if(candidate&&typeof candidate==='object'&&!Array.isArray(candidate)&&!Object.keys(candidate).length)continue;
      if(active){if(key!==DRAFT)continue;const localT=new Date(candidate?.savedAt||0).getTime()||0,remoteT=new Date(remote.payload?.savedAt||0).getTime()||0;if(localT<=remoteT)continue}
      await applyMutation(key,'__document__',candidate,Number(remote?.version||0),false);
    }
  }

  function purgePhysicalCompanyData(){
    const exact=new Set([...CLOUD_KEYS,...TRANSIENT_KEYS,LEGACY_QUEUE,LEGACY_VERSIONS,LEGACY_CONFLICTS,LEGACY_BOOTSTRAP,LEGACY_SUMMARY,'runlu_local_snapshots_v515','runlu_data_protection_v515','runlu_inventory_v13','runlu_orders_v13','runlu_v516_preupgrade_backup','runlu_cloud_dirty_keys_v5544','runlu_cloud_dataset_conflicts_v659_','runlu_cloud_summary_v5544']);
    for(const k of exact)rawDelete(k);
    try{const keys=[];for(let i=0;i<storage.length;i++)keys.push(storage.key(i));for(const k of keys)if(/^runlu_cloud_(local_updated_v583_|dataset_push_v583_|dataset_seen_v658_)/.test(k||''))rawDelete(k)}catch{}
    for(const db of ['runlu_warehouse_resilient_cache_v129','runlu_local_archive_v131'])try{indexedDB.deleteDatabase(db)}catch{}
  }
  function initVirtualMeta(rows){buildMeta(rows);ram.set(LEGACY_DB,[])}
  function settingsStatus(){const el=q('cloudStatus');if(el)el.innerHTML='<b>Cloud-First Pilot active</b> · Supabase Warehouse Cloud is the source of truth. Company datasets are held only in runtime memory on this terminal.'+(pending?`<br><b>${pending} cloud save(s) pending</b>`:'')+(lastError?`<br><span style="color:#b42318">${lastError}</span>`:'');const d=q('cloudSyncDetails');if(d)d.innerHTML=`<b>Persistent company datasets on this browser:</b> 0<br><b>Live cloud datasets:</b> ${CLOUD_KEYS.size}<br><b>Cloud refresh:</b> every 15 seconds while visible<br><b>Offline company-data queue:</b> Disabled during pilot`}
  async function verifyCloud(rows){const state=await fetchState();if(!state||state.mode!=='active')throw new Error('Warehouse Cloud Master is not active.');for(const k of ESSENTIAL)if(!rows.some(r=>r.dataset_key===k&&!r.deleted_at))throw new Error('Essential cloud dataset is missing: '+k)}

  async function bootstrap(){
    if(ready||booting||paused)return ready;booting=true;
    try{
      if(!storage){storage=localStorage;proto=Object.getPrototypeOf(storage);rawGet=proto.getItem;rawSet=proto.setItem;rawRemove=proto.removeItem}
      if(!currentSession()?.access_token){hideOverlay();lastError='Warehouse Cloud sign-in is required before Cloud-First cutover.';paint();return false}
      overlay('Opening Warehouse Cloud…','Checking Cloud Master before removing any company data from this terminal.');await ensureSession();
      await flushLegacyQueue();let rows=await fetchRecords();await verifyCloud(rows);
      overlay('Migrating small remaining datasets…','Drafts, cycle counts, scan learning, location settings and health history are being moved to Cloud Master when needed.');await migrateExtraDocuments(rows);
      rows=await fetchRecords();await verifyCloud(rows);groupRecords(rows);initVirtualMeta(rows);
      installCoreHooks();installStorageVirtualization();installDraftHook();disableLegacyDatasetSync();ready=true;paused=false;lastError='';
      purgePhysicalCompanyData();rawWrite(ENABLED,'1');rawDelete(LAST_ERROR);rawWrite(LAST_SYNC,new Date().toISOString());
      document.documentElement.setAttribute('data-runlu-cloud-first-build',BUILD);hideOverlay();paint();observeStatus();settingsStatus();rerender();startRefreshLoop();
      console.info('[Build133] Cloud-First Pilot active: Warehouse Cloud record store is authoritative; terminal business persistence is disabled.');return true;
    }catch(e){console.error('[Build133] Cloud-First cutover paused',e);paused=true;lastError='Cloud-First migration paused: '+String(e?.message||e);hideOverlay();paint();alert(lastError+'\n\nNo local company dataset was deleted. Resolve the cloud issue, then reopen Warehouse OS.');return false}
    finally{booting=false}
  }
  function lateInstall(){if(!ready)return;installCoreHooks();installStorageVirtualization();installDraftHook();disableLegacyDatasetSync();settingsStatus();paint()}
  function boot(){
    try{storage=localStorage;proto=Object.getPrototypeOf(storage);rawGet=proto.getItem;rawSet=proto.setItem;rawRemove=proto.removeItem}catch(e){console.error('[Build133] storage bridge unavailable',e)}
    bootstrap();let tries=0;const retry=setInterval(()=>{if(ready||paused||++tries>120){clearInterval(retry);return}bootstrap()},1000);
    window.addEventListener('pageshow',()=>setTimeout(()=>{if(ready){lateInstall();refreshAll(false)}else if(!paused)bootstrap()},80));
    window.addEventListener('focus',()=>setTimeout(()=>{if(ready){lateInstall();refreshAll(false)}else if(!paused)bootstrap()},100));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(ready)refreshAll(false);else if(!paused)bootstrap()}});
    window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='Warehouse Cloud is still saving changes.'}});
  }

  window.RUNLUCloudFirstBuild133={version:BUILD,appVersion:VERSION,get ready(){return ready},get paused(){return paused},get pending(){return pending},bootstrap,refresh:refreshAll,status:()=>({ready,paused,pending,lastError,cloudDatasets:CLOUD_KEYS.size}),get:key=>clone(ram.get(key))};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
