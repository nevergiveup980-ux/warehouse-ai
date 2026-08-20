// RUNLU Warehouse AI V6.12.3 Build089 — Single Version Authority
(() => {
  if (window.__RUNLU_VERSION_AUTHORITY__) return;
  window.__RUNLU_VERSION_AUTHORITY__ = true;

  const FALLBACK = {version:'6.12.3', build:'089'};
  let current = {...FALLBACK};
  let badgeObserver = null;
  let titleObserver = null;

  const text = v => String(v ?? '').trim();

  function ensureStyle(){
    if(document.getElementById('runluVersionAuthorityStyle')) return;
    const s=document.createElement('style');
    s.id='runluVersionAuthorityStyle';
    s.textContent='header .runluVersionBadge{font-size:11px;background:rgba(255,255,255,.13);padding:6px 9px;border-radius:999px;white-space:nowrap}';
    document.head.appendChild(s);
  }

  function claimBadge(){
    let badge=document.getElementById('runluVersionBadge');
    if(!badge) badge=document.getElementById('headerVersion') || document.querySelector('.version');
    if(!badge) return null;

    // Retire the selectors used by all historical version guards. Older business
    // hotfixes stay loaded, but they can no longer compete for this badge.
    if(badge.id!=='runluVersionBadge') badge.id='runluVersionBadge';
    if(badge.classList.contains('version')) badge.classList.remove('version');
    if(!badge.classList.contains('runluVersionBadge')) badge.classList.add('runluVersionBadge');
    return badge;
  }

  function paint(){
    ensureStyle();
    const badge=claimBadge();
    const wanted=`V${current.version}`;
    if(badge && badge.textContent!==wanted) badge.textContent=wanted;
    if(document.documentElement.getAttribute('data-runlu-version')!==current.version) document.documentElement.setAttribute('data-runlu-version',current.version);
    if(document.documentElement.getAttribute('data-runlu-build')!==current.build) document.documentElement.setAttribute('data-runlu-build',current.build);
    if(document.documentElement.getAttribute('data-runlu-version-authority')!=='Build082') document.documentElement.setAttribute('data-runlu-version-authority','Build082');
    const title=document.querySelector('title');
    const titleWanted=`RUNLU Warehouse AI V${current.version} Build${current.build}`;
    if(title && title.textContent!==titleWanted) title.textContent=titleWanted;
  }

  function observe(){
    const badge=claimBadge();
    if(badge && !badgeObserver){
      badgeObserver=new MutationObserver(()=>paint());
      badgeObserver.observe(badge,{childList:true,characterData:true,subtree:true});
    }
    const title=document.querySelector('title');
    if(title && !titleObserver){
      titleObserver=new MutationObserver(()=>paint());
      titleObserver.observe(title,{childList:true,characterData:true,subtree:true});
    }
  }

  async function refreshFromManifest(){
    try{
      const res=await fetch(`version.json?authority=082&t=${Date.now()}`,{cache:'no-store'});
      if(!res.ok) throw new Error(`version manifest ${res.status}`);
      const v=await res.json();
      if(text(v?.version)) current.version=text(v.version);
      if(text(v?.build)) current.build=text(v.build);
    }catch(e){
      console.warn('[Build082] version manifest unavailable; using fallback',e);
    }
    paint();observe();
    return {...current};
  }

  paint();observe();refreshFromManifest();
  window.addEventListener('pageshow',()=>{paint();refreshFromManifest()});
  window.addEventListener('focus',paint);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')paint()});

  window.runluVersionAuthority={
    get version(){return current.version},
    get build(){return current.build},
    refresh:refreshFromManifest,
    paint
  };
})();
