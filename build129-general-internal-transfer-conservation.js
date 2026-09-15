// RUNLU Warehouse OS V6.12.34 Build129 · General internal transfer conservation.
// Fixes general-material Warehouse → Warehouse moves so the source is deducted
// and the destination is increased by the same amount. Carpet transfer keeps its
// independent roll workflow in applySingleOperationImpact.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD129_INTERNAL_TRANSFER_CONSERVATION__)return;
  window.__RUNLU_BUILD129_INTERNAL_TRANSFER_CONSERVATION__=true;

  const BUILD='129';
  const base=window.applyInventoryTransfer;
  if(typeof base!=='function')return;

  function internalWarehouseRoute(r){
    if(r?.roll)return false;
    const parts=typeof carpetTransferParts==='function'?carpetTransferParts(String(r?.transferRoute||'Warehouse → Store')):{from:'',to:''};
    return typeof normKey==='function'&&normKey(parts.from)==='warehouse'&&normKey(parts.to)==='warehouse';
  }

  function wrapped(r){
    if(!internalWarehouseRoute(r))return base.apply(this,arguments);
    const qty=Number(operationStockQuantity(r));
    if(!Number.isFinite(qty)||qty<=0)throw new Error('Enter a transfer quantity greater than zero.');
    const from=String(r?.location||'').trim(),to=String(r?.toLocation||'').trim();
    if(!from||!to)throw new Error('Enter both From Location and To Location.');
    if(normKey(from)===normKey(to))throw new Error('From Location and To Location must be different for an internal transfer.');

    const before=loadInventoryRecords();
    const snapshot=JSON.parse(JSON.stringify(before));
    try{
      const source=applyInventoryDelta(r,-qty);
      const destinationRequest={...r,inventoryRecordId:'',location:to};
      const destination=applyInventoryDelta(destinationRequest,qty);
      const unit=operationStockUnit(r)||r.unit||source.unit||destination.unit||'';
      return `${from} ${source.before} → ${source.after} ${unit}; ${to} ${destination.before} → ${destination.after} ${unit}; internal transfer conserved`;
    }catch(e){
      try{save(INVDB,snapshot)}catch(_){}
      throw e;
    }
  }

  wrapped.__build129InternalTransferConservation=true;
  wrapped.__original=base;
  window.applyInventoryTransfer=wrapped;
  try{document.documentElement.setAttribute('data-runlu-internal-transfer-conservation',BUILD)}catch(_){}
  window.RUNLUInternalTransferConservationBuild129={version:BUILD,internalWarehouseRoute};
})();
