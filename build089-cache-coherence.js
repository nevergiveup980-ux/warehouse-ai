// RUNLU Warehouse AI V6.12.3 Build089 — Cache Coherence / Stale Client Recovery
(() => {
  if(window.__RUNLU_CACHE_COHERENCE_089__) return;
  window.__RUNLU_CACHE_COHERENCE_089__=true;

  const normalizeBuild=v=>String(v??'').replace(/\D/g,'').padStart(3,'0');
  // release-loader.js sets this before loading the guard. Keeping the loaded release
  // dynamic means future releases only need a new release-loader token + version.json.
  const LOADED_BUILD=normalizeBuild(window.__RUNLU_LOADED_RELEASE__ || document.documentElement.getAttribute('data-runlu-loaded-build') || '089');
  const HYGIENE_KEY=`runlu_cache_hygiene_${LOADED_BUILD}`;
  const RELOAD_KEY='runlu_auto_refresh_target_build';
  let checking=false;
  let reloadInFlight=false;

  async function retireLegacyBrowserCaches(){
    try{
      if(localStorage.getItem(HYGIENE_KEY)==='done') return;
    }catch(_){}

    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs
          .filter(r=>String(r.scope||'').startsWith(location.origin))
          .map(r=>r.unregister().catch(()=>false)));
      }
    }catch(e){console.warn('[Build089] service worker cleanup skipped',e)}

    // warehouse.runlu.ca is a dedicated application origin. Clearing Cache Storage
    // here does NOT touch localStorage/IndexedDB/Supabase records or warehouse data.
    try{
      if('caches' in window){
        const names=await caches.keys();
        await Promise.all(names.map(name=>caches.delete(name).catch(()=>false)));
      }
    }catch(e){console.warn('[Build089] Cache Storage cleanup skipped',e)}

    try{localStorage.setItem(HYGIENE_KEY,'done')}catch(_){}
  }

  async function readManifest(){
    const res=await fetch(`version.json?cachecheck=${LOADED_BUILD}&t=${Date.now()}`,{cache:'no-store'});
    if(!res.ok) throw new Error(`version manifest ${res.status}`);
    return res.json();
  }

  function forceFreshReload(targetBuild){
    if(reloadInFlight) return;
    const target=normalizeBuild(targetBuild);
    if(!target || target===LOADED_BUILD) return;

    let last='';
    try{last=sessionStorage.getItem(RELOAD_KEY)||''}catch(_){}
    if(last===target){
      console.warn(`[Build089] already attempted refresh to Build${target}; avoiding reload loop.`);
      return;
    }

    try{sessionStorage.setItem(RELOAD_KEY,target)}catch(_){}
    reloadInFlight=true;
    const u=new URL(location.href);
    u.searchParams.set('runlu-build',target);
    u.searchParams.set('_runlu_refresh',Date.now());
    location.replace(u.toString());
  }

  async function checkForFreshRelease(reason='manual'){
    if(checking || reloadInFlight) return false;
    checking=true;
    try{
      const manifest=await readManifest();
      const published=normalizeBuild(manifest?.build);
      if(!published) return false;
      document.documentElement.setAttribute('data-runlu-published-build',published);
      if(published===LOADED_BUILD){
        try{sessionStorage.removeItem(RELOAD_KEY)}catch(_){}
        return true;
      }
      console.info(`[Build089] ${reason}: loaded ${LOADED_BUILD}, published ${published}; refreshing.`);
      forceFreshReload(published);
      return false;
    }catch(e){
      console.warn('[Build089] freshness check unavailable',e);
      return false;
    }finally{checking=false}
  }

  retireLegacyBrowserCaches().finally(()=>setTimeout(()=>checkForFreshRelease('boot'),900));
  window.addEventListener('pageshow',()=>setTimeout(()=>checkForFreshRelease('pageshow'),250));
  window.addEventListener('focus',()=>setTimeout(()=>checkForFreshRelease('focus'),120));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') setTimeout(()=>checkForFreshRelease('visible'),120);
  });

  window.runluCacheCoherence={
    loadedBuild:LOADED_BUILD,
    check:checkForFreshRelease,
    retireLegacyBrowserCaches
  };
})();
