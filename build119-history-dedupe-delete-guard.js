// RUNLU Warehouse OS Build119 · duplicate-safe history + protected deletion.
// Command Center history is a view over the live Warehouse Cloud operations table.
// Duplicate-looking copies are collapsed for display only; no inventory/transaction data
// is mutated by de-duplication. Permanent history deletion requires live cloud + two steps.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD119_HISTORY_GUARD__)return;
  window.__RUNLU_BUILD119_HISTORY_GUARD__=true;

  const KEY='runlu_operations_log_v52';
  const q=id=>document.getElementById(id);
  const text=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
  const numberText=v=>{const n=Number(v);return Number.isFinite(n)?String(Math.round(n*1000)/1000):text(v)};
  let sourceOperationRecords=null;
  let installed=false;
  let lastSuppressed=0;

  function coreProduct(x={}){
    return [text(x.collection||x.product),text(x.colour)].filter(Boolean).join(' · ') || text(x.product);
  }
  function semanticKey(x={}){
    const date=text(x.date),type=text(x.type),po=text(x.po),roll=text(x.roll),product=coreProduct(x),qty=numberText(x.quantity),unit=text(x.unit),loc=text(x.location),to=text(x.toLocation),party=text(x.customer||x.supplier);
    if(!date||!type)return 'weak:'+text(x.id)+'|'+date+'|'+type;
    if(type.includes('carpet cutting')&&po&&roll)return ['cut',date,po,roll,qty,unit].join('|');
    if((type.includes('supplier pickup')||type.includes('receiving')||type.includes('put-away'))&&po)return ['receive',date,type,po,party,product,qty,unit].join('|');
    if(type.includes('shipping')&&po)return ['ship',date,po,roll,product,qty,unit,loc,party].join('|');
    if(type.includes('transfer')&&(roll||product))return ['transfer',date,po,roll,product,qty,unit,loc,to].join('|');
    if(type.includes('return')&&(po||roll||product))return ['return',date,type,po,roll,product,qty,unit,loc,to,party].join('|');
    // Conservative fallback: keep exact time so separate manual work is never collapsed casually.
    return ['exact',date,text(x.time),type,po,roll,product,qty,unit,loc,to,party,text(x.notes)].join('|');
  }
  function stamp(x={}){
    for(const v of [x._cloudUpdatedAt,x.updatedAt,x.completedAt,x.appliedAt,x.reconciledAt,x.createdAt]){
      const n=Date.parse(v||'');if(Number.isFinite(n))return n;
    }
    const n=Date.parse(`${x.date||''}T${x.time||'00:00'}:00`);return Number.isFinite(n)?n:0;
  }
  function statusRank(x={}){
    return x.status==='Completed'?4:x.status==='Partial'?3:x.status==='In Progress'?2:x.status==='Waiting'?1:0;
  }
  function richness(x={}){
    return ['po','roll','product','collection','colour','quantity','unit','location','toLocation','customer','supplier','notes'].reduce((n,k)=>n+(String(x[k]??'').trim()?1:0),0);
  }
  function prefer(a,b){
    if(!!a.impactApplied!==!!b.impactApplied)return a.impactApplied?a:b;
    const sa=stamp(a),sb=stamp(b);
    if(Math.abs(sa-sb)>2000)return sa>sb?a:b;
    const ra=statusRank(a),rb=statusRank(b);if(ra!==rb)return ra>rb?a:b;
    const ca=!!a._cloudUpdatedAt,cb=!!b._cloudUpdatedAt;if(ca!==cb)return ca?a:b;
    const qa=richness(a),qb=richness(b);if(qa!==qb)return qa>qb?a:b;
    return sa>=sb?a:b;
  }
  function dedupe(rows=[]){
    const groups=new Map();
    for(const row of Array.isArray(rows)?rows:[]){
      const k=semanticKey(row),prior=groups.get(k);
      groups.set(k,prior?prefer(prior,row):row);
    }
    const out=[...groups.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||''))||stamp(b)-stamp(a));
    lastSuppressed=Math.max(0,(Array.isArray(rows)?rows.length:0)-out.length);
    return out;
  }
  function decorateStatus(){
    const el=q('commandHistoryText118');if(!el)return;
    const clean=String(el.textContent||'').replace(/ · Duplicate-safe ✓(?: · \d+ hidden)?/g,'');
    el.textContent=clean+` · Duplicate-safe ✓${lastSuppressed?` · ${lastSuppressed} hidden`:''}`;
  }
  function labelDeleteButton(html){
    return String(html||'').replace(/>Delete<\/button>/g,'>Delete Record…</button>');
  }
  function install(){
    if(installed||typeof window.operationRecords!=='function')return false;
    sourceOperationRecords=window.operationRecords;
    window.operationRecords=function(){
      let rows=[];try{rows=sourceOperationRecords()}catch(e){console.warn('[Build119] history source:',e?.message||e)}
      const out=dedupe(rows);setTimeout(decorateStatus,0);return out;
    };
    if(typeof window.operationMobileActions==='function'){
      const sourceActions=window.operationMobileActions;
      window.operationMobileActions=x=>labelDeleteButton(sourceActions(x));
    }
    window.deleteOperation=guardedDeleteOperation;
    installed=true;
    return true;
  }
  function rowToOperation(row={}){
    const p=row.payload&&typeof row.payload==='object'?row.payload:{};
    return {...p,id:Number(p.id||row.record_id)||p.id||row.record_id,_cloudUpdatedAt:row.updated_at||p.updatedAt||''};
  }
  function localRows(){try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
  function removeLocalSemantic(key){
    try{localStorage.setItem(KEY,JSON.stringify(localRows().filter(r=>semanticKey(r)!==key)))}catch(e){console.warn('[Build119] local history cleanup:',e?.message||e)}
  }
  async function fetchLiveRows(session){
    const path='/rest/v1/warehouse_records?select=record_id,payload,version,updated_at&user_id=eq.'+encodeURIComponent(session.user.id)+'&dataset_key=eq.'+encodeURIComponent(KEY)+'&deleted_at=is.null&order=updated_at.asc&limit=1000';
    const rows=await window.cloudRequest(path,{headers:window.cloudHeaders(session.access_token,false)});
    if(!Array.isArray(rows))throw new Error('Live Operations response is not a record list.');
    return rows;
  }
  async function tombstone(session,recordId,now){
    const path='/rest/v1/warehouse_records?user_id=eq.'+encodeURIComponent(session.user.id)+'&dataset_key=eq.'+encodeURIComponent(KEY)+'&record_id=eq.'+encodeURIComponent(recordId);
    await window.cloudRequest(path,{method:'PATCH',headers:{...window.cloudHeaders(session.access_token),Prefer:'return=minimal'},body:JSON.stringify({deleted_at:now,updated_at:now})});
  }
  async function guardedDeleteOperation(id){
    const x=window.operationRecords().find(r=>Number(r.id)===Number(id));
    if(!x)return;
    if(x.impactApplied){alert('This linked operation cannot be deleted because it already changed inventory. Use a correction or reversal record instead.');return}
    const label=[x.type,x.po?`PO ${x.po}`:'',x.roll?`Roll ${x.roll}`:'',x.collection||x.product||''].filter(Boolean).join(' · ');
    const ok=confirm('Delete this Warehouse work-history record?\n\n'+label+'\n\nDuplicate-looking entries are now hidden automatically. If you are only cleaning up duplicates, choose Cancel.\n\nA real delete removes this work from Command Center history on every device.');
    if(!ok)return;
    const typed=prompt('FINAL CONFIRMATION\n\nType DELETE to permanently remove this work-history record from Warehouse Cloud.');
    if(typed!=='DELETE'){alert('Delete cancelled. The work-history record was kept.');return}
    try{
      if(typeof window.cloudEnsureSession!=='function'||typeof window.cloudRequest!=='function'||typeof window.cloudHeaders!=='function')throw new Error('Live Warehouse Cloud is not ready.');
      const session=await window.cloudEnsureSession();if(!session)throw new Error('Warehouse Cloud sign-in is required.');
      const key=semanticKey(x),rows=await fetchLiveRows(session),matches=rows.filter(r=>semanticKey(rowToOperation(r))===key);
      const now=new Date().toISOString();
      for(const row of matches)await tombstone(session,row.record_id,now);
      removeLocalSemantic(key);
      await window.RUNLUCommandCenterHistoryBuild118?.refresh?.(false);
      try{window.renderOperationsDay?.();window.renderOperationsDays?.();window.renderDashboard?.()}catch(_){}
      alert(`Work-history record deleted.${matches.length>1?` ${matches.length} duplicate cloud copies of the same work were removed together.`:''}`);
    }catch(e){
      console.warn('[Build119] protected history delete:',e?.message||e);
      alert('Delete was NOT completed. No local history was removed.\n\n'+(e?.message||e));
    }
  }
  function boot(){
    install();decorateStatus();
    const mo=new MutationObserver(()=>{install();decorateStatus()});
    mo.observe(document.body,{childList:true,subtree:true,characterData:true});
    setInterval(decorateStatus,1500);
  }

  window.RUNLUHistoryGuardBuild119={dedupe,semanticKey,prefer,version:'119',get suppressed(){return lastSuppressed}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
