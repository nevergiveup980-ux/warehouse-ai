// RUNLU Warehouse OS V6.12.32 Build127 · Operation status wording hotfix.
// Display-only change: do not alter inventory, sync, storage, or operation locking behavior.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD127_OPERATION_STATUS_TAIL__)return;
  window.__RUNLU_BUILD127_OPERATION_STATUS_TAIL__=true;

  const original=window.operationMobileActions;
  if(typeof original!=='function')return;

  function isRecordOnly(x){
    const mode=String(x?.inventoryMode||'').trim().toLowerCase();
    const result=String(x?.impactResult||'').trim().toLowerCase();
    return mode==='record only' || mode.includes('non-stock') || result.includes('work record only');
  }

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
})();
