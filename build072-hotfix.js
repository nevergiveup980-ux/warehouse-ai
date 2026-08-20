// RUNLU Warehouse AI V6.8.0 Build072 — Cloud Master + Offline Queue
(() => {
  if (window.__RUNLU_BUILD072__) return;
  window.__RUNLU_BUILD072__ = true;

  const VERSION='6.8.0', BUILD='072';
  const API='https://ekrnknlawekeoszzkamd.supabase.co';
  const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const SESSION='runlu_cloud_session_v54';
  const ENABLED='runlu_cloud_sync_enabled_v54';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const VERSIONS='runlu_cloud_master_record_versions_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const BOOTSTRAP='runlu_cloud_master_bootstrap_v680';
  const DEVICE='runlu_cloud_master_device_v680';
  const LAST_SYNC='runlu_cloud_master_last_sync_v680';
  const LAST_ERROR='runlu_cloud_master_last_error_v680';
  const SUMMARY='runlu_cloud_master_summary_v680';

  const MANAGED=new Set([
    'runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20','runlu_receiving_v50','runlu_tasks_v50',
    'runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52','runlu_cutting_log_v52',
    'runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55','runlu_settings_v20'
  ]);
  const PM='runlu_product_master_v21', INV='runlu_inventory_records_v21';

  let applying=false, syncBusy=false, flushTimer=null, stateCache=null;
  let syncChain=Promise.resolve(true);
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ').trim();
  const nowIso=()=>new Date().toISOString();
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const parseMs=v=>{const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0};
  const rowMs=r=>Math.max(parseMs(r?.lastUpdatedAt),parseMs(r?.updatedAt),parseMs(r?.updated),parseMs(r?.completedAt),parseMs(r?.receivedAt),parseMs(r?.createdAt),parseMs(r?.created),parseMs(r?.date));
  const eq=(a,b)=>{try{return JSON.stringify(a)===JSON.stringify(b)}catch{return false}};

  function deviceId(){
    let id=localStorage.getItem(DEVICE);if(id)return id;
    id='DEV-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
    localStorage.setItem(DEVICE,id);return id;
  }
  function sessionLocal(){return read(SESSION)}
  async function ensureSession(){
    if(typeof window.cloudEnsureSession==='function')return await window.cloudEnsureSession();
    return sessionLocal();
  }
  function headers(s,extra={}){return {apikey:KEY,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json',...extra}}
  async function request(path,opts={}){
    const s=opts.session||await ensureSession();if(!s)throw new Error('Cloud sign-in required.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await fetch(API+path,{...opts,session:undefined,headers:{...headers(s),...(opts.headers||{})},signal:controller.signal});
      let body=null;try{body=await res.json()}catch{}
      if(!res.ok)throw new Error(body?.message||body?.error||body?.hint||('Cloud Master request failed ('+res.status+')'));
      return body;
    }catch(e){if(e?.name==='AbortError')throw new Error('Cloud Master request timed out.');throw e}finally{clearTimeout(timer)}
  }

  function stableId(dataset,row){
    if(dataset==='runlu_settings_v20')return '__document__';
    if(!row||typeof row!=='object')return '';
    if(dataset===INV)return text(row.inventoryId||row.id||row.cloudRecordId);
    return text(row.id||row.cloudRecordId||row.roll||row.operationId);
  }
  function productIncompatible(a,b){
    if(!a||!b)return false;
    if(norm(a.name)&&norm(b.name)&&norm(a.name)!==norm(b.name))return true;
    if(norm(a.sku)&&norm(b.sku)&&norm(a.sku)!==norm(b.sku))return true;
    if(norm(a.color)&&norm(b.color)&&norm(a.color)!==norm(b.color))return true;
    return false;
  }
  function versionKey(dataset,id){return dataset+'::'+id}
  function versions(){return read(VERSIONS)||{}}
  function setVersion(dataset,id,v){const map=versions();if(v==null)delete map[versionKey(dataset,id)];else map[versionKey(dataset,id)]=Number(v);write(VERSIONS,map)}
  function getVersion(dataset,id){const v=versions()[versionKey(dataset,id)];return Number.isFinite(Number(v))?Number(v):0}
  function queue(){const q=read(QUEUE);return Array.isArray(q)?q:[]}
  function conflicts(){const x=read(CONFLICTS);return Array.isArray(x)?x:[]}
  function saveConflicts(x){write(CONFLICTS,x);renderPanel()}
  function qid(){return 'Q-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}

  function enqueue(dataset,id,op,payload,baseVersion){
    if(!dataset||!id)return;
    let q=queue(),idx=q.findIndex(x=>x.datasetKey===dataset&&x.recordId===id&&!x.blocked);
    if(idx>=0){
      const cur=q[idx];
      if(cur.baseVersion===0&&op==='delete'){q.splice(idx,1);write(QUEUE,q);renderPanel();return}
      q[idx]={...cur,op,payload:clone(payload),queuedAt:nowIso(),attempts:0};
    }else q.push({id:qid(),datasetKey:dataset,recordId:id,op,payload:clone(payload),baseVersion:Number(baseVersion||0),queuedAt:nowIso(),attempts:0,blocked:false});
    write(QUEUE,q);renderPanel();scheduleFlush();
  }
  function diffAndQueue(dataset,before,after){
    if(!MANAGED.has(dataset)||applying)return;
    if(dataset==='runlu_settings_v20'){
      if(!eq(before,after))enqueue(dataset,'__document__','upsert',after,getVersion(dataset,'__document__'));
      return;
    }
    if(!Array.isArray(before))before=[];if(!Array.isArray(after))after=[];
    const a=new Map(),b=new Map();
    before.forEach(r=>{const id=stableId(dataset,r);if(id)a.set(id,r)});
    after.forEach(r=>{const id=stableId(dataset,r);if(id)b.set(id,r)});
    for(const [id,row] of b){const old=a.get(id);if(!old||!eq(old,row))enqueue(dataset,id,'upsert',row,getVersion(dataset,id))}
    for(const [id,row] of a){if(!b.has(id))enqueue(dataset,id,'delete',row,getVersion(dataset,id))}
  }

  async function fetchRecords(s){
    const rows=await request('/rest/v1/warehouse_records?select=dataset_key,record_id,payload,version,deleted_at,updated_at,origin&order=dataset_key.asc,record_id.asc',{method:'GET',session:s});
    return Array.isArray(rows)?rows:[];
  }
  async function fetchState(s){
    const rows=await request('/rest/v1/warehouse_cloud_state?select=user_id,mode,protocol_version,legacy_imported_at,activated_at,updated_at,metadata&limit=1',{method:'GET',session:s});
    stateCache=Array.isArray(rows)&&rows[0]?rows[0]:null;return stateCache;
  }
  async function setState(s,mode,extra={}){
    const body={user_id:s.user.id,mode,protocol_version:1,updated_at:nowIso(),...extra};
    const rows=await request('/rest/v1/warehouse_cloud_state?on_conflict=user_id',{method:'POST',session:s,headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)});
    stateCache=Array.isArray(rows)&&rows[0]?rows[0]:body;return stateCache;
  }
  async function applyMutation(s,m){
    return await request('/rest/v1/rpc/warehouse_apply_mutation',{method:'POST',session:s,body:JSON.stringify({
      p_dataset_key:m.datasetKey,p_record_id:m.recordId,p_payload:m.payload||{},p_base_version:Number(m.baseVersion||0),p_delete:m.op==='delete',p_device_id:deviceId()
    })});
  }

  function rememberRemote(rows){
    const map={};for(const r of rows)map[versionKey(r.dataset_key,r.record_id)]=Number(r.version||0);write(VERSIONS,map);
    const counts={};for(const r of rows)if(!r.deleted_at)counts[r.dataset_key]=(counts[r.dataset_key]||0)+1;
    write(SUMMARY,{at:nowIso(),counts,totalActive:Object.values(counts).reduce((a,b)=>a+b,0),tombstones:rows.filter(r=>r.deleted_at).length});
  }
  function remoteMap(rows){const m=new Map();rows.forEach(r=>m.set(versionKey(r.dataset_key,r.record_id),r));return m}

  function captureLocalDelta(rows){
    const remote=remoteMap(rows),audit=[];
    for(const dataset of MANAGED){
      const local=read(dataset);if(local==null)continue;
      if(dataset==='runlu_settings_v20'){
        const rr=remote.get(versionKey(dataset,'__document__'));
        if(!rr)enqueue(dataset,'__document__','upsert',local,0);
        else if(rowMs(local)>rowMs(rr.payload)&&!eq(local,rr.payload)&&rr.origin!=='cloud-master-repair')enqueue(dataset,'__document__','upsert',local,rr.version);
        continue;
      }
      if(!Array.isArray(local))continue;
      for(const row of local){
        const id=stableId(dataset,row);if(!id)continue;
        const rr=remote.get(versionKey(dataset,id));
        if(!rr){enqueue(dataset,id,'upsert',row,0);audit.push({dataset,id,action:'adopt-local-only'});continue}
        if(rr.origin==='cloud-master-repair')continue;
        if(dataset===PM&&productIncompatible(row,rr.payload)){audit.push({dataset,id,action:'cloud-identity-kept',device:[row.name,row.color,row.sku].filter(Boolean).join(' · '),cloud:[rr.payload?.name,rr.payload?.color,rr.payload?.sku].filter(Boolean).join(' · ')});continue}
        if(rowMs(row)>rowMs(rr.payload)+1000&&!eq(row,rr.payload)){enqueue(dataset,id,'upsert',row,rr.version);audit.push({dataset,id,action:'adopt-newer-local'})}
      }
    }
    write(BOOTSTRAP,{capturedAt:nowIso(),audit});return audit;
  }

  async function flushQueue(s,{allowShadow=false}={}){
    const st=stateCache||await fetchState(s);if(st?.mode!=='active'&&!allowShadow)return {flushed:0,pending:queue().length};
    let q=queue(),flushed=0,cs=conflicts();
    for(let i=0;i<q.length;i++){
      const m=q[i];if(m.blocked)continue;
      try{
        m.attempts=Number(m.attempts||0)+1;
        const res=await applyMutation(s,m);
        if(res?.status==='conflict'){
          m.blocked=true;m.serverRecord=res.record||null;m.reason=res.reason||'version_mismatch';
          cs=cs.filter(c=>c.queueId!==m.id);cs.push({queueId:m.id,at:nowIso(),datasetKey:m.datasetKey,recordId:m.recordId,op:m.op,devicePayload:m.payload,serverRecord:res.record||null,reason:m.reason});
          continue;
        }
        if(res?.status!=='ok')throw new Error('Cloud Master mutation was not confirmed.');
        const rec=res.record||{};setVersion(m.datasetKey,m.recordId,rec.version||m.baseVersion+1);
        cs=cs.filter(c=>c.queueId!==m.id);q[i]=null;flushed++;
      }catch(e){m.lastError=e.message||String(e);localStorage.setItem(LAST_ERROR,m.lastError);if(navigator.onLine===false)break}
    }
    q=q.filter(Boolean);write(QUEUE,q);saveConflicts(cs);renderPanel();return {flushed,pending:q.length};
  }

  function sortDataset(dataset,rows){
    if(dataset===PM)return rows.sort((a,b)=>text(a.name).localeCompare(text(b.name))||text(a.color).localeCompare(text(b.color)));
    if(dataset===INV)return rows;
    return rows.sort((a,b)=>rowMs(b)-rowMs(a));
  }
  function applyRemoteLocally(rows){
    const groups=new Map();for(const k of MANAGED)groups.set(k,[]);
    for(const r of rows){setVersion(r.dataset_key,r.record_id,r.version);if(r.deleted_at)continue;if(!MANAGED.has(r.dataset_key))continue;if(r.dataset_key==='runlu_settings_v20'){groups.set(r.dataset_key,r.payload);continue}groups.get(r.dataset_key).push(clone(r.payload))}
    applying=true;
    try{
      for(const [k,v] of groups){if(k==='runlu_settings_v20'){if(v&&!Array.isArray(v))localStorage.setItem(k,JSON.stringify(v));continue}localStorage.setItem(k,JSON.stringify(sortDataset(k,v)))}
    }finally{applying=false}
    rememberRemote(rows);
    try{window.renderProducts?.();window.renderInventory?.();window.renderOperations?.();window.renderCarpetInventory?.();window.renderDashboard?.();window.renderMap?.();window.refreshMemory?.()}catch(e){console.warn('[Build072] render after cloud pull',e)}
  }

  function clearLegacyConflictState(){
    try{(window.cloudConflictKeys?.()||[]).forEach(k=>window.clearCloudConflict?.(k));(window.cloudDirtyKeys?.()||[]).filter(k=>MANAGED.has(k)).forEach(k=>window.clearCloudDirty?.(k))}catch{}
  }
  async function activateIfNeeded(s){
    let st=await fetchState(s);if(st?.mode==='active')return st;
    const rows=await fetchRecords(s);rememberRemote(rows);captureLocalDelta(rows);
    await flushQueue(s,{allowShadow:true});
    if(conflicts().length){await setState(s,'paused',{metadata:{reason:'record_conflict_during_activation',paused_at:nowIso()}});throw new Error('Cloud Master activation paused because a real record-level conflict needs review. No whole dataset was overwritten.');}
    st=await setState(s,'active',{activated_at:nowIso(),activated_by:deviceId(),metadata:{legacy_source:'user_datasets',activation:'Build072 after local-delta capture'}});
    clearLegacyConflictState();return st;
  }

  async function pullCloud(s){const rows=await fetchRecords(s);applyRemoteLocally(rows);localStorage.setItem(LAST_SYNC,nowIso());localStorage.removeItem(LAST_ERROR);clearLegacyConflictState();renderPanel();return rows}
  async function syncPass({silent=false}={}){
    syncBusy=true;renderPanel();
    try{
      const s=await ensureSession();if(!s)throw new Error('Cloud sign-in required.');
      if(navigator.onLine===false)throw new Error('Offline — changes are safely queued on this device.');
      await activateIfNeeded(s);await flushQueue(s);if(conflicts().length)throw new Error('A record-level cloud conflict needs review before that record can sync.');
      await pullCloud(s);if(!silent)alert('Cloud Master synchronized. Supabase is the authoritative warehouse record; this device is now refreshed from cloud.');return true;
    }catch(e){localStorage.setItem(LAST_ERROR,e.message||String(e));if(!silent&&navigator.onLine!==false)alert('Cloud Master sync stopped: '+(e.message||e));renderPanel();return false}
    finally{syncBusy=false;renderPanel()}
  }
  function sync(options={}){
    // Every request is serialized. Previously, a save that landed while another
    // sync was running returned false and its scheduled flush was lost until a
    // later focus/online event. The chain guarantees a second pass for it.
    const run=()=>syncPass(options);
    const pending=syncChain.then(run,run);
    syncChain=pending.catch(()=>false);
    return pending;
  }
  sync.__build069=true;sync.__build071=true;sync.__build072=true;
  window.runluCloudMasterSync=sync;

  function scheduleFlush(){if(flushTimer)clearTimeout(flushTimer);flushTimer=setTimeout(()=>sync({silent:true}),700)}

  function installSaveWrapper(){
    const current=window.save;if(typeof current!=='function'||current.__build072)return false;
    const original=current;
    const wrapped=function(k,v){
      if(!MANAGED.has(k)||applying)return original.apply(this,arguments);
      const before=read(k),encoded=JSON.stringify(v);
      try{localStorage.setItem(k,encoded)}catch(e){alert('This device could not save the local cache. No cloud overwrite was attempted.');return false}
      diffAndQueue(k,before,v);return true;
    };
    wrapped.__build072=true;wrapped.__original=original;window.save=wrapped;return true;
  }
  function installCloudWrappers(){
    window.cloudSyncNow=sync;window.cloudSyncNow.__build069=true;window.cloudSyncNow.__build071=true;window.cloudSyncNow.__build072=true;
    window.flushAndVerifyDatasets=async()=>{const ok=await sync({silent:true});if(!ok)throw new Error(localStorage.getItem(LAST_ERROR)||'Cloud Master verification failed.');return true};
    window.cloudDownloadAll=async()=>sync({silent:false});
    if(typeof window.cloudUploadAll==='function')window.cloudUploadAll=async()=>sync({silent:false});
  }

  function conflictSummary(c){
    const d=c.devicePayload||{},s=c.serverRecord?.payload||{};
    const left=[d.name||d.collection||d.product,d.color||d.colour,d.location,d.poNumber||d.po,d.quantity!=null?`${d.quantity} ${d.unit||''}`:''].filter(Boolean).join(' · ');
    const right=[s.name||s.collection||s.product,s.color||s.colour,s.location,s.poNumber||s.po,s.quantity!=null?`${s.quantity} ${s.unit||''}`:''].filter(Boolean).join(' · ');
    return {left:left||c.recordId,right:right||c.recordId};
  }
  window.runluCloudMasterResolve=async function(queueId,action){
    let q=queue(),idx=q.findIndex(x=>x.id===queueId),cs=conflicts(),c=cs.find(x=>x.queueId===queueId);if(idx<0||!c)return;
    const m=q[idx],server=c.serverRecord||{},sv=Number(server.version||0);
    if(action==='cloud'){
      q.splice(idx,1);cs=cs.filter(x=>x.queueId!==queueId);write(QUEUE,q);saveConflicts(cs);await sync({silent:true});return;
    }
    if(action==='device'){
      m.baseVersion=sv;m.blocked=false;delete m.serverRecord;delete m.reason;write(QUEUE,q);cs=cs.filter(x=>x.queueId!==queueId);saveConflicts(cs);await sync({silent:true});return;
    }
    if(action==='delete'){
      if(!confirm('Delete this cloud record as a duplicate?\n\nA cloud tombstone will be written so an old device cannot resurrect it.'))return;
      m.op='delete';m.baseVersion=sv;m.blocked=false;m.payload=m.payload||server.payload||{};write(QUEUE,q);cs=cs.filter(x=>x.queueId!==queueId);saveConflicts(cs);await sync({silent:true});
    }
  };

  function renderPanel(){
    const status=document.getElementById('cloudStatus');if(!status)return false;
    let box=document.getElementById('build072CloudMasterPanel');if(!box){box=document.createElement('div');box.id='build072CloudMasterPanel';status.insertAdjacentElement('afterend',box)}
    const q=queue(),cs=conflicts(),last=localStorage.getItem(LAST_SYNC)||'',err=localStorage.getItem(LAST_ERROR)||'',sum=read(SUMMARY)||{};
    const mode=stateCache?.mode||'checking';
    const online=navigator.onLine!==false;
    const conflictHtml=cs.slice(0,8).map(c=>{const x=conflictSummary(c);return `<div style="margin-top:10px;padding:10px;border:1px solid #efc2c7;border-radius:10px;background:#fff7f8"><b>${escapeHtml(label(c.datasetKey))}</b> · ${escapeHtml(c.recordId)}<br><small><b>This device:</b> ${escapeHtml(x.left)}<br><b>Cloud:</b> ${escapeHtml(x.right)}</small><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px"><button onclick="runluCloudMasterResolve('${escapeAttr(c.queueId)}','cloud')">Use Cloud</button><button class="blue" onclick="runluCloudMasterResolve('${escapeAttr(c.queueId)}','device')">Apply Device</button><button class="red" onclick="runluCloudMasterResolve('${escapeAttr(c.queueId)}','delete')">Delete Duplicate</button></div></div>`}).join('');
    box.style.cssText='margin:14px 0;padding:14px;border:1px solid #9fd3b1;background:#f2fbf5;border-radius:14px;color:#163d27;line-height:1.5';
    box.innerHTML=`<div style="font-weight:900;font-size:17px">☁️ Cloud Master</div><div><b>${mode==='active'?'ACTIVE — Supabase is the warehouse master record':mode==='paused'?'PAUSED — record review required':'Preparing record-level cloud master'}</b></div><div>This phone/computer is now a cache and offline work station, not a competing master database.</div><div style="margin-top:7px"><b>Network:</b> ${online?'Online':'Offline'} · <b>Offline queue:</b> ${q.length} · <b>Record conflicts:</b> ${cs.length}${sum.totalActive!=null?` · <b>Cloud records:</b> ${sum.totalActive}`:''}</div>${last?`<div><b>Last Cloud Master sync:</b> ${escapeHtml(new Date(last).toLocaleString())}</div>`:''}${err?`<div style="color:#9b2c2c"><b>Last issue:</b> ${escapeHtml(err)}</div>`:''}<button id="build072SyncBtn" class="green" style="margin-top:10px">${syncBusy?'Syncing Cloud Master…':'Sync Cloud Master Now'}</button><div style="margin-top:9px;font-size:13px;color:#496455">Legacy whole-dataset Upload / Download / Keep Device / Keep Cloud actions are retired under Build072.</div>${conflictHtml}`;
    const btn=document.getElementById('build072SyncBtn');if(btn){btn.disabled=syncBusy;btn.onclick=()=>sync({silent:false})}
    retireLegacyButtons();showVersion();return true;
  }
  function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function escapeAttr(s){return String(s??'').replace(/['\\]/g,'')}
  function label(k){try{return window.cloudDatasetLabel?.(k)||k}catch{return k}}
  function retireLegacyButtons(){
    document.querySelectorAll('button').forEach(b=>{
      if(b.id==='build072SyncBtn')return;
      const t=text(b.textContent);
      if(/Keep Cloud for Conflict Only|Keep This Device for Conflict Only|Upload This Device|Download Cloud Data|Safe Merge Both Sides|Lifecycle Safe Merge/i.test(t)){b.style.display='none';b.disabled=true}
    });
    const notice=document.getElementById('build069MergeNotice');if(notice)notice.style.display='none';
  }
  function showVersion(){const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;document.documentElement.setAttribute('data-runlu-build',BUILD)}

  function install(){showVersion();installSaveWrapper();installCloudWrappers();renderPanel();retireLegacyButtons()}
  function boot(){install();setTimeout(()=>sync({silent:true}),900);let n=0;const t=setInterval(()=>{install();if(++n>300)clearInterval(t)},200);window.addEventListener('online',()=>sync({silent:true}));window.addEventListener('offline',renderPanel)}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
