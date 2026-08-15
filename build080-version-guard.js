// RUNLU V6.10.0 Build080 version display guard
(() => {
  if (window.__RUNLU_BUILD080_VERSION_GUARD__) return;
  window.__RUNLU_BUILD080_VERSION_GUARD__ = true;
  const set=()=>{
    document.querySelectorAll('.version,#headerVersion').forEach(el=>el.textContent='V6.10.0');
    document.documentElement.setAttribute('data-runlu-build','080');
  };
  set();let n=0;const t=setInterval(()=>{set();if(++n>300)clearInterval(t)},250);
  window.addEventListener('pageshow',set);
})();
