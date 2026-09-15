// RUNLU Warehouse OS V6.12.32 Build127 · Operation status wording hotfix.
// Display-only change: do not alter inventory, sync, storage, or operation locking behavior.
(() => {
  'use strict';

  const FLAG='__RUNLU_BUILD127_OPERATION_STATUS_TAIL__';

  function isRecordOnly(x){
    const mode=String(x?.inventoryMode||'').trim().toLowerCase();
    const result=String(x?.impactResult||'').trim().toLowerCase();
    return mode==='record only' || mode.includes('non-stock') || result.includes('work record only');
  }

  function cleanVisibleTail(){
    try{
      document.querySelectorAll('.lockedOperation').forEach(el=>{
        el.textContent=String(el.textContent||'').replace(/\s*·\s*Record locked\s*$/i,'');
      });
    }catch{}
  }

  function install(){
    if(window[FLAG]){cleanVisibleTail();return true}
    const original=window.operationMobileActions;
    if(typeof original!=='function')return false;

    function operationMobileActionsTailFix(x){
      if(x?.impactApplied){
        return isRecordOnly(x)
          ? '<div class="lockedOperation">✓ Completed · Work record saved</div>'
          : '<div class="lockedOperation">✓ Completed and linked to inventory</div>';
      }
      return original.apply(this,arguments);
    }

    operationMobileActionsTailFix.__original=original;
    operationMobileActionsTailFix.__build127OperationStatusTail=true;
    window.operationMobileActions=operationMobileActionsTailFix;
    window[FLAG]=true;
    cleanVisibleTail();
    return true;
  }

  // release-loader runs before the main inline Warehouse app finishes defining its
  // functions. Install now when possible, otherwise retry after parsing completes.
  if(!install()){
    const retry=()=>install();
    try{if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',retry,{once:true})}catch{}
    [0,50,250,1000].forEach(ms=>setTimeout(retry,ms));
  }
})();
