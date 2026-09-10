// RUNLU Warehouse OS V6.12.26 Build121 · Quiet Product Recovery Notice.
// Product Link Recovery stays fully active, but its repetitive success alert is
// converted into a silent audit event so normal warehouse work is never blocked.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD121_QUIET_PRODUCT_RECOVERY_NOTICE__) return;
  window.__RUNLU_BUILD121_QUIET_PRODUCT_RECOVERY_NOTICE__ = true;

  const PREFIX='Product links recovered from Cloud Master.';
  const nativeAlert=window.alert.bind(window);

  window.alert=function(message){
    const text=String(message??'');
    if(text.startsWith(PREFIX)){
      const event={at:new Date().toISOString(),message:text};
      try{sessionStorage.setItem('runlu_build121_last_quiet_product_recovery',JSON.stringify(event))}catch{}
      console.info('[Build121] Product Link Recovery completed quietly.',text.replace(/\n+/g,' | '));
      return;
    }
    return nativeAlert(message);
  };

  document.documentElement.setAttribute('data-runlu-build121','quiet-product-recovery-notice');
})();
