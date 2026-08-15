// RUNLU Warehouse AI V6.10.0 Build080 — Universal Return Engine
(() => {
  if (window.__RUNLU_BUILD080__) return;
  window.__RUNLU_BUILD080__ = true;

  const VERSION='6.10.0', BUILD='080';
  let bypassUnifiedStart=false;
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/\s+/g,' ').trim();
  const byId=id=>document.getElementById(id);
  const isReturnType=t=>['installer return','customer return'].includes(norm(t));
  const sourceName=()=>norm(byId('operationType')?.value)==='customer return'?'Customer':'Installer';
  const drafts=()=>{try{return typeof operationItemsDraft!=='undefined'&&Array.isArray(operationItemsDraft)?operationItemsDraft:[]}catch{return[]}};

  function ensureInstallerLineOption(){
    const sel=byId('operationLineType');if(!sel)return;
    if(![...sel.options].some(o=>o.value==='Installer Return')){
      const opt=document.createElement('option');opt.value='Installer Return';opt.textContent='Installer Return';
      const customer=[...sel.options].find(o=>o.value==='Customer Return');
      if(customer)sel.insertBefore(opt,customer);else sel.appendChild(opt);
    }
  }

  function ensurePanel(){
    if(byId('universalReturn080'))return byId('universalReturn080');
    const grid=byId('operationInventoryMode')?.closest('.formgrid');
    const inventoryBlock=byId('operationInventoryMode')?.parentElement;
    if(!grid||!inventoryBlock)return null;
    const panel=document.createElement('div');panel.id='universalReturn080';panel.className='full';panel.style.display='none';
    panel.innerHTML=`<div class="return080Card"><div class="return080Title">↩️ Return to Warehouse</div><div class="return080Meta">Step 1: where did the material come from? Step 2: what kind of material is being returned?</div><div class="return080Grid"><div><label>Return Source</label><select id="returnSource080" onchange="runluSetReturnSource080(this.value)"><option>Installer</option><option>Customer</option></select></div><div><label>Returned Material</label><select id="returnMaterial080" onchange="runluSetReturnMaterial080(this.value)"><option value="General Stock">General Stock</option><option value="Carpet">Carpet</option></select></div></div><div id="returnRoute080" class="return080Route"></div></div>`;
    grid.insertBefore(panel,inventoryBlock);
    if(!byId('build080Style')){const s=document.createElement('style');s.id='build080Style';s.textContent=`.return080Card{border:1px solid #cfe0f6;background:linear-gradient(145deg,#f5f9ff,#fff);border-radius:16px;padding:14px}.return080Title{font-size:19px;font-weight:900;color:#17365f}.return080Meta{font-size:12px;color:#667085;line-height:1.45;margin:4px 0 10px}.return080Grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.return080Grid label{margin-top:0}.return080Route{margin-top:10px;border-radius:12px;background:#eef6ff;padding:10px 12px;font-size:12px;line-height:1.45;color:#29435f}.return080Route b{color:#17365f}@media(max-width:560px){.return080Grid{grid-template-columns:1fr}}`;document.head.appendChild(s)}
    return panel;
  }

  function returnMaterialFromForm(){const line=norm(byId('operationLineType')?.value),unit=norm(byId('operationUnit')?.value);if(line==='carpet customer return')return'Carpet';if(line==='installer return'&&unit==='foot')return'Carpet';return'General Stock'}
  function syncPanel(){
    ensureInstallerLineOption();const panel=ensurePanel();if(!panel)return;const active=isReturnType(byId('operationType')?.value);panel.style.display=active?'block':'none';if(!active)return;
    const source=sourceName(),material=returnMaterialFromForm();if(byId('returnSource080'))byId('returnSource080').value=source;if(byId('returnMaterial080'))byId('returnMaterial080').value=material;if(byId('operationEditorTitle'))byId('operationEditorTitle').textContent='Return to Warehouse';
    const route=byId('returnRoute080');if(route){if(material==='Carpet')route.innerHTML=source==='Installer'?'<b>Installer → Carpet Inventory</b><br>Enter the original/source roll and returned length. The return stays traceable as a child roll; the source-roll balance is not increased.':'<b>Customer → Carpet Inventory</b><br>Record the returned carpet roll, length and return rack/location. Carpet stays in the independent Carpet Inventory workflow.';else route.innerHTML=`<b>${source} → Product Inventory</b><br>Select the exact Product Master / Existing Inventory Record. The returned quantity is added back to that stock record using its own unit (Box, Roll, Piece, Pail, etc.).`}
  }

  function setGeneralLine(source){
    ensureInstallerLineOption();const line=byId('operationLineType'),unit=byId('operationUnit'),mode=byId('operationLineInventoryMode'),roll=byId('operationRoll');
    if(line)line.value=source==='Customer'?'Customer Return':'Installer Return';if(mode){mode.value='Stock';mode.disabled=false}if(unit&&norm(unit.value)==='foot')unit.value='Box';if(roll){roll.value='';delete roll.dataset.carpetRecordId}
    ['operationCollection','operationColour','operationLot','operationLocation'].forEach(id=>{const el=byId(id);if(el)el.value=''});try{updateOperationForm()}catch{}syncPanel();
  }
  function setCarpetLine(source){
    ensureInstallerLineOption();const line=byId('operationLineType'),unit=byId('operationUnit'),mode=byId('operationLineInventoryMode'),product=byId('operationProduct'),inv=byId('operationInventoryRecord');
    if(line)line.value=source==='Customer'?'Carpet Customer Return':'Installer Return';if(mode){mode.value='Stock';mode.disabled=true}if(unit)unit.value='Foot';if(product){product.value='';product.dataset.productId=''}if(inv)inv.value='';
    ['operationCollection','operationColour','operationLot','operationLocation'].forEach(id=>{const el=byId(id);if(el)el.value=''});const roll=byId('operationRoll');if(roll){roll.value='';delete roll.dataset.carpetRecordId}try{updateOperationForm()}catch{}syncPanel();
  }
  function retagExistingItems(source){for(const item of drafts()){const carpet=item.returnMaterialKind==='Carpet'||norm(item.type)==='carpet customer return'||(norm(item.type)==='installer return'&&norm(item.unit)==='foot');item.returnSource=source;item.returnMaterialKind=carpet?'Carpet':'General Stock';item.type=carpet?(source==='Customer'?'Carpet Customer Return':'Installer Return'):(source==='Customer'?'Customer Return':'Installer Return');item.inventoryMode='Stock'}}
  function setReturnSource(source){
    source=source==='Customer'?'Customer':'Installer';const old=sourceName(),items=drafts();if(old!==source&&items.length&&!confirm(`Change Return Source from ${old} to ${source}?\n\nAll ${items.length} return item(s) will keep their material identity but be relabeled to the new return source.`)){syncPanel();return}
    const parent=source==='Customer'?'Customer Return':'Installer Return';if(byId('operationType'))byId('operationType').value=parent;if(byId('operationInventoryMode'))byId('operationInventoryMode').value='Stock';if(old!==source&&items.length)retagExistingItems(source);
    const material=byId('returnMaterial080')?.value||returnMaterialFromForm();if(material==='Carpet')setCarpetLine(source);else setGeneralLine(source);try{renderOperationItems()}catch{}try{scheduleOperationDraft()}catch{}
  }
  function setReturnMaterial(material){material=material==='Carpet'?'Carpet':'General Stock';const source=sourceName();if(material==='Carpet')setCarpetLine(source);else setGeneralLine(source);try{scheduleOperationDraft()}catch{}}
  function startUniversalReturn(source='Installer'){try{newOperation('',true)}catch{return}if(byId('operationStatus'))byId('operationStatus').value='Completed';if(byId('operationInventoryMode'))byId('operationInventoryMode').value='Stock';setReturnSource(source==='Customer'?'Customer':'Installer');setReturnMaterial('General Stock');const p=byId('operationProduct');if(p)setTimeout(()=>p.focus(),80)}

  window.runluSetReturnSource080=setReturnSource;window.runluSetReturnMaterial080=setReturnMaterial;window.startUniversalReturn=startUniversalReturn;
  const oldStart=window.startCommandOperation;if(typeof oldStart==='function'){window.startCommandOperation=function(type){if(!bypassUnifiedStart&&norm(type)==='installer return')return startUniversalReturn('Installer');if(!bypassUnifiedStart&&norm(type)==='customer return')return startUniversalReturn('Customer');return oldStart(type)}}
  const oldCarpetInstaller=window.startInstallerReturn;if(typeof oldCarpetInstaller==='function'){window.startInstallerReturn=function(roll){bypassUnifiedStart=true;try{oldCarpetInstaller(roll)}finally{bypassUnifiedStart=false}if(byId('operationType'))byId('operationType').value='Installer Return';if(byId('operationLineType'))byId('operationLineType').value='Installer Return';if(byId('operationUnit'))byId('operationUnit').value='Foot';if(byId('operationInventoryMode'))byId('operationInventoryMode').value='Stock';if(byId('operationLineInventoryMode'))byId('operationLineInventoryMode').value='Stock';try{updateOperationForm()}catch{}syncPanel()}}
  const oldItemFromForm=window.operationItemFromForm;if(typeof oldItemFromForm==='function'){window.operationItemFromForm=function(requireContent=false){const item=oldItemFromForm(requireContent);if(!item||!isReturnType(byId('operationType')?.value))return item;const source=sourceName(),material=returnMaterialFromForm();item.returnSource=source;item.returnMaterialKind=material;item.inventoryMode='Stock';item.type=material==='Carpet'?(source==='Customer'?'Carpet Customer Return':'Installer Return'):(source==='Customer'?'Customer Return':'Installer Return');if(material==='Carpet')item.unit='Foot';return item}}
  const oldClear=window.clearOperationItemFields;if(typeof oldClear==='function'){window.clearOperationItemFields=function(){const wasReturn=isReturnType(byId('operationType')?.value),source=sourceName();const out=oldClear();if(wasReturn){if(byId('operationType'))byId('operationType').value=source==='Customer'?'Customer Return':'Installer Return';if(byId('operationInventoryMode'))byId('operationInventoryMode').value='Stock';setGeneralLine(source)}return out}}
  const oldUpdate=window.updateOperationForm;if(typeof oldUpdate==='function'){window.updateOperationForm=function(){const out=oldUpdate();syncPanel();return out}}
  const oldEdit=window.editOperation;if(typeof oldEdit==='function')window.editOperation=function(id){const out=oldEdit(id);setTimeout(syncPanel,0);return out};const oldRestore=window.restoreOperationDraft;if(typeof oldRestore==='function')window.restoreOperationDraft=function(d){const out=oldRestore(d);setTimeout(syncPanel,0);return out};const oldNew=window.newOperation;if(typeof oldNew==='function')window.newOperation=function(...args){const out=oldNew(...args);setTimeout(syncPanel,0);return out};
  ensureInstallerLineOption();ensurePanel();syncPanel();window.addEventListener('pageshow',()=>setTimeout(syncPanel,50));window.runluUniversalReturnEngine={version:VERSION,build:BUILD,setReturnSource,setReturnMaterial,startUniversalReturn};
})();
