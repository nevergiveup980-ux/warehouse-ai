// RUNLU Warehouse AI V6.12.4 Build090 — Conflict-Isolated Cloud Refresh
(() => {
  if(window.__RUNLU_BUILD090__) return;
  window.__RUNLU_BUILD090__=true;

  const API='https://ekrnknlawekeoszzkamd.supabase.co';
  const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const SESSION='runlu_cloud_session_v54';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const VERSIONS='runlu_cloud_master_record_versions_v680';
  const SUMMARY='runlu_cloud_master_summary_v680';
  const LAST_PULL='runlu_conflict_isolated_last_pull_v690';
  const PM='runlu_product_master_v21';
  const INV='runlu_inventory_records_v21';
  const SETTINGS='runlu_settings_v20';
  const MANAGED=new Set([
    PM,INV,'runlu_orders_v20','runlu_receiving_v50','runlu_tasks_v50',
    'runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52','runlu_cutting_log_v52',
    'runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55',SETTINGS
  ]);

  let busy=false;
  let lastAttempt=0;
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const text=v=>String(v??'').trim();
  const key=(dataset,id)=>dataset+'::'+id;

  function stableId(dataset,row){
    if(dataset===SETTINGS) return '__document__';
    if(!row||typeof row!=='object') return '';
    if(dataset===INV) return text(row.inventoryId||row.id||row.cloudRecordId);
    return text(row.id||row.cloudRecordId||row.roll||row.operationId);
  }

  function protectedKeys(){
    const out=new Set();
    const q=read(QUEUE);if(Array.isArray(q))q.forEach(m=>{if(m?.datasetKey&&m?.recordId)out.add(key(m.datasetKey,m.recordId))});
    const c=read(CONFLICTS);if(Array.isArray(c))c.forEach(m=>{if(m?.datasetKey&&m?.recordId)out.add(key(m.datasetKey,m.recordId))});
    return out;
  }

  function groupRemote(rows){
    const groups=new Map();MANAGED.forEach(k=>groups.set(k,[]));
    for(const r of rows){
      if(!MANAGED.has(r.dataset_key)||r.deleted_at) continue;
      if(r.dataset_key===SETTINGS) groups.set(SETTINGS,r.payload||{});
      else groups.get(r.dataset_key).push(r.payload||{});
    }
    return groups;
  }

  function mergeDataset(dataset,remoteRows,protectedSet){
    if(dataset===SETTINGS){
      if(protectedSet.has(key(SETTINGS,'__document__'))) return;
      if(remoteRows&&typeof remoteRows==='object'&&!Array.isArray(remoteRows)) localStorage.setItem(SETTINGS,JSON.stringify(remoteRows));
      return;
    }
    const local=read(dataset),localRows=Array.isArray(local)?local:[];
    const keep=new Map();
    for(const row of localRows){
      const id=stableId(dataset,row);
      if(id&&protectedSet.has(key(dataset,id))) keep.set(id,row);
    }
    const merged=[];
    for(const row of Array.isArray(remoteRows)?remoteRows:[]){
      const id=stableId(dataset,row);
      if(id&&keep.has(id)){merged.push(keep.get(id));keep.delete(id)}
      else merged.push(row);
    }
    // A queued local-only record has no cloud row yet; preserve it until its own
    // mutation succeeds or the user resolves its conflict.
    keep.forEach(row=>merged.push(row));
    localStorage.setItem(dataset,JSON.stringify(merged));
  }

  function rememberRemote(rows){
    const versions=read(VERSIONS)||{};
    const counts={};
    for(const r of rows){
      versions[key(r.dataset_key,r.record_id)]=Number(r.version||0);
      if(!r.deleted_at) counts[r.dataset_key]=(counts[r.dataset_key]||0)+1;
    }
    localStorage.setItem(VERSIONS,JSON.stringify(versions));
    localStorage.setItem(SUMMARY,JSON.stringify({
      at:new Date().toISOString(),counts,
      totalActive:Object.values(counts).reduce((a,b)=>a+b,0),
      tombstones:rows.filter(r=>r.deleted_at).length,
      conflictIsolatedPull:true
    }));
  }

  function rerender(){
    const calls=['renderProducts','renderInventory','renderOperations','renderOperationsDay','renderCarpetInventory','renderDashboard','renderMap','refreshMemory'];
    for(const name of calls){try{if(typeof window[name]==='function')window[name]()}catch(e){console.warn('[Build090] render isolated',name,e)}}
  }

  async function fetchCloudRows(session){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await fetch(API+'/rest/v1/warehouse_records?select=dataset_key,record_id,payload,version,deleted_at,updated_at,origin&order=dataset_key.asc,record_id.asc',{
        method:'GET',cache:'no-store',signal:controller.signal,
        headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Cache-Control':'no-cache','Pragma':'no-cache'}
      });
      if(!res.ok) throw new Error('Conflict-isolated cloud refresh failed ('+res.status+')');
      const rows=await res.json();return Array.isArray(rows)?rows:[];
    }finally{clearTimeout(timer)}
  }

  async function refresh(reason='manual'){
    if(busy) return false;
    const now=Date.now();if(reason!=='manual'&&now-lastAttempt<1200) return false;lastAttempt=now;
    const cs=read(CONFLICTS);if(!Array.isArray(cs)||!cs.length) return false;
    const session=read(SESSION);if(!session?.access_token||navigator.onLine===false) return false;
    busy=true;
    try{
      const rows=await fetchCloudRows(session);
      const protectedSet=protectedKeys(),groups=groupRemote(rows);
      MANAGED.forEach(dataset=>mergeDataset(dataset,groups.get(dataset),protectedSet));
      rememberRemote(rows);
      localStorage.setItem(LAST_PULL,new Date().toISOString());
      document.documentElement.setAttribute('data-runlu-conflict-isolated-refresh','ok');
      rerender();
      console.info(`[Build090] ${reason}: refreshed cloud data while preserving ${protectedSet.size} queued/conflicted record(s).`);
      return true;
    }catch(e){
      console.warn('[Build090] conflict-isolated refresh',e);
      document.documentElement.setAttribute('data-runlu-conflict-isolated-refresh','error');
      return false;
    }finally{busy=false}
  }

  window.runluConflictIsolatedRefresh=refresh;
  setTimeout(()=>refresh('boot'),1400);
  window.addEventListener('pageshow',()=>setTimeout(()=>refresh('pageshow'),250));
  window.addEventListener('focus',()=>setTimeout(()=>refresh('focus'),180));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>refresh('visible'),180)});
})();
