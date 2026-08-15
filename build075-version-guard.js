// RUNLU Warehouse AI V6.8.3 Build075 — version display guard
(() => {
  if (window.__RUNLU_BUILD075_VERSION_GUARD__) return;
  window.__RUNLU_BUILD075_VERSION_GUARD__=true;
  const VERSION='6.8.3', BUILD='075';
  function apply(){
    document.querySelectorAll('.version,#headerVersion').forEach(el=>el.textContent='V'+VERSION);
    document.documentElement.setAttribute('data-runlu-build',BUILD);
    const title=document.querySelector('title');if(title)title.textContent=`RUNLU Warehouse AI V${VERSION} Build${BUILD}`;
  }
  apply();let n=0;const t=setInterval(()=>{apply();if(++n>360)clearInterval(t)},250);
  window.addEventListener('pageshow',apply);
})();
