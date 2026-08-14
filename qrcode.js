// RUNLU QR loader — preserves the exact previous QR engine offline and loads Build062.
window.addEventListener('load',()=>setTimeout(()=>{
  if(typeof window.reconcileCarpetCloudBuild062==='function')
    window.reconcileCarpetCloudBuild062(true).catch(e=>console.warn('[Build062] startup carpet reconcile',e));
},1800));
document.write('<script src="qrcode-core.js"><\/script><script src="build062-hotfix.js?v=062"><\/script>');
