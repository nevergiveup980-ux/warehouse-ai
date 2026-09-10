// RUNLU Warehouse OS Build118 · live Command Center history source repair.
// Build117 proved the UI path but read the legacy user_datasets blob. Build118 reads the
// current per-record Warehouse Cloud table instead, merges it with local/offline records,
// and remains display-only: no inventory or warehouse transaction mutation occurs here.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD118_COMMAND_HISTORY__)return;
  window.__RUNLU_BUILD118_COMMAND_HISTORY__=true;

  const KEY='runlu_operations_log_v52';
  const q=id=>document.getElementById(id);
  let baseOperationRecords=null,cloudRecords=[],installed=false,busy=false,lastSync='';

  const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null};
  function identity(x={}){
    const id=num(x.id);if(id)return `id:${id}`;
    return 'fp:'+[
      x.date||'',x.time||'',x.type||'',x.po||'',x.roll||'',x.product||x.collection||'',
      x.colour||'',Number(x.quantity||0),x.unit||'',x.location||'',x.customer||x.supplier||''
    ].map(v=>String(v).trim().toLowerCase()).join('|');
  }
  function stamp(x={}){
    for(const v of [x._cloudUpdatedAt,x.updatedAt,x.completedAt,x.appliedAt,x.reconciledAt,x.createdAt]){
      const n=Date.parse(v||'');if(Number.isFinite(n))return n;
    }
    const n=Date.parse(`${x.date||''}T${x.time||'00:00'}:00`);return Number.isFinite(n)?n:0;
  }
  function rowToOperation(row={}){
    const p=row.payload&&typeof row.payload==='object'?row.payload:{};
    const id=num(p.id)||num(row.record_id);
    return {...p,id:id||p.id||row.record_id,_cloudUpdatedAt:row.updated_at||p.updatedAt||''};
  }
  function merge(baseRows,liveRows){
    const map=new Map();
    for(const row of baseRows||[]){const k=identity(row),prior=map.get(k);if(!prior||stamp(row)>=stamp(prior))map.set(k,row)}
    for(const row of liveRows||[]){
      const k=identity(row),prior=map.get(k);
      // warehouse_records is the active cloud source. Prefer it unless this device has a
      // demonstrably newer unsynced local copy of the same operation.
      if(!prior||stamp(row)>=stamp(prior))map.set(k,row);
    }
    return [...map.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||''))||stamp(b)-stamp(a));
  }
  function ensurePatch(){
    if(installed)return true;
    if(typeof window.operationRecords!=='function')return false;
    baseOperationRecords=window.operationRecords;
    window.operationRecords=function(){
      let base=[];try{base=baseOperationRecords()}catch(e){console.warn('[Build118] base history:',e?.message||e)}
      return merge(base,cloudRecords);
    };
    installed=true;return true;
  }
  function ensureUI(){
    const old=q('commandHistoryState117');if(old)old.style.display='none';
    const count=q('operationsCount');if(!count||q('commandHistoryState118'))return;
    const row=document.createElement('div');row.id='commandHistoryState118';row.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:7px;font-size:11px;color:var(--muted)';
    row.innerHTML='<span id="commandHistoryText118">History: local cache</span><button type="button" id="commandHistoryRefresh118" style="padding:6px 9px;font-size:11px">Refresh History</button>';
    count.insertAdjacentElement('afterend',row);
    q('commandHistoryRefresh118')?.addEventListener('click',()=>refresh(true));
  }
  function state(text,warn=false){ensureUI();const el=q('commandHistoryText118');if(!el)return;el.textContent=text;el.style.color=warn?'#8b5a00':'#176b40';el.style.fontWeight='800'}
  function rerender(){
    try{window.renderOperationsDays?.()}catch(_){}
    try{if(!q('operationsDay')?.classList?.contains('hidden'))window.renderOperationsDay?.()}catch(_){}
    try{window.renderDashboard?.()}catch(_){}
  }
  async function refresh(show=false){
    if(busy)return;busy=true;ensurePatch();ensureUI();state('History: checking live cloud…',true);
    try{
      if(typeof window.cloudEnsureSession!=='function'||typeof window.cloudRequest!=='function'||typeof window.cloudHeaders!=='function')throw new Error('Cloud functions are not ready yet.');
      const s=await window.cloudEnsureSession();if(!s)throw new Error('Warehouse Cloud sign-in is required.');
      const path='/rest/v1/warehouse_records?select=record_id,payload,version,updated_at&user_id=eq.'+encodeURIComponent(s.user.id)+'&dataset_key=eq.'+encodeURIComponent(KEY)+'&deleted_at=is.null&order=updated_at.asc&limit=1000';
      const rows=await window.cloudRequest(path,{headers:window.cloudHeaders(s.access_token,false)});
      if(!Array.isArray(rows))throw new Error('Live Operations response is not a record list.');
      cloudRecords=rows.map(rowToOperation);
      lastSync=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const merged=window.operationRecords();
      state(`History: Live Cloud ✓ · ${cloudRecords.length} cloud · ${merged.length} shown · ${lastSync}`);
      rerender();
      if(show)alert(`Command Center live history refreshed: ${cloudRecords.length} cloud record(s), ${merged.length} shown.`);
    }catch(e){
      console.warn('[Build118] live Command Center history:',e?.message||e);
      state(`History: local cache · ${e?.message||'live cloud unavailable'}`,true);
      if(show)alert('Live history refresh could not reach Warehouse Cloud. Local/offline history remains available.\n\n'+(e?.message||e));
    }finally{busy=false}
  }
  function boot(){
    ensurePatch();ensureUI();rerender();
    [350,900,1800,3200].forEach(ms=>setTimeout(()=>refresh(false),ms));
    const mo=new MutationObserver(()=>{ensurePatch();ensureUI()});mo.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(b&&(b.getAttribute('onclick')||'').includes("showPage('operations')"))setTimeout(()=>refresh(false),120)},true);
    window.addEventListener('focus',()=>refresh(false));
    window.addEventListener('pageshow',()=>refresh(false));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh(false)});
    setInterval(()=>{if(document.visibilityState==='visible'&&(!q('operations')?.classList?.contains('hidden')||!q('operationsDay')?.classList?.contains('hidden')))refresh(false)},15000);
  }

  window.RUNLUCommandCenterHistoryBuild118={refresh,merge,rowToOperation,version:'118'};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
