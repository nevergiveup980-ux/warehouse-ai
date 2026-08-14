// RUNLU Warehouse AI V6.6.3 Build064 — Carpet Cloud No-Replace Guard
(() => {
  if (window.__RUNLU_BUILD064__) return;
  window.__RUNLU_BUILD064__ = true;

  const VERSION='6.6.3', BUILD='064';
  const AUDIT_KEY='runlu_build064_carpet_guard_audit';
  const text=v=>String(v??'').trim();
  const exactRoll=v=>text(v).toUpperCase().replace(/\s+/g,'');
  const ms=v=>{const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0};
  const recMs=r=>Math.max(ms(r?.updatedAt),ms(r?.lastUpdatedAt),ms(r?.updated),ms(r?.transferredAt),ms(r?.createdAt),ms(r?.created));
  const keyOf=r=>{
    const roll=exactRoll(r?.roll||r?.sourceRoll);
    if(roll)return 'ROLL:'+roll;
    if(text(r?.id))return 'ID:'+text(r.id);
    return 'FALLBACK:'+[
      r?.collection,r?.colour,r?.location,r?.manufacturerRoll,r?.lot
    ].map(x=>text(x).toUpperCase()).join('|');
  };
  const overlay=(older,newer)=>{
    const out={...(older||{})};
    for(const [k,v] of Object.entries(newer||{})){
      if(v!==''&&v!==null&&v!==undefined)out[k]=v;
      else if(!(k in out))out[k]=v;
    }
    return out;
  };
  function mergeRows(a,b){
    const map=new Map();
    for(const r of Array.isArray(a)?a:[])map.set(keyOf(r),{...r});
    for(const r of Array.isArray(b)?b:[]){
      const k=keyOf(r);
      if(!map.has(k)){map.set(k,{...r});continue}
      const cur=map.get(k), newer=recMs(r)>recMs(cur)?r:cur, older=newer===r?cur:r;
      map.set(k,overlay(older,newer));
    }
    return [...map.values()].sort((x,y)=>text(x.roll).localeCompare(text(y.roll),undefined,{numeric:true,sensitivity:'base'}));
  }
  const readLocal=key=>{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch{return[]}};

  function showVersion(){
    const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;
    document.documentElement.setAttribute('data-runlu-build',BUILD);
  }

  function installGuard(){
    if(typeof window.applyCloudRows!=='function'||typeof window.cloudHydratePayload!=='function'||typeof window.CARPETDB==='undefined')return false;
    if(window.applyCloudRows.__build064guard)return true;

    const original=window.applyCloudRows;
    const guarded=async function(rows,silent=false,keys=null,clearSelectedDirty=false){
      const allKeys=(keys||window.DATA_KEYS||[]).filter(k=>(window.DATA_KEYS||[]).includes(k));
      const wantsCarpet=allKeys.includes(window.CARPETDB);
      if(!wantsCarpet)return original(rows,silent,keys,clearSelectedDirty);

      const otherKeys=allKeys.filter(k=>k!==window.CARPETDB);
      if(otherKeys.length)await original(rows,true,otherKeys,clearSelectedDirty);

      const remoteRow=(Array.isArray(rows)?rows:[]).find(r=>r.dataset_key===window.CARPETDB);
      if(remoteRow){
        const session=typeof window.cloudEnsureSession==='function'?await window.cloudEnsureSession():null;
        const remote=await window.cloudHydratePayload(remoteRow.payload,session);
        const local=readLocal(window.CARPETDB);
        const merged=mergeRows(local,remote);
        const remoteArr=Array.isArray(remote)?remote:[];

        // Core Build064 rule: Carpet Inventory is never silently replaced by one device/cloud copy.
        // Missing rolls on either side are preserved in the union; same-roll fields reconcile by newest timestamp.
        const prior=window.cloudApplying;
        try{
          window.cloudApplying=true;
          localStorage.setItem(window.CARPETDB,JSON.stringify(merged));
        }finally{window.cloudApplying=prior}

        if(session&&typeof window.cloudPutDatasetInitial==='function'&&JSON.stringify(merged)!==JSON.stringify(remoteArr)){
          await window.cloudPutDatasetInitial(window.CARPETDB,merged,session);
        }
        try{
          if(remoteRow.updated_at&&typeof window.CLOUD_DATASET_SEEN_PREFIX!=='undefined')localStorage.setItem(window.CLOUD_DATASET_SEEN_PREFIX+window.CARPETDB,remoteRow.updated_at);
          if(typeof window.clearCloudDirty==='function')window.clearCloudDirty(window.CARPETDB);
          if(typeof window.clearCloudConflict==='function')window.clearCloudConflict(window.CARPETDB);
          localStorage.setItem(AUDIT_KEY,JSON.stringify({at:new Date().toISOString(),localBefore:local.length,cloudBefore:remoteArr.length,merged:merged.length,mode:'no-replace-union'}));
        }catch{}
      }

      try{
        if(typeof window.renderCloudStatus==='function')window.renderCloudStatus();
        if(typeof window.renderCarpetInventory==='function')window.renderCarpetInventory();
        if(typeof window.renderDashboard==='function')window.renderDashboard();
      }catch(e){console.warn('[Build064] refresh',e)}

      if(!silent){
        alert('Cloud data downloaded safely. Carpet Inventory was reconciled roll-by-roll instead of being replaced. The app will reload now.');
        location.reload();
      }else{
        const active=document.querySelector('.page:not(.hidden)')?.id||'home';
        if(typeof window.showPage==='function')window.showPage(active);
      }
    };
    guarded.__build064guard=true;
    guarded.__original=original;
    window.applyCloudRows=guarded;
    return true;
  }

  // Build062 normalized away an RC prefix. Build064 intentionally uses the exact operational roll string:
  // 2347 and RC2347 must never be assumed to be the same physical roll.
  function installEarly(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      showVersion();
      if(installGuard()||tries>240)clearInterval(timer);
    },25);
  }

  installEarly();
  if(document.readyState==='complete'){showVersion();installGuard()}
  else window.addEventListener('load',()=>{showVersion();installGuard()},{once:true});
})();
