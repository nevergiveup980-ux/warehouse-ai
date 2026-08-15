// RUNLU V6.9.2 Build078 version display guard
(() => {
  if (window.__RUNLU_BUILD078_VERSION_GUARD__) return;
  window.__RUNLU_BUILD078_VERSION_GUARD__ = true;
  const set=()=>{
    document.querySelectorAll('.version,#headerVersion').forEach(el=>el.textContent='V6.9.2');
    document.documentElement.setAttribute('data-runlu-build','078');
  };
  set();let n=0;const t=setInterval(()=>{set();if(++n>300)clearInterval(t)},250);
  window.addEventListener('pageshow',set);
})();