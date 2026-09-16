// RUNLU Warehouse OS V6.12.42 Build137 · Quiet Cloud Recovery Banner.
// Passive reconnect notices must never sit over the working UI indefinitely.
// The compact header Cloud pill remains the persistent status surface.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD137_QUIET_CLOUD_RECOVERY_BANNER__)return;
  window.__RUNLU_BUILD137_QUIET_CLOUD_RECOVERY_BANNER__=true;

  const BUILD='137';
  const BANNER='runluCloudRecoveryBanner';
  const TITLE='runluCloudRecoveryTitle';
  const HEADER='headerCloudPill';
  const PASSIVE_DELAY=2600;
  const HEALTHY_DELAY=250;
  const SUPPRESS_MS=45000;
  let observer=null,timer=null,timerTitle='',suppressedTitle='',suppressedUntil=0;

  const text=v=>String(v??'').trim();
  const lower=v=>text(v).toLowerCase();

  function classifyTitle(title){
    const s=lower(title);
    if(!s)return 'unknown';
    if(/sign[- ]?in required|needs attention|attention required|cloud issue|failed|error/.test(s))return 'actionable';
    if(/reconnecting cloud|cloud reconnecting|cloud refreshed|cloud connected|cloud synchronized|cloud ready/.test(s))return 'passive';
    return 'unknown';
  }
  function isHealthyHeader(){
    const el=document.getElementById(HEADER);if(!el)return false;
    const cls=lower(el.className),label=lower(el.textContent);
    return cls.includes('online')||label.includes('cloud ✓')||label.includes('cloud synchronized');
  }
  function clearTimer(){
    if(timer!=null){try{clearTimeout(timer)}catch{}timer=null}
    timerTitle='';
  }
  function hidePassive(title){
    const box=document.getElementById(BANNER);if(!box)return false;
    box.classList.add('hidden');
    suppressedTitle=text(title);
    suppressedUntil=Date.now()+SUPPRESS_MS;
    clearTimer();
    document.documentElement?.setAttribute('data-runlu-cloud-recovery-banner',`${BUILD}:quiet`);
    return true;
  }
  function schedule(title,delay){
    if(timer!=null&&timerTitle===title)return;
    clearTimer();timerTitle=title;
    timer=setTimeout(()=>{
      timer=null;timerTitle='';
      const box=document.getElementById(BANNER),t=document.getElementById(TITLE);
      const current=text(t?.textContent);
      if(!box||box.classList.contains('hidden')||current!==title)return;
      if(classifyTitle(current)==='passive')hidePassive(current);
    },Math.max(0,Number(delay)||0));
  }
  function inspect(){
    const box=document.getElementById(BANNER),t=document.getElementById(TITLE);
    if(!box||!t)return 'missing';
    if(box.classList.contains('hidden')){clearTimer();return 'hidden'}
    const title=text(t.textContent),kind=classifyTitle(title);
    if(kind==='actionable'){clearTimer();return 'actionable'}
    if(kind!=='passive'){clearTimer();return 'unknown'}
    if(title===suppressedTitle&&Date.now()<suppressedUntil){hidePassive(title);return 'suppressed'}
    schedule(title,isHealthyHeader()?HEALTHY_DELAY:PASSIVE_DELAY);
    return isHealthyHeader()?'healthy-passive':'passive';
  }
  function install(){
    const box=document.getElementById(BANNER);if(!box)return false;
    if(observer)observer.disconnect();
    observer=new MutationObserver(()=>queueMicrotask(inspect));
    observer.observe(box,{attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true});
    inspect();
    return true;
  }
  function boot(){
    install();
    setTimeout(install,250);
    setTimeout(install,1000);
    setInterval(inspect,1500);
    window.addEventListener('pageshow',()=>setTimeout(install,50));
    window.addEventListener('focus',()=>setTimeout(inspect,50));
    window.addEventListener('online',()=>setTimeout(inspect,50));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(inspect,50)});
  }

  window.RUNLUQuietCloudRecoveryBannerBuild137={version:BUILD,classifyTitle,isHealthyHeader,inspect,hidePassive,install};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
