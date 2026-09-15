// RUNLU Warehouse OS V6.12.36 Build131 · Exact Duplicate Conflict Auto-Resolver.
// If the queued device payload and the current Cloud payload are the same business record,
// the local duplicate mutation is redundant. Keep the authoritative Cloud copy automatically
// instead of asking the warehouse user to clear the same record by hand.
// Materially different records, deletes, and uncertain comparisons remain manual-review only.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD131_EXACT_DUPLICATE_AUTO_RESOLVER__)return;
  window.__RUNLU_BUILD131_EXACT_DUPLICATE_AUTO_RESOLVER__=true;

  const BUILD='131';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const TOTAL='runlu_build131_exact_duplicate_resolved_total';
  const LAST='runlu_build131_exact_duplicate_resolved_last';
  const HOUSEKEEPING=new Set([
    'updatedAt','lastUpdatedAt','updated_at','last_updated_at',
    'syncedAt','lastSyncedAt','syncAt','cloudVersion','_cloudVersion','_cloudUpdatedAt'
  ]);
  let running=false;

  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const readArray=k=>{const v=parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]};
  const text=v=>String(v??'').trim();

  function ignoredKey(k){
    return HOUSEKEEPING.has(k)||k.startsWith('_cloud')||k.startsWith('_runluSync');
  }
  function canonical(v){
    if(Array.isArray(v))return v.map(canonical);
    if(v&&typeof v==='object'){
      const out={};
      for(const k of Object.keys(v).sort()){
        if(ignoredKey(k))continue;
        out[k]=canonical(v[k]);
      }
      return out;
    }
    return v;
  }
  function stable(v){try{return JSON.stringify(canonical(v))}catch{return ''}}
  function businessEquivalent(conflict){
    if(!conflict||text(conflict.op||'upsert').toLowerCase()!=='upsert')return false;
    const device=conflict.devicePayload,cloud=conflict.serverRecord?.payload;
    if(!device||!cloud||typeof device!=='object'||typeof cloud!=='object')return false;
    const a=stable(device),b=stable(cloud);
    return !!a&&a===b;
  }
  function exactDuplicates(){return readArray(CONFLICTS).filter(businessEquivalent)}
  function recordResolved(conflict,reason){
    const total=Number(localStorage.getItem(TOTAL)||0)+1;
    localStorage.setItem(TOTAL,String(total));
    localStorage.setItem(LAST,JSON.stringify({
      at:new Date().toISOString(),reason,datasetKey:conflict.datasetKey||'',recordId:conflict.recordId||'',queueId:conflict.queueId||'',total
    }));
    return total;
  }

  async function sweep(reason='auto'){
    if(running)return {resolved:0,remaining:readArray(CONFLICTS).length,busy:true};
    if(navigator.onLine===false)return {resolved:0,remaining:readArray(CONFLICTS).length,offline:true};
    if(typeof window.runluCloudMasterResolve!=='function')return {resolved:0,remaining:readArray(CONFLICTS).length,ready:false};
    running=true;
    let resolved=0,guard=0;
    const attempted=new Set();
    try{
      while(guard++<50){
        const current=readArray(CONFLICTS);
        const conflict=current.find(c=>businessEquivalent(c)&&!attempted.has(c.queueId));
        if(!conflict)break;
        attempted.add(conflict.queueId);
        const before=current.length;
        // 'cloud' is deliberately used here. It removes only the redundant queued device
        // mutation/conflict and keeps the existing Cloud master record. No tombstone/delete.
        await window.runluCloudMasterResolve(conflict.queueId,'cloud');
        const after=readArray(CONFLICTS).length;
        if(after<before){resolved++;recordResolved(conflict,reason)}
      }
      document.documentElement?.setAttribute('data-runlu-exact-duplicate-auto-resolver',resolved?'resolved':'ready');
      if(resolved)console.info(`[Build131] auto-resolved ${resolved} exact duplicate cloud conflict${resolved===1?'':'s'}; Cloud master copy kept.`);
      return {resolved,remaining:readArray(CONFLICTS).length};
    }catch(e){
      console.warn('[Build131] exact duplicate auto-resolve stopped',e?.message||e);
      document.documentElement?.setAttribute('data-runlu-exact-duplicate-auto-resolver','error');
      return {resolved,remaining:readArray(CONFLICTS).length,error:e?.message||String(e)};
    }finally{running=false}
  }

  function schedule(reason,delay=220){setTimeout(()=>sweep(reason),delay)}
  schedule('boot',700);
  window.addEventListener('pageshow',()=>schedule('pageshow'));
  window.addEventListener('focus',()=>schedule('focus'));
  window.addEventListener('online',()=>schedule('online',120));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule('visible')});
  setInterval(()=>{if(document.visibilityState==='visible'&&exactDuplicates().length)sweep('watch')},5000);

  window.RUNLUExactDuplicateConflictAutoResolverBuild131={
    version:BUILD,canonical,businessEquivalent,exactDuplicates,sweep,
    get total(){return Number(localStorage.getItem(TOTAL)||0)},
    get last(){return parse(localStorage.getItem(LAST)||'null')}
  };
})();
