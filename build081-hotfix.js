// RUNLU Warehouse AI V6.10.1 Build081 — Deferred Return Guard
(() => {
  if (window.__RUNLU_BUILD081_BOOT__) return;
  window.__RUNLU_BUILD081_BOOT__ = true;

  const VERSION='6.10.1', BUILD='081';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/\s+/g,' ').trim();
  const byId=id=>document.getElementById(id);
  const boxUnit=v=>['carton','cartons','ctn','ctns','box','boxes'].includes(norm(v))?'Box':text(v);
  let installed=false, installing=false, bypassStart=false;

  function coreReady(){
    return ['updateOperationForm','startCommandOperation','operationItemFromForm','validateOperationForImpact','operationCompletionEffect','applySingleOperationImpact','editOperation','newOperation'].every(k=>typeof window[k]==='function');
  }
  function isReturnType(v){return ['installer return','customer return'].includes(norm(v));}
  function returnSource(){return norm(byId('operationType')?.value)==='customer return'?'Customer':'Installer';}
  function hasIdentity(r={}){return !!text(r.inventoryRecordId||r.productId||r.masterId);}
  function formHasIdentity(){return !!text(byId('operationInventoryRecord')?.value||byId('operationProduct')?.dataset?.productId);}
  function linkedInventory(r={}){
    try{
      const rows=loadInventoryRecords();
      let x=r.inventoryRecordId?findInventoryRecordByIdentity(rows,r.inventoryRecordId):null;
      if(!x&&r.productId&&r.location)x=rows.find(v=>String(v.masterId)===String(r.productId)&&norm(v.location)===norm(r.location));
      if(!x&&r.productId)x=rows.find(v=>String(v.masterId)===String(r.productId)&&isCurrentGeneralInventoryRecord(v));
      return x||null;
    }catch{return null}
  }
  function generalReturn(r={}){
    if(!isReturnType(r.type))return false;
    // Product identity wins over stale legacy Unit=Foot / Installer Return carpet defaults.
    return hasIdentity(r);
  }
  function formGeneralReturn(){
    const parent=byId('operationType')?.value,line=byId('operationLineType')?.value;
    return isReturnType(parent)&&isReturnType(line||parent)&&formHasIdentity();
  }
  function normalizeGeneral(r={}){
    if(!generalReturn(r))return r;
    const x=linkedInventory(r);
    if(x){
      if(!r.inventoryRecordId){try{r.inventoryRecordId=inventoryRecordIdentity(x)}catch{r.inventoryRecordId=x.inventoryId||x.id||''}}
      if(!r.productId)r.productId=x.masterId||'';
      r.location=r.location||x.location||'';
      r.unit=boxUnit(x.unit||r.unit||'Box');
    }else r.unit=boxUnit(r.unit)||'Box';
    r.inventoryMode='Stock';r.returnMaterialKind='General Stock';r.returnSource=norm(r.type)==='customer return'?'Customer':'Installer';
    return r;
  }

  function ensureInstallerOption(){
    const sel=byId('operationLineType');if(!sel)return;
    if(![...sel.options].some(o=>o.value==='Installer Return')){const o=document.createElement('option');o.value='Installer Return';o.textContent='Installer Return';sel.appendChild(o)}
  }
  function ensurePanel(){
    if(byId('universalReturn081'))return byId('universalReturn081');
    const grid=byId('operationInventoryMode')?.closest('.formgrid'),anchor=byId('operationInventoryMode')?.parentElement;if(!grid||!anchor)return null;
    byId('universalReturn080')?.remove();
    const p=document.createElement('div');p.id='universalReturn081';p.className='full';p.style.display='none';
    p.innerHTML=`<div style="border:1px solid #cfe0f6;background:#f7fbff;border-radius:16px;padding:14px"><div style="font-size:19px;font-weight:900;color:#17365f">↩️ Return to Warehouse</div><div style="font-size:12px;color:#667085;line-height:1.45;margin:4px 0 10px">Return Source tells us who sent it back. Returned Material decides which inventory engine receives it.</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label>Return Source</label><select id="returnSource081" onchange="runluSetReturnSource081(this.value)"><option>Installer</option><option>Customer</option></select></div><div><label>Returned Material</label><select id="returnMaterial081" onchange="runluSetReturnMaterial081(this.value)"><option>General Stock</option><option>Carpet</option></select></div></div><div id="returnRoute081" style="margin-top:10px;border-radius:12px;background:#eef6ff;padding:10px 12px;font-size:12px;line-height:1.45;color:#29435f"></div></div>`;
    grid.insertBefore(p,anchor);return p;
  }
  function inferredMaterial(){
    if(formHasIdentity())return 'General Stock';
    const line=norm(byId('operationLineType')?.value),unit=norm(byId('operationUnit')?.value);
    return line==='carpet customer return'||(line==='installer return'&&unit==='foot')?'Carpet':'General Stock';
  }
  function syncPanel(){
    const panel=ensurePanel();if(!panel)return;const active=isReturnType(byId('operationType')?.value);panel.style.display=active?'block':'none';if(!active)return;
    const source=returnSource(),material=inferredMaterial();
    if(byId('returnSource081'))byId('returnSource081').value=source;
    if(byId('returnMaterial081'))byId('returnMaterial081').value=material;
    if(byId('operationEditorTitle'))byId('operationEditorTitle').textContent='Return to Warehouse';
    const r=byId('returnRoute081');if(r)r.innerHTML=material==='General Stock'?`<b>${source} → Product Inventory</b><br>Exact Product / Inventory Record controls the route. Returned quantity will be added back using the inventory record's own unit.`:(source==='Installer'?'<b>Installer → Carpet Inventory</b><br>Use source roll + returned length. A traceable child roll is created; the source-roll balance is not increased.':'<b>Customer → Carpet Inventory</b><br>Record the returned carpet roll/length and return rack in Carpet Inventory.');
  }
  function applyGeneralForm(snapshot={}){
    const product=byId('operationProduct'),inv=byId('operationInventoryRecord'),x=linkedInventory({productId:snapshot.productId,inventoryRecordId:snapshot.inventoryRecordId,location:snapshot.location});
    const set=(id,v)=>{const el=byId(id);if(el&&v!==undefined&&v!==null)el.value=v};
    set('operationProduct',snapshot.product);if(product&&snapshot.productId)product.dataset.productId=snapshot.productId;
    set('operationInventoryRecord',snapshot.inventoryRecordId);set('operationCollection',snapshot.collection);set('operationColour',snapshot.colour);set('operationLocation',snapshot.location||x?.location||'');set('operationLot',snapshot.lot);
    set('operationUnit',boxUnit(x?.unit||snapshot.unit||'Box')||'Box');
    const show=id=>{const el=byId(id);if(el)el.style.display='block'},hide=id=>{const el=byId(id);if(el)el.style.display='none'};
    show('operationInventoryRecordWrap');show('operationProductSearchWrap');show('operationQtyWrap');hide('operationRollWrap');hide('operationWidthWrap');hide('operationInchesWrap');hide('operationWorkflowNotice');
    const lm=byId('operationLineInventoryMode');if(lm){lm.value='Stock';lm.disabled=false}const pm=byId('operationInventoryMode');if(pm)pm.value='Stock';
    const ql=byId('operationQtyLabel');if(ql)ql.textContent='Returned Quantity';const ll=byId('operationLocationLabel');if(ll)ll.textContent='Return Location';
    if(inv&&x&&!inv.value){try{inv.value=inventoryRecordIdentity(x)}catch{}}
    syncPanel();
  }

  function setReturnMaterial(material){
    const source=returnSource(),carpet=material==='Carpet';ensureInstallerOption();
    const line=byId('operationLineType'),mode=byId('operationLineInventoryMode'),unit=byId('operationUnit'),product=byId('operationProduct'),inv=byId('operationInventoryRecord'),roll=byId('operationRoll');
    if(carpet){if(line)line.value=source==='Customer'?'Carpet Customer Return':'Installer Return';if(unit)unit.value='Foot';if(product){product.value='';product.dataset.productId=''}if(inv)inv.value='';if(mode){mode.value='Stock';mode.disabled=true}}
    else{if(line)line.value=source==='Customer'?'Customer Return':'Installer Return';if(roll){roll.value='';delete roll.dataset.carpetRecordId}if(mode){mode.value='Stock';mode.disabled=false}const x=linkedInventory({inventoryRecordId:inv?.value,productId:product?.dataset?.productId});if(unit)unit.value=boxUnit(x?.unit||unit.value||'Box')||'Box';}
    try{window.updateOperationForm()}catch{}syncPanel();try{scheduleOperationDraft()}catch{}
  }
  function setReturnSource(source){
    source=source==='Customer'?'Customer':'Installer';const parent=byId('operationType');if(parent)parent.value=source==='Customer'?'Customer Return':'Installer Return';const pm=byId('operationInventoryMode');if(pm)pm.value='Stock';setReturnMaterial(byId('returnMaterial081')?.value||inferredMaterial());
  }
  function startUniversalReturn(source='Installer'){
    const oldNew=window.__RUNLU081_OLD_NEW__;if(typeof oldNew!=='function')return;
    oldNew('',true);if(byId('operationStatus'))byId('operationStatus').value='Completed';if(byId('operationInventoryMode'))byId('operationInventoryMode').value='Stock';setReturnSource(source);setReturnMaterial('General Stock');setTimeout(()=>byId('operationProduct')?.focus(),50);
  }

  function install(){
    if(installed||installing||!coreReady())return false;installing=true;
    try{
      installed=true;window.__RUNLU_BUILD081__=true;ensureInstallerOption();ensurePanel();

      const oldNew=window.newOperation;window.__RUNLU081_OLD_NEW__=oldNew;
      const oldStart=window.startCommandOperation;
      const oldUpdate=window.updateOperationForm;
      const oldItem=window.operationItemFromForm;
      const oldValidate=window.validateOperationForImpact;
      const oldEffect=window.operationCompletionEffect;
      const oldApply=window.applySingleOperationImpact;
      const oldLength=window.isCarpetLengthOperation;
      const oldEdit=window.editOperation;
      const oldRestore=window.restoreOperationDraft;
      const oldCarpetInstaller=window.startInstallerReturn;

      window.isCarpetLengthOperation=function(type,unit){if(isReturnType(type)&&formHasIdentity())return false;return oldLength(type,unit)};
      window.updateOperationForm=function(){
        const parent=text(byId('operationType')?.value),line=text(byId('operationLineType')?.value),product=byId('operationProduct'),inv=byId('operationInventoryRecord');
        const snap={productId:text(product?.dataset?.productId),product:text(product?.value),inventoryRecordId:text(inv?.value),unit:text(byId('operationUnit')?.value),collection:text(byId('operationCollection')?.value),colour:text(byId('operationColour')?.value),location:text(byId('operationLocation')?.value),lot:text(byId('operationLot')?.value)};
        const general=isReturnType(parent)&&isReturnType(line||parent)&&!!text(snap.productId||snap.inventoryRecordId);
        const out=oldUpdate();if(general)applyGeneralForm(snap);else syncPanel();return out;
      };
      window.operationItemFromForm=function(requireContent=false){
        const item=oldItem(requireContent);if(!item)return item;const parent=byId('operationType')?.value;
        if(!isReturnType(parent))return item;
        const source=returnSource();if(hasIdentity(item)){item.type=source==='Customer'?'Customer Return':'Installer Return';normalizeGeneral(item)}else{item.returnSource=source;item.returnMaterialKind='Carpet';item.inventoryMode='Stock';item.type=source==='Customer'?'Carpet Customer Return':'Installer Return';item.unit='Foot'}return item;
      };
      window.validateOperationForImpact=function(r){if(!generalReturn(r))return oldValidate(r);normalizeGeneral(r);const qty=Number(r.quantity||0),x=linkedInventory(r);if(r.inventoryMode!=='Stock')return'';if(!(qty>0))return'Enter the returned inventory quantity.';if(!text(r.productId))return'Choose the exact Product Master for this return.';if(!x)return'Choose the exact Existing Inventory Record / return location.';if(String(x.masterId)!==String(r.productId))return'The selected inventory record does not belong to the selected product.';return''};
      window.operationCompletionEffect=function(type,item){const r={...item,type:item?.type||type};if(!generalReturn(r))return oldEffect(type,item);normalizeGeneral(r);const x=linkedInventory(r),qty=Number(operationStockQuantity(r)||r.quantity||0),unit=boxUnit(operationStockUnit(r)||x?.unit||r.unit||'Box'),before=Number(x?.quantity||0),after=Number((before+qty).toFixed(2));return x?`Return to Product Inventory · ${before} → ${after} ${unit} at ${x.location||r.location||'selected location'}`:`Return +${qty} ${unit} to linked Product Inventory`};
      window.applySingleOperationImpact=function(r){
        if(!generalReturn(r))return oldApply(r);if(r.impactApplied||r.status!=='Completed')return true;if(r.inventoryMode!=='Stock')return oldApply(r);normalizeGeneral(r);const err=window.validateOperationForImpact(r);if(err){alert(err);return false}
        try{const qty=Number(operationStockQuantity(r)||r.quantity||0),change=applyInventoryDelta(r,qty),unit=boxUnit(change?.unit||operationStockUnit(r)||r.unit||'Box'),loc=r.location||linkedInventory(r)?.location||'selected location';r.unit=unit;r.itemStatus='Completed';r.inventoryVerified=true;r.inventoryVerifiedAt=new Date().toISOString();r.impactApplied=true;r.impactResult=`${r.returnSource||returnSource()} Return to Product Inventory: ${change.before} → ${change.after} ${unit} at ${loc}`;r.appliedAt=new Date().toISOString();return true}catch(e){alert('Linked update stopped: '+e.message);return false}
      };
      window.startCommandOperation=function(type){if(!bypassStart&&norm(type)==='installer return')return startUniversalReturn('Installer');if(!bypassStart&&norm(type)==='customer return')return startUniversalReturn('Customer');return oldStart(type)};
      window.startInstallerReturn=function(roll){bypassStart=true;try{oldCarpetInstaller(roll)}finally{bypassStart=false}if(byId('operationType'))byId('operationType').value='Installer Return';if(byId('operationLineType'))byId('operationLineType').value='Installer Return';if(byId('operationUnit'))byId('operationUnit').value='Foot';syncPanel();};
      window.editOperation=function(id){const out=oldEdit(id);setTimeout(()=>{try{const r=operationRecords().find(x=>x.id===Number(id));if(r&&isReturnType(r.type)&&hasIdentity(r)){const p=byId('operationProduct');if(p&&r.productId)p.dataset.productId=r.productId;if(byId('operationInventoryRecord'))byId('operationInventoryRecord').value=r.inventoryRecordId||'';if(byId('operationUnit'))byId('operationUnit').value=boxUnit(linkedInventory(r)?.unit||r.unit||'Box');window.updateOperationForm()}syncPanel()}catch{}},0);return out};
      window.restoreOperationDraft=function(d){const out=oldRestore(d);setTimeout(()=>{try{window.updateOperationForm()}catch{}syncPanel()},0);return out};

      window.runluSetReturnSource081=setReturnSource;window.runluSetReturnMaterial081=setReturnMaterial;window.startUniversalReturn=startUniversalReturn;
      window.runluDeferredReturnGuard={version:VERSION,build:BUILD,generalReturn};
      syncPanel();
      return true;
    }finally{installing=false}
  }

  let tries=0;const timer=setInterval(()=>{if(install()||++tries>240)clearInterval(timer)},100);
  window.addEventListener('load',()=>setTimeout(install,0));window.addEventListener('pageshow',()=>setTimeout(()=>{install();syncPanel()},0));
})();
