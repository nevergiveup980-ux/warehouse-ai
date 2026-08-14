// RUNLU Build070 guard — disables legacy whole-union conflict actions after lifecycle-aware merge is available.
(() => {
  if (window.__RUNLU_BUILD070_GUARD__) return;
  window.__RUNLU_BUILD070_GUARD__ = true;
  function install(){
    const legacy=document.getElementById('build069SafeMergeBtn');
    if(legacy) legacy.remove();
    const notice=document.getElementById('build069MergeNotice');
    if(notice){
      notice.innerHTML='🛡️ <b>Build070 Lifecycle Guard:</b> one-sided inventory is never auto-resurrected. Review it first as either <b>Restore as Active</b> or <b>Keep Ended / Do Not Restore</b>.';
      notice.style.borderColor='#f0c36a';notice.style.background='#fff8e8';notice.style.color='#5a4000';
    }
    if(typeof window.runluLifecycleSafeMerge==='function'){
      window.runluSafeMergeBothSides=(keys,opts)=>window.runluLifecycleSafeMerge(opts||{});
    }
  }
  install();let n=0;const t=setInterval(()=>{install();if(++n>180)clearInterval(t)},100);
})();
