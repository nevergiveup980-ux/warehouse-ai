// RUNLU Warehouse OS Build117 · Command Center cloud-first history recovery.
// Reads the Operations dataset directly from Supabase for Command Center history,
// merges it with this device's local/offline records by stable identity, and never
// mutates inventory, carpet balances, cuts, transfers, shipping, or receiving.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD117_COMMAND_HISTORY__) return;
  window.__RUNLU_BUILD117_COMMAND_HISTORY__ = true;

  const KEY='runlu_operations_log_v52';
  const q=id=>document.getElementById(id);
  let baseOperationRecords=null;
  let remoteOperations=[];
  let busy=false;
  let lastSync='';
  let installed=false;

  function supplierType(type){
    return ['Carpet Receiving','Supplier Pickup / Receiving / Put-away','Return to Supplier'].includes(type);
  }
  function localToday(){
    const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function normalize(x={}){
    const type=(x.type==='Supplier Return'?'Return to Supplier':x.type)||'Other',legacy=x.name||'';
    const rawId=x.id;
    let id=Number(rawId);
    if(!Number.isFinite(id)||id<=0){
      const seed=[x.date,x.time,type,x.po,x.roll,x.product,x.collection,x.colour,x.location,x.createdAt].join('|');
      let h=2166136261;
      for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619)}
      id=Math.abs(h>>>0)||1;
    }
    return {...x,id,date:x.date||localToday(),time:x.time||'',status:x.status||'Waiting',type,source:x.source||'Manual',operator:x.operator||'John',sales:x.sales||'',po:x.po||'',customer:x.customer||(supplierType(type)?'':legacy),supplier:x.supplier||(supplierType(type)?legacy:''),itemStatus:x.itemStatus||'Waiting',name:legacy,inventoryMode:x.inventoryMode||'Record Only',productId:x.productId||'',inventoryRecordId:x.inventoryRecordId||'',product:x.product||'',collection:x.collection||'',colour:x.colour||'',roll:x.roll||'',quantity:Number(x.quantity)||0,unit:x.unit||'',location:x.location||'',toLocation:x.toLocation||'',notes:x.notes||'',items:Array.isArray(x.items)?x.items:[],impactApplied:!!x.impactApplied};
  }
  function identity(x){
    if(x?.id!==undefined&&x?.id!==null&&String(x.id)!=='')return `id:${String(x.id)}`;
    return 'fp:'+[
      x?.date||'',x?.time||'',x?.type||'',x?.po||'',x?.roll||'',x?.product||x?.collection||'',
      x?.colour||'',Number(x?.quantity||0),x?.unit||'',x?.location||'',x?.customer||x?.supplier||''
    ].map(v=>String(v).trim().toLowerCase()).join('|');
  }
  function stamp(x){
    for(const v of [x?.updatedAt,x?.completedAt,x?.appliedAt,x?.reconciledAt,x?.createdAt]){
      const n=Date.parse(v||'');if(Number.isFinite(n))return n;
    }
    const n=Date.parse(`${x?.date||''}T${x?.time||'00:00'}:00`);return Number.isFinite(n)?n:0;
  }
  function merge(localRows,cloudRows){
    const map=new Map();
    for(const row of cloudRows||[]){const n=normalize(row);map.set(identity(n),n)}
    for(const row of localRows||[]){
      const n=normalize(row),k=identity(n),prior=map.get(k);
      if(!prior||stamp(n)>=stamp(prior))map.set(k,n);
    }
    return [...map.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||''))||stamp(b)-stamp(a));
  }
  function ensurePatch(){
    if(installed)return true;
    if(typeof window.operationRecords!=='function')return false;
    baseOperationRecords=window.operationRecords;
    window.operationRecords=function(){
      let local=[];try{local=baseOperationRecords()}catch(e){console.warn('[Build117] local operations:',e?.message||e)}
      return merge(local,remoteOperations);
    };
    installed=true;
    return true;
  }
  function ensureUI(){
    const count=q('operationsCount');if(!count||q('commandHistoryState117'))return;
    const row=document.createElement('div');row.id='commandHistoryState117';row.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:7px;font-size:11px;color:var(--muted)';
    row.innerHTML='<span id="commandHistoryText117">History: local cache</span><button type="button" id="commandHistoryRefresh117" style="padding:6px 9px;font-size:11px">Refresh History</button>';
    count.insertAdjacentElement('afterend',row);
    q('commandHistoryRefresh117')?.addEventListener('click',()=>refresh(true));
  }
  function state(text,warn=false){
    ensureUI();const el=q('commandHistoryText117');if(!el)return;el.textContent=text;el.style.color=warn?'#8b5a00':'#176b40';el.style.fontWeight='800';
  }
  function rerender(){
    try{window.renderOperationsDays?.()}catch(_){}
    try{if(!q('operationsDay')?.classList?.contains('hidden'))window.renderOperationsDay?.()}catch(_){}
    try{window.renderDashboard?.()}catch(_){}
  }
  async function refresh(showAlert=false){
    if(busy)return;busy=true;ensurePatch();ensureUI();state('History: checking cloud…',true);
    try{
      if(typeof window.cloudEnsureSession!=='function'||typeof window.cloudRequest!=='function'||typeof window.cloudHeaders!=='function'||typeof window.cloudHydratePayload!=='function')throw new Error('Cloud functions are not ready yet.');
      const s=await window.cloudEnsureSession();if(!s)throw new Error('Warehouse Cloud sign-in is required.');
      const path='/rest/v1/user_datasets?select=dataset_key,payload,updated_at,device_id&user_id=eq.'+encodeURIComponent(s.user.id)+'&dataset_key=eq.'+encodeURIComponent(KEY)+'&limit=1';
      const rows=await window.cloudRequest(path,{headers:window.cloudHeaders(s.access_token,false)});
      const row=Array.isArray(rows)&&rows.length?rows[0]:null;
      if(!row){remoteOperations=[];lastSync=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});state(`History: Cloud ✓ · 0 remote · ${lastSync}`);rerender();if(showAlert)alert('History refreshed. No cloud Operations dataset was found.');return}
      const payload=await window.cloudHydratePayload(row.payload,s);
      if(!Array.isArray(payload))throw new Error('Cloud Operations payload is not a record list.');
      remoteOperations=payload.map(normalize);
      lastSync=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const merged=window.operationRecords();
      state(`History: Cloud ✓ · ${merged.length} records · ${lastSync}`);
      rerender();
      if(showAlert)alert(`Command Center history refreshed: ${merged.length} record(s) available.`);
    }catch(e){
      console.warn('[Build117] Command Center history refresh:',e?.message||e);
      state(`History: local cache · ${e?.message||'cloud unavailable'}`,true);
      if(showAlert)alert('History refresh could not reach the cloud. Local/offline records are still available.\n\n'+(e?.message||e));
    }finally{busy=false}
  }
  function boot(){
    ensurePatch();ensureUI();rerender();
    [500,1400,3000].forEach(ms=>setTimeout(()=>refresh(false),ms));
    const mo=new MutationObserver(()=>{ensurePatch();ensureUI()});mo.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(b&&(b.getAttribute('onclick')||'').includes("showPage('operations')"))setTimeout(()=>refresh(false),140)},true);
    window.addEventListener('focus',()=>refresh(false));
    window.addEventListener('pageshow',()=>refresh(false));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh(false)});
    setInterval(()=>{if(document.visibilityState==='visible'&&(!q('operations')?.classList?.contains('hidden')||!q('operationsDay')?.classList?.contains('hidden')))refresh(false)},15000);
  }

  window.RUNLUCommandCenterHistoryBuild117={refresh,merge,version:'117'};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
