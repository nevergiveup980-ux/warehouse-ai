// RUNLU Warehouse AI V6.9.1 Build077 — version display guard
(() => {
  if (window.__RUNLU_BUILD077_VERSION_GUARD__) return;
  window.__RUNLU_BUILD077_VERSION_GUARD__=true;
  const paint=()=>{
    document.querySelectorAll('.version,#headerVersion').forEach(el=>el.textContent='V6.9.1');
    document.documentElement.setAttribute('data-runlu-build','077');
    const title=document.querySelector('title');if(title)title.textContent='RUNLU Warehouse AI V6.9.1 Build077';
  };
  paint();let n=0;const t=setInterval(()=>{paint();if(++n>240)clearInterval(t)},250);
  window.addEventListener('pageshow',()=>setTimeout(paint,50));
})();
