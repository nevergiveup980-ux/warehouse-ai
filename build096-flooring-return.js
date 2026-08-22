// RUNLU Warehouse OS Build096 · Return to Flooring OS from full-screen handoff.
(() => {
  const params=new URLSearchParams(location.search);
  if(params.get('from')!=='flooring')return;

  function install(){
    if(document.getElementById('runluReturnToFlooring'))return;
    const b=document.createElement('button');
    b.id='runluReturnToFlooring';
    b.type='button';
    b.textContent='← Back to Flooring OS';
    b.setAttribute('aria-label','Back to RUNLU Deerfoot Flooring OS');
    b.style.cssText='position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);left:12px;z-index:2147483647;border:1px solid rgba(255,255,255,.38);border-radius:999px;padding:9px 13px;background:rgba(8,39,67,.92);color:#fff;font:700 13px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 5px 18px rgba(0,0,0,.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);';
    b.onclick=()=>{
      try{
        if(window.opener&&!window.opener.closed){window.opener.focus();window.close();return}
      }catch(_){ }
      location.href='https://runlu.ca/flooring/';
    };
    document.body.appendChild(b);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
