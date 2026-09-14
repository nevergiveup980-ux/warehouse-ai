// RUNLU Warehouse OS V6.13.0 Build133 · Cloud-First Pilot
// Business data lives in Warehouse Cloud. The browser keeps only runtime RAM plus tiny auth/UI metadata.
// Existing local business datasets are removed only after a verified cloud migration completes.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD133_CLOUD_FIRST_PILOT__)return;
  window.__RUNLU_BUILD133_CLOUD_FIRST_PILOT__=true;

  const VERSION='6.13.0', BUILD='133';
  const CLOUD_URL='https://ekrnknlawekeoszzkamd.supabase.co';
  const CLOUD_KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const SESSION_KEY='runlu_cloud_session_v54';
  const ENABLED_KEY='runlu_cloud_sync_enabled_v54';
  const DIRTY_KEY='runlu_cloud_dirty_keys_v5544';
  const CONFLICT_KEY='runlu_cloud_dataset_conflicts_v659_';
  const DRAFT_KEY='runlu_operation_draft_v55';
  const BUSINESS_KEYS=[
    'runlu_inventory_v20','runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20',
    'runlu_receiving_v50','runlu_tasks_v50','runlu_special_orders_v51','runlu_operations_log_v52',
    'runlu_carpet_inventory_v52','runlu_cutting_log_v52','runlu_event_history_v52','runlu_tag_print_history_v53',
    'runlu_remnants_v55','runlu_settings_v20','runlu_count_sessions_v30','runlu_scan_learning_dictionary',
    'runlu_scan_supplier_templates_v1'
  ];
  const BUSINESS_SET=new Set(BUSINESS_KEYS);
  const VIRTUAL_SET=new Set([...BUSINESS_KEYS,DRAFT_KEY]);
  const LOCAL_PURGE_KEYS=[
    ...BUSINESS_KEYS,DRAFT_KEY,'runlu_local_snapshots_v515','runlu_data_protection_v515',
    'runlu_inventory_v13','runlu_orders_v13'
  ];
  const REMOTE_FIELDS='dataset_key,payload,updated_at,device_id';

  const ram=new Map(),confirmed=new Map(),remoteUpdated=new Map(),writeChains=new Map(),revisions=new Map();
  let ready=false,booting=false,paused=false,lastError='',pendingWrites=0,refreshTimer=null,retryTimer=null;
  let originalLoad=null,originalLoadObj=null,originalSave=null,originalStartCloudPolling=null;
  let storage=null,storageProto=null,rawGet=null,rawSet=null,rawRemove=null;
  let virtualStorageInstalled=false,coreHooksInstalled=false,draftHookInstalled=false;
  let sessionMemory=null,deviceId='';

  const q=id=>document.getElementById(id);
  const clone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}};
  const parse=(s,fallback=null)=>{try{return JSON.parse(s)}catch{return fallback}};
  const text=v=>String(v??'').trim();
  const isQuota=e=>!!e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014||/quota|storage.*full|exceeded/i.test(String(e.message||e)));
  const isBusiness=k=>BUSINESS_SET.has(String(k));
  const isVirtual=k=>VIRTUAL_SET.has(String(k));
  const hasMeaningful=v=>Array.isArray(v)?v.length>0:(v&&typeof v==='object'?Object.keys(v).length>0:!!v);
  const rowMs=r=>new Date(r?.updated_at||0).getTime()||0;
  const seenKey=k=>'runlu_cloud_dataset_seen_v658_'+k;

  function rawRead(key){try{return rawGet.call(storage,key)}catch{return null}}
  function rawWrite(key,value){try{rawSet.call(storage,key,String(value));return true}catch{return false}}
  function rawDelete(key){try{rawRemove.call(storage,key);return true}catch{return false}}
  function readJsonRaw(key,fallback=null){return parse(rawRead(key),fallback)}
  function currentSession(){
    if(sessionMemory?.access_token)return sessionMemory;
    const s=readJsonRaw(SESSION_KEY,null);if(s?.access_token)sessionMemory=s;return s;
  }
  function headers(token,json=true){const h={apikey:CLOUD_KEY,Authorization:'Bearer '+token};if(json)h['Content-Type']='application/json';return h}

  async function request(path,options={},timeout=15000){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
    try{
      const res=await fetch(CLOUD_URL+path,{...options,signal:c.signal});
      let data=null;try{data=await res.json()}catch{}
      if(!res.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||`Cloud request failed (${res.status})`);
      return data;
    }catch(e){if(e?.name==='AbortError')throw new Error('Warehouse Cloud request timed out.');throw e}
    finally{clearTimeout(timer)}
  }

  async function ensureSession(){
    let s=currentSession();
    if(!s?.access_token)throw new Error('Warehouse Cloud sign-in is required.');
    const expires=(Number(s.expires_at||0)||0)*1000;
    if(!expires||expires>Date.now()+60000)return s;
    if(!s.refresh_token)throw new Error('Warehouse Cloud session expired. Sign in again.');
    const n=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:CLOUD_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
    if(!n?.access_token)throw new Error('Warehouse Cloud session could not be refreshed.');
    sessionMemory=n;
    // Session metadata is intentionally allowed to remain local. Failure here is harmless for this page session.
    rawWrite(SESSION_KEY,JSON.stringify(n));
    return n;
  }

  async function fetchRows(){
    const s=await ensureSession();
    const rows=await request('/rest/v1/user_datasets?select='+encodeURIComponent(REMOTE_FIELDS)+'&order=updated_at.asc',{headers:headers(s.access_token,false)});
    return Array.isArray(rows)?rows:[];
  }

  async function preparePayload(value,key,s){
    if(typeof window.cloudPreparePayload==='function')return window.cloudPreparePayload(value,key,s);
    return value;
  }
  async function hydratePayload(value,s){
    if(typeof window.cloudHydratePayload==='function')return window.cloudHydratePayload(value,s);
    return value;
  }
  function getDeviceId(){
    if(deviceId)return deviceId;
    deviceId=text(rawRead('runlu_cloud_device_id_v54'));
    if(!deviceId)deviceId='cloudfirst-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2));
    try{sessionStorage.setItem('runlu_cloudfirst_device_v133',deviceId)}catch{}
    return deviceId;
  }

  async function putDataset(key,value){
    const s=await ensureSession();
    const payload=await preparePayload(value,key,s);
    await request('/rest/v1/user_datasets?on_conflict=user_id,dataset_key',{method:'POST',headers:{...headers(s.access_token),Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:s.user.id,dataset_key:key,payload,device_id:getDeviceId()})});
    return true;
  }
  async function deleteDataset(key){
    const s=await ensureSession();
    await request('/rest/v1/user_datasets?user_id=eq.'+encodeURIComponent(s.user.id)+'&dataset_key=eq.'+encodeURIComponent(key),{method:'DELETE',headers:{...headers(s.access_token),Prefer:'return=minimal'}});
    return true;
  }

  function overlay(message='Opening Warehouse Cloud…',sub='Business data is loading directly from the cloud. No warehouse database is being stored on this device.'){
    let el=q('runluCloudFirstBoot');
    if(!el){
      el=document.createElement('div');el.id='runluCloudFirstBoot';
      el.style.cssText='position:fixed;inset:0;z-index:9997;background:rgba(7,22,47,.94);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif';
      el.innerHTML='<div style="max-width:430px"><div style="font-size:13px;letter-spacing:.09em;text-transform:uppercase;opacity:.72">RUNLU Warehouse OS</div><div id="runluCloudFirstBootTitle" style="font-size:25px;font-weight:900;margin-top:10px"></div><div id="runluCloudFirstBootText" style="font-size:13px;line-height:1.55;opacity:.8;margin-top:10px"></div></div>';
      document.body.appendChild(el);
    }
    const t=q('runluCloudFirstBootTitle'),x=q('runluCloudFirstBootText');if(t)t.textContent=message;if(x)x.textContent=sub;el.style.display='flex';
  }
  function hideOverlay(){const el=q('runluCloudFirstBoot');if(el)el.style.display='none'}

  function paint(){
    const pill=q('headerCloudPill');
    if(pill){
      if(paused){pill.className='cloudPill offline';pill.textContent='Migration paused'}
      else if(lastError){pill.className='cloudPill offline';pill.textContent='Not saved'}
      else if(pendingWrites){pill.className='cloudPill syncing';pill.textContent='Saving…'}
      else if(ready){pill.className='cloudPill online';pill.textContent='Cloud Live ✓'}
      else {pill.className='cloudPill syncing';pill.textContent='Cloud opening…'}
    }
    const box=q('runluCloudRecoveryBanner'),title=q('runluCloudRecoveryTitle'),body=q('runluCloudRecoveryText');
    if(box&&ready&&!lastError&&!pendingWrites){box.classList.add('hidden')}
    if(box&&lastError){box.classList.remove('hidden');if(title)title.textContent='Warehouse open · Cloud save needs attention';if(body)body.textContent=lastError+' The last confirmed cloud copy remains authoritative.'}
    document.documentElement.setAttribute('data-runlu-cloud-first',ready?'ready':paused?'paused':'opening');
  }

  function activePage(){return document.querySelector('.page:not(.hidden)')?.id||'home'}
  function rerender(){
    if(typeof window.protectedInputActive==='function'&&window.protectedInputActive())return;
    const id=activePage();
    const map={home:'renderDashboard',products:'renderProducts',inventory:'renderInventory',carpetInventory:'renderCarpetInventory',operations:'renderOperations',ordersHub:'renderOrders',specialOrders:'renderSpecialOrders',receiving:'renderReceiving',warehouseMap:'renderMap',settings:'renderSettings'};
    const fn=map[id]&&window[map[id]];try{if(typeof fn==='function')fn()}catch(e){console.warn('[Build133] refresh render isolated',e)}
  }

  function installVirtualStorage(){
    if(virtualStorageInstalled)return true;
    if(!storage||!storageProto)return false;
    const previousGet=storageProto.getItem,previousSet=storageProto.setItem,previousRemove=storageProto.removeItem;
    if(typeof previousGet!=='function'||typeof previousSet!=='function'||typeof previousRemove!=='function')return false;
    const virtualGet=function(key){
      const k=String(key);if(this===storage&&ready&&isVirtual(k)){const v=ram.get(k);return v===undefined?null:JSON.stringify(v)}
      return previousGet.call(this,key);
    };
    const virtualSet=function(key,value){
      const k=String(key);
      if(this===storage&&ready&&isVirtual(k)){
        const parsed=parse(String(value),undefined);
        if(parsed===undefined)throw new TypeError('Cloud-first business data must be valid JSON.');
        ram.set(k,clone(parsed));
        if(k===DRAFT_KEY)queueDatasetWrite(k,parsed,{draft:true});else queueDatasetWrite(k,parsed);
        return undefined;
      }
      return previousSet.call(this,key,value);
    };
    const virtualRemove=function(key){
      const k=String(key);
      if(this===storage&&ready&&isVirtual(k)){
        if(k===DRAFT_KEY){ram.delete(k);queueDatasetDelete(k,{draft:true});}
        // Business datasets are never deleted by legacy local-cache cleanup paths.
        return undefined;
      }
      return previousRemove.call(this,key);
    };
    virtualGet.__build133=true;virtualGet.__original=previousGet;virtualSet.__build133=true;virtualSet.__original=previousSet;virtualRemove.__build133=true;virtualRemove.__original=previousRemove;
    try{storageProto.getItem=virtualGet;storageProto.setItem=virtualSet;storageProto.removeItem=virtualRemove}catch(e){console.error('[Build133] virtual storage install failed',e);return false}
    virtualStorageInstalled=true;return true;
  }

  function installCoreHooks(){
    if(coreHooksInstalled)return true;
    if(typeof window.load!=='function'||typeof window.loadObj!=='function'||typeof window.save!=='function')return false;
    originalLoad=originalLoad||window.load;originalLoadObj=originalLoadObj||window.loadObj;originalSave=originalSave||window.save;
    const loadWrapped=function(k){if(ready&&isBusiness(k)){const v=ram.get(String(k));return v===undefined?[]:clone(v)}return originalLoad.apply(this,arguments)};
    const loadObjWrapped=function(k){if(ready&&isBusiness(k)){const v=ram.get(String(k));return v===undefined?{}:clone(v)}return originalLoadObj.apply(this,arguments)};
    const saveWrapped=function(k,v){
      if(ready&&isBusiness(k)){
        ram.set(String(k),clone(v));queueDatasetWrite(String(k),v);return true;
      }
      return originalSave.apply(this,arguments);
    };
    // Preserve legacy authority markers so older installers do not stack above Cloud-first.
    Object.assign(saveWrapped,{__build133CloudFirst:true,__build130:true,__build072:true,__build122:true,__build072CarpetRoll:true,__build124SharedRollIdentity:true,__build128CarpetIdentityAuthority:true,__original:originalSave});
    window.load=loadWrapped;window.loadObj=loadObjWrapped;window.save=saveWrapped;coreHooksInstalled=true;return true;
  }

  function queueDatasetWrite(key,value,{draft=false}={}){
    const k=String(key),rev=(revisions.get(k)||0)+1;revisions.set(k,rev);
    const payload=clone(value);pendingWrites++;lastError='';paint();
    const prior=writeChains.get(k)||Promise.resolve();
    const task=prior.catch(()=>{}).then(async()=>{
      await putDataset(k,payload);
      if(revisions.get(k)===rev){confirmed.set(k,clone(payload));lastError=''}
      return true;
    }).catch(err=>{
      console.error('[Build133] cloud write failed',k,err);
      if(revisions.get(k)===rev){
        const good=confirmed.get(k);if(good===undefined)ram.delete(k);else ram.set(k,clone(good));
        lastError=(draft?'Draft not saved: ':'Cloud save failed: ')+String(err?.message||err);
        setTimeout(()=>alert((draft?'Draft was not saved to Warehouse Cloud. ':'Warehouse change was not saved to Cloud. ')+String(err?.message||err)+'\n\nThe last confirmed cloud copy remains unchanged.'),0);
      }
      throw err;
    }).finally(()=>{pendingWrites=Math.max(0,pendingWrites-1);paint();rerender()});
    writeChains.set(k,task);return task;
  }
  function queueDatasetDelete(key,{draft=false}={}){
    const k=String(key),rev=(revisions.get(k)||0)+1;revisions.set(k,rev);pendingWrites++;lastError='';paint();
    const prior=writeChains.get(k)||Promise.resolve();
    const task=prior.catch(()=>{}).then(()=>deleteDataset(k)).then(()=>{if(revisions.get(k)===rev)confirmed.delete(k)}).catch(err=>{
      if(revisions.get(k)===rev){lastError=(draft?'Draft delete failed: ':'Cloud delete failed: ')+String(err?.message||err);const good=confirmed.get(k);if(good!==undefined)ram.set(k,clone(good))}
      throw err;
    }).finally(()=>{pendingWrites=Math.max(0,pendingWrites-1);paint()});writeChains.set(k,task);return task;
  }

  function installDraftHook(){
    if(draftHookInstalled||typeof window.operationDraftPayload!=='function')return false;
    const cloudDraftSave=function(){
      const editor=q('operationEditor');if(!editor||editor.classList.contains('hidden'))return Promise.resolve(false);
      let payload;try{payload=window.operationDraftPayload()}catch(e){return Promise.reject(e)}
      try{operationDraftDirty=true}catch{}
      ram.set(DRAFT_KEY,clone(payload));
      const el=q('operationDraftState');if(el){el.textContent='Saving draft to Cloud…';el.style.color='var(--muted)'}
      const p=queueDatasetWrite(DRAFT_KEY,payload,{draft:true});
      p.then(()=>{if(el){el.textContent='✓ Draft saved to Cloud '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});el.style.color='var(--green)'}}).catch(()=>{if(el){el.textContent='⚠ Draft not saved · Retry';el.style.color='var(--red)'}});
      return p;
    };
    cloudDraftSave.__build133CloudDraft=true;cloudDraftSave.__build129=true;
    window.saveOperationDraftNow=cloudDraftSave;draftHookInstalled=true;return true;
  }

  function disableLegacySync(){
    if(!originalStartCloudPolling&&typeof window.startCloudPolling==='function')originalStartCloudPolling=window.startCloudPolling;
    if(typeof window.stopCloudPolling==='function')try{window.stopCloudPolling()}catch{}
    try{if(window.cloudPollTimer){clearInterval(window.cloudPollTimer);window.cloudPollTimer=null}}catch{}
    window.startCloudPolling=function(){return startRefreshLoop()};
    window.cloudAutoRefresh=async function(){return refreshFromCloud(false)};
    window.cloudDownloadAll=async function(){return refreshFromCloud(true)};
    window.cloudSyncNow=async function(){return refreshFromCloud(true)};
    window.cloudUploadAll=async function(){alert('Cloud-First Pilot is active. Warehouse Cloud is already authoritative; device-wide upload is retired.');return false};
    const oldUpdate=window.updateHeaderCloudPill;
    window.updateHeaderCloudPill=function(){paint();return undefined};window.updateHeaderCloudPill.__build133=true;window.updateHeaderCloudPill.__original=oldUpdate;
  }

  async function refreshFromCloud(announce=false){
    if(!ready||pendingWrites)return false;
    try{
      const s=await ensureSession(),rows=await fetchRows(),byKey=new Map(rows.map(r=>[r.dataset_key,r]));let changed=0;
      for(const key of VIRTUAL_SET){
        if(writeChains.has(key)&&pendingWrites)continue;
        const row=byKey.get(key);if(!row){if(key===DRAFT_KEY){ram.delete(key);confirmed.delete(key)}continue}
        if(rowMs(row)<=Number(remoteUpdated.get(key)||0))continue;
        const v=await hydratePayload(row.payload,s);ram.set(key,clone(v));confirmed.set(key,clone(v));remoteUpdated.set(key,rowMs(row));changed++;
      }
      lastError='';paint();if(changed)rerender();if(announce)alert(changed?`Warehouse Cloud refreshed · ${changed} dataset(s) updated.`:'Warehouse Cloud is current.');return true;
    }catch(e){lastError='Cloud refresh failed: '+String(e?.message||e);paint();if(announce)alert(lastError);return false}
  }
  function startRefreshLoop(){clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshFromCloud(false)},15000);return refreshTimer}

  function conflictKeys(){const v=readJsonRaw(CONFLICT_KEY,[]);return Array.isArray(v)?v.filter(k=>BUSINESS_SET.has(k)):[]}
  function dirtyKeys(){const v=readJsonRaw(DIRTY_KEY,[]);return Array.isArray(v)?v.filter(k=>BUSINESS_SET.has(k)):[]}
  function localPayload(key){const raw=rawRead(key);if(raw==null)return {exists:false,value:null};const value=parse(raw,undefined);return {exists:value!==undefined,value}}
  function seenMs(key){return new Date(rawRead(seenKey(key))||0).getTime()||0}

  async function migrateOldDirty(rows){
    const byKey=new Map(rows.map(r=>[r.dataset_key,r])),dirty=dirtyKeys(),knownConflicts=conflictKeys();
    if(knownConflicts.length)throw new Error('Existing cloud conflict needs review first: '+knownConflicts.join(', '));
    for(const key of dirty){
      const local=localPayload(key);if(!local.exists)continue;
      const row=byKey.get(key),remote=rowMs(row),seen=seenMs(key);
      if(row?.device_id&&row.device_id!==getDeviceId()&&remote>0&&(!seen||remote>seen+500))throw new Error('Cloud changed on another device while '+key+' has an unsent local change. Migration paused to protect both copies.');
      await putDataset(key,local.value);
    }
    // Seed cloud only when a dataset has never existed remotely. Existing cloud rows stay authoritative.
    const fresh=await fetchRows(),freshKeys=new Set(fresh.map(r=>r.dataset_key));
    for(const key of BUSINESS_KEYS){
      if(freshKeys.has(key))continue;const local=localPayload(key);if(local.exists&&hasMeaningful(local.value))await putDataset(key,local.value);
    }
  }

  async function migrateDraft(rows){
    const remote=rows.find(r=>r.dataset_key===DRAFT_KEY),remoteDraft=remote?.payload||null;
    let candidate=null,candidateTime=0;
    const local=localPayload(DRAFT_KEY);if(local.exists&&local.value){candidate=local.value;candidateTime=new Date(local.value.savedAt||0).getTime()||0}
    try{
      const row=await window.RUNLUOperationDraftBuild129?.readFallback?.();
      const p=row?.payload,t=new Date(p?.savedAt||row?.savedAt||0).getTime()||0;if(p&&t>candidateTime){candidate=p;candidateTime=t}
    }catch(e){console.warn('[Build133] local draft fallback read skipped',e)}
    const remoteTime=Math.max(rowMs(remote),new Date(remoteDraft?.savedAt||0).getTime()||0);
    if(candidate&&candidateTime>=remoteTime){await putDataset(DRAFT_KEY,candidate);return candidate}
    return remoteDraft;
  }

  async function hydrateAll(rows){
    const s=await ensureSession(),byKey=new Map(rows.map(r=>[r.dataset_key,r]));
    for(const key of BUSINESS_KEYS){
      const row=byKey.get(key);let v=[];
      if(row){v=await hydratePayload(row.payload,s);remoteUpdated.set(key,rowMs(row))}
      ram.set(key,clone(v));confirmed.set(key,clone(v));
    }
    const d=byKey.get(DRAFT_KEY);if(d){const v=await hydratePayload(d.payload,s);ram.set(DRAFT_KEY,clone(v));confirmed.set(DRAFT_KEY,clone(v));remoteUpdated.set(DRAFT_KEY,rowMs(d))}
  }

  function purgeDeviceBusinessData(){
    for(const key of LOCAL_PURGE_KEYS)rawDelete(key);
    rawDelete(DIRTY_KEY);rawDelete(CONFLICT_KEY);
    // Cloud-first intentionally retires local company-data archives after cloud verification.
    for(const db of ['runlu_warehouse_resilient_cache_v129','runlu_local_archive_v131'])try{indexedDB.deleteDatabase(db)}catch{}
    try{sessionStorage.removeItem('runlu_build132_role_marker_skipped')}catch{}
  }

  function renderCloudFirstSettings(){
    const el=q('cloudStatus');if(el)el.innerHTML='<b>Cloud-First Pilot active</b> · Warehouse Cloud is the business-data source of truth. This device keeps only runtime memory and small sign-in/UI metadata.'+(pendingWrites?`<br><b>${pendingWrites} cloud save(s) pending</b>`:'')+(lastError?`<br><span style="color:#b42318">${lastError}</span>`:'');
    const details=q('cloudSyncDetails');if(details){const count=[...BUSINESS_SET].filter(k=>ram.has(k)).length;details.innerHTML=`<b>Cloud-first datasets in RAM:</b> ${count}<br><b>Persistent company datasets on this browser:</b> 0<br><b>Cloud refresh:</b> every 15 seconds while Warehouse OS is visible`}
  }

  async function bootstrap(){
    if(ready||booting||paused)return ready;booting=true;
    try{
      if(!storage){storage=window.localStorage;storageProto=Object.getPrototypeOf(storage);rawGet=storageProto.getItem;rawSet=storageProto.setItem;rawRemove=storageProto.removeItem}
      const s=currentSession();
      if(!s?.access_token){hideOverlay();lastError='Warehouse Cloud sign-in is required before Cloud-First migration.';paint();return false}
      overlay('Opening Warehouse Cloud…','Checking the cloud copy before removing any company data from this device.');
      await ensureSession();
      let rows=await fetchRows();
      overlay('Verifying cloud authority…','Any unsent local change is being protected before Cloud-First cutover.');
      await migrateOldDirty(rows);
      rows=await fetchRows();
      await migrateDraft(rows);
      rows=await fetchRows();
      overlay('Loading live warehouse data…','Products, inventory, carpet, orders and operations are moving into runtime memory.');
      await hydrateAll(rows);
      installCoreHooks();installVirtualStorage();disableLegacySync();installDraftHook();
      ready=true;paused=false;lastError='';
      purgeDeviceBusinessData();rawWrite(ENABLED_KEY,'1');
      document.documentElement.setAttribute('data-runlu-cloud-first-build',BUILD);
      hideOverlay();paint();renderCloudFirstSettings();rerender();startRefreshLoop();
      console.info('[Build133] Cloud-First Pilot active. Persistent browser business datasets removed after verified cloud hydration.');
      return true;
    }catch(e){
      console.error('[Build133] cutover paused',e);paused=true;lastError='Cloud-First migration paused: '+String(e?.message||e);hideOverlay();paint();
      alert(lastError+'\n\nNo local business data was deleted. Resolve the cloud issue, then reopen Warehouse OS.');return false;
    }finally{booting=false}
  }

  function installLateHooks(){if(ready){installCoreHooks();installVirtualStorage();installDraftHook();disableLegacySync();renderCloudFirstSettings();paint()}}
  function boot(){
    try{storage=window.localStorage;storageProto=Object.getPrototypeOf(storage);rawGet=storageProto.getItem;rawSet=storageProto.setItem;rawRemove=storageProto.removeItem}catch(e){console.error('[Build133] browser storage unavailable',e)}
    bootstrap();
    retryTimer=setInterval(()=>{if(ready){clearInterval(retryTimer);return}if(!paused)bootstrap();},1500);
    window.addEventListener('pageshow',()=>setTimeout(()=>{if(ready){installLateHooks();refreshFromCloud(false)}else if(!paused)bootstrap()},60));
    window.addEventListener('focus',()=>setTimeout(()=>{if(ready){installLateHooks();refreshFromCloud(false)}else if(!paused)bootstrap()},80));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(ready)refreshFromCloud(false);else if(!paused)bootstrap()}});
    window.addEventListener('beforeunload',e=>{if(pendingWrites>0){e.preventDefault();e.returnValue='Warehouse Cloud is still saving changes.'}});
  }

  window.RUNLUCloudFirstBuild133={
    version:BUILD,appVersion:VERSION,get ready(){return ready},get paused(){return paused},get pending(){return pendingWrites},
    bootstrap,refresh:refreshFromCloud,get:key=>clone(ram.get(key)),save:(key,value)=>{if(!isVirtual(key))throw new Error('Not a Cloud-First dataset');ram.set(key,clone(value));return queueDatasetWrite(key,value,{draft:key===DRAFT_KEY})},
    status:()=>({ready,paused,pendingWrites,lastError,businessDatasets:BUSINESS_KEYS.length})
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
