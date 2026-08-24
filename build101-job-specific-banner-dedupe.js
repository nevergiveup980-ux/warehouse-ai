// RUNLU Warehouse OS Build101 · Job-specific handoff banner dedupe.
// Build099 and Build100 can both render the same informational handoff notice.
// Keep the Build100 authority banner as the single visible source of truth.
(() => {
  function clean(){
    const old=document.getElementById('flooringJobSpecificBanner');
    const authority=document.getElementById('flooringJobSpecificAuthorityBanner');
    if(old&&authority) old.remove();
    const all=[...document.querySelectorAll('#flooringJobSpecificAuthorityBanner')];
    all.slice(1).forEach(x=>x.remove());
  }
  function sweep(){ [0,120,350,800,1600].forEach(ms=>setTimeout(clean,ms)); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',sweep,{once:true}); else sweep();
  window.addEventListener('pageshow',sweep);
})();
