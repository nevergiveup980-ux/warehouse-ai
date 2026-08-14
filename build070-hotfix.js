// RUNLU Warehouse AI V6.6.9 Build070 — Lifecycle-Aware Safe Merge
(() => {
  if (window.__RUNLU_BUILD070__) return;
  window.__RUNLU_BUILD070__ = true;

  const VERSION='6.6.9', BUILD='070';
  const INV='runlu_inventory_records_v21';
  const TOMBSTONES='runlu_inventory_tombstones_v1';
  const CANDIDATES='runlu_build070_inventory_review_candidates';
  const RESOLUTIONS='runlu_build070_inventory_review_resolutions';
  const AUDIT='runlu_build070_merge_audit';

  const text=v=>String(v??'').trim();
  const parse=v=>{try{return JSON.parse(v)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const parseMs=v=>{const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0};
  const rowMs=r=>Math.max(parseMs(r?.lastUpdatedAt),parseMs(r?.updatedAt),parseMs(r?.updated),parseMs(r?.completedAt),parseMs(r?.createdAt),parseMs(r?.created));
  const invId=r=>text(r?.inventoryId||r?.id);
  const terminal=s=>['USED UP','ARCHIVED','TRANSFERRED OUT','SHIPPED','SOLD','DELETED','AT STORE','WITH INSTALLER'].includes(text(s).toUpperCase());

  function overlay(a,b){
    const newer=rowMs(b)>rowMs(a)?b:a, older=newer===a?b:a, out={...(older||{})};
    for(const [k,v] of Object.entries(newer||{})) if(v!==''&&v!==null&&v!==undefined) out[k]=v;
    return out;
  }

  async function cloudState(){
    const ensure=window.cloudEnsureSession, fetchRows=window.cloudFetchRows, hydrate=window.cloudHydratePayload;
    if(typeof ensure!=='function'||typeof fetchRows!=='function') throw new Error('Cloud functions are not ready.');
    const session=await ensure(); if(!session) throw new Error('Cloud sign-in required.');
    const rows=await fetchRows(); const byKey=new Map((rows||[]).map(r=>[r.dataset_key,r]));
    const get=async key=>{const r=byKey.get(key);if(!r)return null;return typeof hydrate==='function'?await hydrate(r.payload,session):r.payload};
    return {session,rows,byKey,get};
  }

  function mergeTombstones(local,cloud){
    const map=new Map();
    for(const r of [...(Array.isArray(local)?local:[]),...(Array.isArray(cloud)?cloud:[])]){
      const id=invId(r);if(!id)continue;const prev=map.get(id);if(!prev||rowMs(r)>=rowMs(prev))map.set(id,r);
    }
    return [...map.values()];
  }

  function resolutionMap(){
    const arr=read(RESOLUTIONS);const m=new Map();
    for(const r of Array.isArray(arr)?arr:[]) if(r?.inventoryId)m.set(text(r.inventoryId),r);
    return m;
  }

  function buildInventoryPlan(localRows,cloudRows,tombstones){
    const local=Array.isArray(localRows)?localRows:[], cloud=Array.isArray(cloudRows)?cloudRows:[];
    const lm=new Map(local.map(r=>[invId(r),r]).filter(([k])=>k));
    const cm=new Map(cloud.map(r=>[invId(r),r]).filter(([k])=>k));
    const tm=new Map((Array.isArray(tombstones)?tombstones:[]).map(r=>[invId(r),r]).filter(([k])=>k));
    const rm=resolutionMap();
    const ids=new Set([...lm.keys(),...cm.keys()]);
    const merged=[], candidates=[];
    for(const id of ids){
      const l=lm.get(id), c=cm.get(id), t=tm.get(id), res=rm.get(id);
      const activeLatest=Math.max(rowMs(l),rowMs(c));
      if(t && rowMs(t)>=activeLatest){continue;}
      if(l&&c){
        const m=overlay(l,c);
        if(terminal(m.lifecycleStatus)) continue;
        merged.push(m);continue;
      }
      const one=l||c, side=l?'device':'cloud';
      if(res?.decision==='ENDED') continue;
      if(res?.decision==='ACTIVE'){ if(!terminal(one.lifecycleStatus)) merged.push(one); continue; }
      candidates.push({inventoryId:id,side,record:one,detectedAt:new Date().toISOString()});
      // Preserve current device view, but do not propagate an unverified one-sided cloud record into local active inventory.
      if(side==='device'&&!terminal(one.lifecycleStatus)) merged.push(one);
    }
    return {merged,candidates,localCount:local.length,cloudCount:cloud.length};
  }

  async function lifecycleSafeMerge({silent=false}={}){
    const {session,get}=await cloudState();
    const localInv=read(INV)||[], cloudInv=await get(INV)||[];
    const localT=read(TOMBSTONES)||[], cloudT=await get(TOMBSTONES)||[];
    const tombstones=mergeTombstones(localT,cloudT);
    const plan=buildInventoryPlan(localInv,cloudInv,tombstones);
    write(TOMBSTONES,tombstones);write(CANDIDATES,plan.candidates);

    // If any one-sided inventory needs human meaning, do not overwrite the cloud inventory dataset yet.
    if(plan.candidates.length){
      write(AUDIT,{at:new Date().toISOString(),status:'PAUSED_FOR_REVIEW',...plan});
      renderReviewPanel();
      if(!silent) alert(`Safe merge paused before inventory overwrite.\n\n${plan.candidates.length} one-sided inventory record(s) need review because a missing record may mean either \"new on another device\" or \"already used up/archived\".\n\nNothing was deleted or resurrected.`);
      return {paused:true,...plan};
    }

    const put=window.cloudPutDatasetInitial;
    if(typeof put!=='function') throw new Error('Cloud write function is not ready.');
    const prior=window.cloudApplying;
    try{window.cloudApplying=true;write(INV,plan.merged)}finally{window.cloudApplying=prior}
    await put(INV,plan.merged,session);await put(TOMBSTONES,tombstones,session);
    try{window.clearCloudDirty?.(INV);window.clearCloudConflict?.(INV)}catch{}
    write(AUDIT,{at:new Date().toISOString(),status:'MERGED',...plan,mergedCount:plan.merged.length});
    try{window.renderInventory?.();window.renderProducts?.();window.renderCloudStatus?.()}catch{}
    if(!silent) alert(`Lifecycle-aware inventory merge completed.\nDevice ${plan.localCount} + cloud ${plan.cloudCount} → active ${plan.merged.length}.\nTerminal/tombstoned inventory was not resurrected.`);
    return {paused:false,...plan};
  }
  window.runluLifecycleSafeMerge=lifecycleSafeMerge;

  async function resolveCandidate(id,decision){
    const arr=read(RESOLUTIONS);const list=Array.isArray(arr)?arr.filter(x=>text(x.inventoryId)!==id):[];
    list.push({inventoryId:id,decision,at:new Date().toISOString()});write(RESOLUTIONS,list);
    if(decision==='ENDED'){
      const ts=read(TOMBSTONES);const tomb=Array.isArray(ts)?ts.filter(x=>invId(x)!==id):[];
      tomb.push({inventoryId:id,lifecycleStatus:'USED UP',deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),reason:'Confirmed ended during Build070 one-sided inventory review'});
      write(TOMBSTONES,tomb);
    }
    await lifecycleSafeMerge({silent:true});renderReviewPanel();
  }

  function candidateLabel(c){
    const r=c.record||{};return `${r.masterId||'Product'} · ${r.quantity??'?'} ${r.unit||''} · ${r.location||'No location'}${r.poNumber?` · PO ${r.poNumber}`:''}`;
  }

  function renderReviewPanel(){
    const status=document.getElementById('cloudStatus');if(!status)return;
    let box=document.getElementById('build070ReviewPanel');
    if(!box){box=document.createElement('div');box.id='build070ReviewPanel';status.insertAdjacentElement('afterend',box)}
    const candidates=read(CANDIDATES);const list=Array.isArray(candidates)?candidates:[];
    box.style.cssText='margin:14px 0;padding:14px;border:1px solid #f0c36a;background:#fff8e8;border-radius:14px;color:#35270c;line-height:1.45';
    if(!list.length){box.innerHTML='<b>🛡️ Lifecycle Merge Guard:</b> No one-sided inventory records currently waiting for review.';return}
    box.innerHTML=`<div style="font-weight:800;margin-bottom:8px">🛡️ One-Sided Inventory Review (${list.length})</div><div style="margin-bottom:10px">A missing record can mean either <b>new on another device</b> or <b>already used up/archived</b>. Review before it enters current inventory.</div>`;
    for(const c of list){
      const id=text(c.inventoryId),row=document.createElement('div');row.style.cssText='padding:10px 0;border-top:1px solid #ead7aa';
      row.innerHTML=`<div><b>${candidateLabel(c)}</b></div><div style="font-size:.9em;opacity:.8">Found only on ${c.side}. ID ${id}</div>`;
      const a=document.createElement('button');a.type='button';a.className='green';a.textContent='Restore as Active';a.style.margin='8px 8px 0 0';a.onclick=()=>resolveCandidate(id,'ACTIVE');
      const e=document.createElement('button');e.type='button';e.textContent='Keep Ended / Do Not Restore';e.style.marginTop='8px';e.onclick=()=>resolveCandidate(id,'ENDED');
      row.append(a,e);box.appendChild(row);
    }
  }

  function installButton(){
    const status=document.getElementById('cloudStatus');if(!status)return false;
    const row=status.closest('.settingRow'),actions=row?.querySelector('.actions');if(!actions)return false;
    let b=document.getElementById('build070LifecycleMergeBtn');
    if(!b){b=document.createElement('button');b.id='build070LifecycleMergeBtn';b.type='button';b.className='green';b.textContent='🛡️ Lifecycle Safe Merge';b.onclick=async()=>{b.disabled=true;try{await lifecycleSafeMerge({silent:false})}catch(e){alert('Lifecycle safe merge stopped: '+(e.message||e))}finally{b.disabled=false}};actions.insertBefore(b,actions.firstChild)}
    return true;
  }

  function wrapSync(){
    const cur=window.cloudSyncNow;if(typeof cur!=='function'||cur.__build070)return false;
    const original=cur.__original||cur;
    const wrapped=async function(...args){
      try{
        const conflicts=typeof window.cloudConflictKeys==='function'?window.cloudConflictKeys():[];
        if(conflicts.includes(INV)){
          const r=await lifecycleSafeMerge({silent:true});if(r?.paused){renderReviewPanel();return;}
        }
      }catch(e){console.warn('[Build070] inventory pre-sync guard',e);return;}
      return original.apply(this,args);
    };
    wrapped.__build070=true;wrapped.__original=original;window.cloudSyncNow=wrapped;return true;
  }

  function showVersion(){const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;document.documentElement.setAttribute('data-runlu-build',BUILD)}
  function install(){showVersion();installButton();renderReviewPanel();wrapSync()}
  function boot(){install();let n=0;const t=setInterval(()=>{install();if(++n>120)clearInterval(t)},100)}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
