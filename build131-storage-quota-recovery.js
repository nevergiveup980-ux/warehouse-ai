// RUNLU Warehouse OS V6.12.36 Build131 · storage quota recovery.
// The iPhone/Safari quota seen on reconnect is a device localStorage limit, not Supabase capacity.
// Safely archives obsolete duplicate pre-V21 local datasets into IndexedDB, then retries Cloud Master.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD131_STORAGE_QUOTA_RECOVERY__)return;
  window.__RUNLU_BUILD131_STORAGE_QUOTA_RECOVERY__=true;

  const VERSION='6.12.36', BUILD='131';
  const LAST_ERROR='runlu_cloud_master_last_error_v680';
  const LEGACY_PRODUCT='runlu_inventory_v20';
  const LEGACY_INV13='runlu_inventory_v13';
  const LEGACY_ORD13='runlu_orders_v13';
  const PM='runlu_product_master_v21';
  const INV='runlu_inventory_records_v21';
  const ORD='runlu_orders_v20';
  const MIG21='runlu_v21_migrated';
  const MIG13='runlu_v13_migrated';
  const ARCHIVE_DB='runlu_local_archive_v131';
  const ARCHIVE_STORE='legacy';
  const ARCHIVE_MARK='runlu_build131_legacy_archive';
  let busy=false;

  const text=v=>String(v??'').trim();
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const bytes=s=>new Blob([String(s??'')]).size;
  const quotaIssue=msg=>/(quota|local app data|local cache|storage|exceeded)/i.test(String(msg||''));

  function openArchive(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window))return reject(new Error('IndexedDB unavailable'));
      const req=indexedDB.open(ARCHIVE_DB,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(ARCHIVE_STORE))db.createObjectStore(ARCHIVE_STORE,{keyPath:'key'})};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
    });
  }
  async function archiveRaw(key,raw){
    const db=await openArchive();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(ARCHIVE_STORE,'readwrite');
      tx.objectStore(ARCHIVE_STORE).put({key,raw,archivedAt:new Date().toISOString(),bytes:bytes(raw)});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('IndexedDB archive failed'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB archive aborted'));
    });
    db.close();
  }
  function validArrayKey(key){const v=parse(localStorage.getItem(key)||'[]');return Array.isArray(v)&&v.length>0}
  async function retireOne(key,guard){
    const raw=localStorage.getItem(key);if(raw==null||!raw.length)return {key,removed:false,bytes:0};
    if(!guard())return {key,removed:false,bytes:0,reason:'guard'};
    await archiveRaw(key,raw);
    localStorage.removeItem(key);
    return {key,removed:true,bytes:bytes(raw)};
  }
  async function retireLegacyDuplicates(){
    const out=[];
    out.push(await retireOne(LEGACY_PRODUCT,()=>text(localStorage.getItem(MIG21))==='1'&&validArrayKey(PM)&&validArrayKey(INV)));
    out.push(await retireOne(LEGACY_INV13,()=>!!text(localStorage.getItem(MIG13))&&validArrayKey(INV)));
    out.push(await retireOne(LEGACY_ORD13,()=>!!text(localStorage.getItem(MIG13))&&Array.isArray(parse(localStorage.getItem(ORD)||'[]'))));
    const reclaimed=out.filter(x=>x.removed).reduce((n,x)=>n+x.bytes,0);
    try{localStorage.setItem(ARCHIVE_MARK,JSON.stringify({at:new Date().toISOString(),reclaimed,keys:out.filter(x=>x.removed).map(x=>x.key)}))}catch(_){}
    return {reclaimed,details:out};
  }
  function cleanupDisposable(){
    let reclaimed=0;
    try{const r=window.pruneLocalApplicationCache?.(true);reclaimed+=Number(r?.reclaimedBytes||0)||0}catch(_){}
    try{const r=window.aggressiveSafeStorageCleanup?.();reclaimed+=Number(r?.reclaimedBytes||0)||0}catch(_){}
    return reclaimed;
  }
  function paintQuotaState(){
    const err=localStorage.getItem(LAST_ERROR)||'';
    if(!quotaIssue(err))return false;
    const pill=document.getElementById('headerCloudPill');
    if(pill){pill.className='cloudPill offline';pill.textContent='Device storage';pill.title='Warehouse Cloud is reachable, but this iPhone browser cache is full. RUNLU is safely reducing legacy local duplicates.'}
    const box=document.getElementById('runluCloudRecoveryBanner'),title=document.getElementById('runluCloudRecoveryTitle'),body=document.getElementById('runluCloudRecoveryText');
    if(box){box.style.display='';box.classList.remove('hidden')}
    if(title)title.textContent='Warehouse open · Device cache needs room';
    if(body)body.textContent='Cloud data was not deleted. RUNLU is safely reducing obsolete local duplicates before reconnecting.';
    return true;
  }
  async function recover({announce=false}={}){
    if(busy)return false;busy=true;
    try{
      paintQuotaState();
      const archived=await retireLegacyDuplicates().catch(e=>{console.warn('[Build131] legacy archive skipped',e);return {reclaimed:0,details:[]}});
      const cleaned=cleanupDisposable();
      const total=Number(archived.reclaimed||0)+Number(cleaned||0);
      let ok=false;
      if(typeof window.runluCloudMasterSync==='function')ok=await window.runluCloudMasterSync({silent:true});
      if(ok){
        localStorage.removeItem(LAST_ERROR);
        const pill=document.getElementById('headerCloudPill');if(pill){pill.className='cloudPill online';pill.textContent='Cloud ✓';pill.title='Warehouse Cloud is synchronized.'}
        const title=document.getElementById('runluCloudRecoveryTitle'),body=document.getElementById('runluCloudRecoveryText'),box=document.getElementById('runluCloudRecoveryBanner');
        if(title)title.textContent='Cloud connected ✓';if(body)body.textContent='Live warehouse data is synchronized. Device cache recovery completed safely.';
        if(box)setTimeout(()=>{try{box.classList.add('hidden')}catch(_){}},2200);
        if(announce)alert(`Warehouse Cloud reconnected successfully.${total?` Safe local cleanup recovered ${(total/1024/1024).toFixed(1)} MB.`:''}`);
        return true;
      }
      paintQuotaState();
      if(announce){
        const err=localStorage.getItem(LAST_ERROR)||'Cloud reconnect is still pending.';
        alert(quotaIssue(err)?'This iPhone browser cache is still full after safe cleanup. Cloud data was not deleted. Keep Warehouse OS open; no browser-data clearing is required yet.':'Cloud reconnect is still pending: '+err);
      }
      return false;
    }finally{busy=false}
  }
  function wrapReconnect(){
    const current=window.RUNLU_OPEN_CLOUD_RECONNECT;
    if(typeof current!=='function'||current.__build131)return false;
    const wrapped=async function(){return recover({announce:true})};
    wrapped.__build131=true;wrapped.__original=current;window.RUNLU_OPEN_CLOUD_RECONNECT=wrapped;return true;
  }
  function install(){wrapReconnect();paintQuotaState()}
  function boot(){
    install();
    setTimeout(()=>{if(quotaIssue(localStorage.getItem(LAST_ERROR)||''))recover({announce:false});},700);
    let n=0;const t=setInterval(()=>{install();if(++n>160)clearInterval(t)},250);
    window.addEventListener('pageshow',()=>setTimeout(install,60));
    window.addEventListener('focus',()=>setTimeout(()=>{install();if(quotaIssue(localStorage.getItem(LAST_ERROR)||''))recover({announce:false})},120));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(install,80)});
    document.documentElement.setAttribute('data-runlu-storage-quota-recovery',BUILD);
  }

  window.RUNLUStorageQuotaRecoveryBuild131={version:BUILD,appVersion:VERSION,recover,retireLegacyDuplicates,paintQuotaState};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
