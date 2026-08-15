// RUNLU Warehouse AI V6.9.3 Build079 — Installer Return Type Guard
(() => {
  if (window.__RUNLU_BUILD079__) return;
  window.__RUNLU_BUILD079__ = true;

  const VERSION='6.9.3', BUILD='079';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/\s+/g,' ').trim();
  const boxUnit=v=>['carton','cartons','ctn','ctns','box','boxes'].includes(norm(v))?'Box':text(v);

  function carpetSourceExists(r){
    const roll=text(r?.roll),unit=norm(r?.unit);
    if(!roll||unit!=='foot')return false;
    try{return !!findCarpetRoll(carpetRecords(),roll)}catch{return false}
  }
  function generalInstallerReturn(r){
    if(norm(r?.type)!=='installer return')return false;
    if(carpetSourceExists(r))return false;
    return !!text(r?.productId||r?.masterId||r?.inventoryRecordId)||norm(r?.unit)!=='foot';
  }
  function linkedInventory(r){
    try{
      const rows=loadInventoryRecords();
      let x=r?.inventoryRecordId?findInventoryRecordByIdentity(rows,r.inventoryRecordId):null;
      if(!x&&r?.productId&&r?.location)x=rows.find(v=>String(v.masterId)===String(r.productId)&&norm(v.location)===norm(r.location));
      if(!x&&r?.productId)x=rows.find(v=>String(v.masterId)===String(r.productId));
      return x||null;
    }catch{return null}
  }
  function normalizeGeneralReturn(r){
    if(!generalInstallerReturn(r))return r;
    if(boxUnit(r.unit)==='Box')r.unit='Box';
    try{ensureOperationProductLink(r)}catch{}
    const x=linkedInventory(r);
    if(x){
      if(!r.inventoryRecordId){try{r.inventoryRecordId=inventoryRecordIdentity(x)}catch{r.inventoryRecordId=x.inventoryId||x.id||''}}
      if(!r.productId)r.productId=x.masterId||'';
      if(!r.location)r.location=x.location||'';
      if(!r.unit)r.unit=boxUnit(x.unit)||x.unit||'Box';
    }
    return r;
  }

  const oldIsCarpetLength=window.isCarpetLengthOperation;
  if(typeof oldIsCarpetLength==='function'){
    window.isCarpetLengthOperation=function(type,unit){
      if(norm(type)==='installer return'&&norm(unit)!=='foot')return false;
      return oldIsCarpetLength(type,unit);
    };
  }

  const oldValidate=window.validateOperationForImpact;
  if(typeof oldValidate==='function'){
    window.validateOperationForImpact=function(r){
      if(!generalInstallerReturn(r))return oldValidate(r);
      normalizeGeneralReturn(r);
      if(r.inventoryMode!=='Stock')return '';
      const qty=Number(r.quantity||0);
      if(!(qty>0))return 'Enter the returned inventory quantity.';
      if(!text(r.productId))return 'Choose the exact Product Master for this Installer Return.';
      const x=linkedInventory(r);
      if(!x)return 'Choose the exact Existing Inventory Record / location receiving this Installer Return.';
      if(String(x.masterId)!==String(r.productId))return 'The selected inventory record does not belong to the selected product.';
      return '';
    };
  }

  const oldEffect=window.operationCompletionEffect;
  if(typeof oldEffect==='function'){
    window.operationCompletionEffect=function(type,item){
      const r={...item,type:type||item?.type};
      if(!generalInstallerReturn(r))return oldEffect(type,item);
      normalizeGeneralReturn(r);
      const x=linkedInventory(r),qty=Number(operationStockQuantity(r)||r.quantity||0),unit=boxUnit(operationStockUnit(r)||r.unit||x?.unit||'Box');
      const before=Number(x?.quantity||0),after=Number((before+qty).toFixed(2));
      return x?`Return to Product Inventory · ${before} → ${after} ${unit} at ${r.location||x.location||'selected location'}`:`Return +${qty} ${unit} to linked Product Inventory`;
    };
  }

  const oldApply=window.applySingleOperationImpact;
  if(typeof oldApply==='function'){
    window.applySingleOperationImpact=function(r){
      if(!generalInstallerReturn(r))return oldApply(r);
      if(r.impactApplied||r.status!=='Completed')return true;
      if(r.inventoryMode!=='Stock')return oldApply(r);
      normalizeGeneralReturn(r);
      const err=window.validateOperationForImpact(r);if(err){alert(err);return false}
      try{
        const qty=Number(operationStockQuantity(r)||r.quantity||0);if(!(qty>0))throw new Error('Returned quantity must be greater than zero.');
        const change=applyInventoryDelta(r,qty),unit=boxUnit(change?.unit||operationStockUnit(r)||r.unit||'Box'),loc=r.location||linkedInventory(r)?.location||'selected location';
        r.unit=unit;r.itemStatus='Completed';r.inventoryVerified=true;r.inventoryVerifiedAt=new Date().toISOString();
        const result=`Installer Return to Product Inventory: ${change.before} → ${change.after} ${unit} at ${loc}`;
        try{const events=load(EVENTDB);events.unshift({id:Date.now()+Math.random(),operationId:r.id,time:new Date().toISOString(),type:r.type,reference:r.po||r.product,result});save(EVENTDB,events)}catch{}
        r.impactApplied=true;r.impactResult=result;r.appliedAt=new Date().toISOString();return true;
      }catch(e){alert('Linked update stopped: '+e.message);return false}
    };
  }

  const oldUpdateForm=window.updateOperationForm;
  if(typeof oldUpdateForm==='function'){
    window.updateOperationForm=function(){
      const parentType=text(document.getElementById('operationType')?.value),lineType=text(document.getElementById('operationLineType')?.value),type=lineType||parentType,product=document.getElementById('operationProduct'),invSel=document.getElementById('operationInventoryRecord'),unitEl=document.getElementById('operationUnit'),rollEl=document.getElementById('operationRoll');
      const snapshot={productId:text(product?.dataset?.productId),product:text(product?.value),inventoryRecordId:text(invSel?.value),unit:text(unitEl?.value),roll:text(rollEl?.value),collection:text(document.getElementById('operationCollection')?.value),colour:text(document.getElementById('operationColour')?.value),location:text(document.getElementById('operationLocation')?.value),lot:text(document.getElementById('operationLot')?.value)};
      const installer=norm(type)==='installer return'||norm(parentType)==='installer return';
      const general=installer&&(!carpetSourceExists({type:'Installer Return',unit:snapshot.unit,roll:snapshot.roll})&&(!!snapshot.productId||!!snapshot.inventoryRecordId||norm(snapshot.unit)!=='foot'));
      const out=oldUpdateForm();
      if(!general)return out;
      const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!==undefined)el.value=v};
      set('operationUnit',boxUnit(snapshot.unit)||'Box');set('operationProduct',snapshot.product);set('operationInventoryRecord',snapshot.inventoryRecordId);set('operationCollection',snapshot.collection);set('operationColour',snapshot.colour);set('operationLocation',snapshot.location);set('operationLot',snapshot.lot);
      if(product&&snapshot.productId)product.dataset.productId=snapshot.productId;
      const show=id=>{const el=document.getElementById(id);if(el)el.style.display='block'};
      const hide=id=>{const el=document.getElementById(id);if(el)el.style.display='none'};
      show('operationInventoryRecordWrap');show('operationProductSearchWrap');show('operationQtyWrap');hide('operationRollWrap');hide('operationLotWrap');hide('operationWidthWrap');hide('operationInchesWrap');hide('operationWorkflowNotice');
      const parentMode=document.getElementById('operationInventoryMode');if(parentMode)parentMode.value='Stock';
      const lineMode=document.getElementById('operationLineInventoryMode');if(lineMode){lineMode.value='Stock';lineMode.disabled=false}
      const ql=document.getElementById('operationQtyLabel');if(ql)ql.textContent='Returned Quantity';
      const ll=document.getElementById('operationLocationLabel');if(ll)ll.textContent='Return Location';
      const qi=document.getElementById('operationQty');if(qi){qi.placeholder='Returned inventory quantity';qi.inputMode='decimal'}
      const match=document.getElementById('operationProductMatch'),x=linkedInventory({productId:snapshot.productId,inventoryRecordId:snapshot.inventoryRecordId,location:snapshot.location});
      if(match&&x)match.innerHTML=`Linked to Product Inventory at <b>${String(x.location||snapshot.location||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</b> · current balance <b>${Number(x.quantity||0)} ${boxUnit(x.unit)||x.unit||''}</b>`;
      return out;
    };
  }

  const oldStartInstallerReturn=window.startInstallerReturn;
  if(typeof oldStartInstallerReturn==='function'){
    window.startInstallerReturn=function(roll){
      startCommandOperation('Installer Return');
      const unit=document.getElementById('operationUnit');if(unit)unit.value='Foot';
      if(roll){
        const rollEl=document.getElementById('operationRoll');if(rollEl)rollEl.value=roll;
        try{const x=carpetRecords().find(r=>norm(r.roll)===norm(roll));if(x){
          const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||''};
          set('operationCollection',x.collection);set('operationColour',x.colour);set('operationLot',x.lot);set('operationWidth',x.width||'12');set('operationLocation',x.location);
        }}catch{}
      }
      updateOperationForm();
    };
  }

  window.runluInstallerReturnTypeGuard={version:VERSION,build:BUILD,generalInstallerReturn};
})();
