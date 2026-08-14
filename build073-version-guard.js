// RUNLU Build073 display guard — keeps the visible build badge on the newest loaded layer.
(() => {
  if(window.__RUNLU_BUILD073_VERSION_GUARD__)return;
  window.__RUNLU_BUILD073_VERSION_GUARD__=true;
  const wanted='V6.8.1';
  function fix(){
    const hv=document.getElementById('headerVersion');if(hv&&hv.textContent!==wanted)hv.textContent=wanted;
    document.documentElement.setAttribute('data-runlu-build','073');
  }
  function boot(){
    fix();let n=0;const t=setInterval(()=>{fix();if(++n>360)clearInterval(t)},250);
    const root=document.getElementById('headerVersion');if(root){new MutationObserver(fix).observe(root,{childList:true,characterData:true,subtree:true})}
  }
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
