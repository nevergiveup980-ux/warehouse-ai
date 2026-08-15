// RUNLU V6.10.1 Build081 persistent version display guard
(() => {
  if (window.__RUNLU_BUILD081_VERSION_GUARD__) return;
  window.__RUNLU_BUILD081_VERSION_GUARD__ = true;
  const set=()=>{
    document.querySelectorAll('.version,#headerVersion').forEach(el=>{if(el.textContent!=='V6.10.1')el.textContent='V6.10.1'});
    document.documentElement.setAttribute('data-runlu-build','081');
  };
  set();
  const observer=new MutationObserver(set);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  const timer=setInterval(set,2000);
  window.addEventListener('pageshow',set);window.addEventListener('focus',set);
  window.runluBuild081VersionGuard={stop(){clearInterval(timer);observer.disconnect()}};
})();
