// RUNLU Warehouse OS V6.5.4 Build055 — Warehouse Active Scope hotfix
(() => {
  const B55_EXTERNAL = new Set(['store','installer','branch','customer','customer site','external destination','transferred out']);
  const parts = route => { const p=String(route||'').split('→').map(x=>x.trim()); return {from:p[0]||'',to:p[1]||''}; };
  const isExternalDest = v => B55_EXTERNAL.has(normKey(v));
  const externalStatus = v => { const k=normKey(v); if(k==='store')return 'At Store'; if(k==='installer')return 'With Installer'; if(k==='branch')return 'At Branch'; if(k==='customer'||k==='customer site')return 'With Customer'; return 'Transferred Out'; };
  window.isCarpetWarehouseActive = x => !!x && String(x.status||'').toUpperCase()==='ACTIVE' && x.warehouseScope!=='external' && x.transferredOut!==true && !isExternalDest(x.location);
  const markExternal = (x,destination,route='') => { const d=String(destination||parts(route).to||'External Destination').trim(); x.location=d; x.status=externalStatus(d); x.warehouseScope='external'; x.transferredOut=true; x.transferDestination=d; x.lastTransferRoute=route||x.lastTransferRoute||''; x.transferredAt=new Date().toISOString(); x.tmRequired=false; x.updatedAt=x.transferredAt; return x; };
  const markWarehouse = (x,location='') => { if(location&&normKey(location)!=='warehouse')x.location=location; else if(isExternalDest(x.location))x.location='Receiving'; x.warehouseScope='warehouse'; x.transferredOut=false; delete x.transferDestination; x.status=Number(x.length||0)<3?'Used Up':'Active'; x.updatedAt=new Date().toISOString(); return x; };

  function reconcileCarpets(){
    const rows=carpetRecords(), ops=operationRecords().filter(o=>o.type==='Inventory Transfer'&&o.status==='Completed'&&o.impactApplied); let changed=0;
    rows.forEach(x=>{ if(['INVENTORY TRANSFER','CUT AND TRANSFER'].includes(String(x.relationType||'').toUpperCase())&&isExternalDest(x.location)&&String(x.status||'').toUpperCase()==='ACTIVE'){markExternal(x,x.location,x.transferRoute||'');changed++;} });
    ops.forEach(o=>{
      if(!o.roll)return; const r=rows.find(x=>normKey(x.roll)===normKey(o.roll)); if(!r)return; const p=parts(o.transferRoute||'Warehouse → Store'), dest=String(o.toLocation||p.to||'').trim();
      const whole=!!o.transferWholeRoll || /^Whole Roll\b/i.test(String(o.impactResult||'')) || (Number(o.quantity)>0 && Math.abs(Number(o.quantity)-Number(r.length||0))<0.011);
      if(whole&&normKey(p.from)==='warehouse'&&normKey(p.to)!=='warehouse'&&isExternalDest(dest||p.to)){ const wanted=externalStatus(dest||p.to); if(r.status!==wanted||r.transferredOut!==true){markExternal(r,dest||p.to,o.transferRoute||'');changed++;} }
      else if(whole&&normKey(p.to)==='warehouse'&&!window.isCarpetWarehouseActive(r)){markWarehouse(r,dest);changed++;}
    });
    if(changed)save(CARPETDB,rows); return changed;
  }
  window.reconcileTransferredCarpetStatuses = reconcileCarpets;

  function reconcileGeneral(){
    const inv=loadInventoryRecords(), ops=operationRecords().filter(o=>o.type==='Inventory Transfer'&&o.status==='Completed'&&o.impactApplied&&!o.roll); let changed=0;
    ops.forEach(o=>{ const p=parts(o.transferRoute||'Warehouse → Store'); if(normKey(p.from)!=='warehouse'||normKey(p.to)==='warehouse'||!o.inventoryRecordId)return; const x=findInventoryRecordByIdentity(inv,o.inventoryRecordId); if(x&&Number(x.quantity||0)<=0&&x.lifecycleStatus==='ACTIVE'){x.lifecycleStatus='ARCHIVED';x.warehouseScope='history';x.transferredOut=true;x.transferDestination=o.toLocation||p.to||'External';x.inventoryState='transferred-out';x.lastUpdatedAt=new Date().toISOString();changed++;} });
    if(changed)save(INVDB,inv); return changed;
  }

  const oldApplySingle=window.applySingleOperationImpact;
  if(typeof oldApplySingle==='function') window.applySingleOperationImpact=function(r){ const ok=oldApplySingle(r); if(ok&&r?.type==='Inventory Transfer'&&r.status==='Completed'){reconcileCarpets();reconcileGeneral();} return ok; };

  window.applyInventoryTransfer=function(r){
    const qty=operationStockQuantity(r), route=String(r.transferRoute||'Warehouse → Store'), unit=operationStockUnit(r)||r.unit||'', p=parts(route);
    if(normKey(p.from)==='warehouse'&&normKey(p.to)!=='warehouse'){
      const source=applyInventoryDelta(r,-qty), dest=r.toLocation||p.to||'external destination';
      if(source.after<=0&&r.inventoryRecordId){const inv=loadInventoryRecords(),x=findInventoryRecordByIdentity(inv,r.inventoryRecordId);if(x){x.lifecycleStatus='ARCHIVED';x.warehouseScope='history';x.transferredOut=true;x.transferDestination=dest;x.inventoryState='transferred-out';x.lastUpdatedAt=new Date().toISOString();x.updated=new Date().toLocaleString();save(INVDB,inv);}}
      return `${source.location} ${source.before} → ${source.after} ${unit}; transferred out to ${dest}${source.after<=0?' · source record is no longer Active':''}`;
    }
    if(normKey(p.to)==='warehouse'){const destination={...r,inventoryRecordId:'',location:(r.toLocation&&normKey(r.toLocation)!=='warehouse')?r.toLocation:'Receiving'},target=applyInventoryDelta(destination,qty);return `${target.location} ${target.before} → ${target.after} ${unit}; transferred into warehouse`;}
    const source=applyInventoryDelta(r,-qty);return `${source.location} ${source.before} → ${source.after} ${unit}; external transfer recorded`;
  };

  const oldMove=window.moveInventoryRecord;
  if(typeof oldMove==='function') window.moveInventoryRecord=function(identity){ oldMove(identity); try{const inv=loadInventoryRecords(),record=findInventoryRecordByIdentity(inv,pickerRecordId),source=loadMasters().find(x=>x.id===pickerSourceMasterId)||{}; if(record&&$('pickerContext'))$('pickerContext').innerHTML=`<div style="padding:12px 14px;border-radius:14px;background:#eef7ff;border:1px solid #bfdbfe;color:#172554"><div style="font-size:11px;font-weight:900;letter-spacing:.08em;color:#2563eb">CURRENT PRODUCT ✓</div><div style="font-size:17px;font-weight:900;margin-top:3px">${esc(productDisplayLabel(source)||source.id||'Unknown product')}</div><div style="margin-top:5px"><b>${Number(record.quantity||0)} ${esc(record.unit||'')}</b> · Rack / Location <b>${esc(record.location||'-')}</b></div></div><div style="margin-top:10px;font-weight:700;color:#475569">The list below intentionally excludes the current product. Choose a <b>DIFFERENT</b> product only if this inventory is misclassified.</div>`;}catch(e){console.warn('Build055 move context',e);} };

  const oldMatch=window.carpetMatchesQuickFilter;
  window.carpetMatchesQuickFilter=function(x){const status=String(x.status||'').toUpperCase();if(carpetQuickFilter==='ACTIVE')return window.isCarpetWarehouseActive(x);if(carpetQuickFilter==='TRANSFERRED')return !window.isCarpetWarehouseActive(x)&&status!=='USED UP';return oldMatch(x);};
  const oldAutoRack=window.automaticRackUse;
  window.automaticRackUse=function(code,rows){const scoped=(rows||carpetRecords()).filter(window.isCarpetWarehouseActive);return oldAutoRack(code,scoped);};
  window.refreshOperationCarpetRollPicker=function(){const select=$('operationCarpetRollPicker');if(!select)return;const current=select.value,rows=carpetRecords().filter(r=>window.isCarpetWarehouseActive(r)&&Number(r.length||0)>=3).sort((a,b)=>String(a.roll||'').localeCompare(String(b.roll||''),undefined,{numeric:true}));select.innerHTML='<option value="">Choose an active carpet roll</option>'+rows.map(r=>`<option value="${esc(r.id)}">${esc(r.roll)} · ${esc(r.collection||'Carpet')} · ${esc(r.colour||'')} · ${feetLabel(r.length)} · ${esc(r.location||'Unassigned')}</option>`).join('');if(rows.some(r=>String(r.id)===String(current)))select.value=current;};
  window.refreshCarpetTransferPicker=function(){const picker=$('operationCarpetTransfer');if(!picker)return;const selected=picker.value,p=parts($('operationTransferRoute')?.value||'Warehouse → Store'),incoming=normKey(p.to)==='warehouse',rows=carpetRecords().filter(r=>Number(r.length)>0&&String(r.status||'').toUpperCase()!=='USED UP').filter(r=>incoming?!window.isCarpetWarehouseActive(r):window.isCarpetWarehouseActive(r));picker.innerHTML=`<option value="">${incoming?'Choose a transferred-out carpet roll':'Choose an active warehouse carpet roll'}</option>`+rows.sort((a,b)=>String(a.roll).localeCompare(String(b.roll),undefined,{numeric:true})).map(r=>`<option value="${esc(r.id)}">${esc(r.roll)} · ${esc(r.collection||'Carpet')} · ${feetLabel(r.length)} · ${esc(r.location||'Unassigned')} · ${esc(r.status||'')}</option>`).join('');if([...picker.options].some(o=>o.value===selected))picker.value=selected;};
  const oldRoute=window.operationTransferRouteChanged; window.operationTransferRouteChanged=function(){oldRoute();window.refreshCarpetTransferPicker();};
  window.voiceCarpetMatches=function(message){const q=voiceNorm(message),words=voiceWords(message);return carpetRecords().filter(window.isCarpetWarehouseActive).map(x=>{const hay=voiceNorm([x.roll,x.collection,x.colour,x.location,x.lot].join(' '));let score=(x.roll&&q.includes(voiceNorm(x.roll)))?10:0;for(const w of words)if(hay.includes(w))score++;return [score,x]}).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0]).map(x=>x[1]).slice(0,8);};

  function addTransferredFilter(){const box=$('carpetStatusFilters');if(!box||box.querySelector('[data-filter="TRANSFERRED"]'))return;const all=box.querySelector('[data-filter="ALL"]'),b=document.createElement('button');b.dataset.filter='TRANSFERRED';b.textContent='Transferred Out';b.onclick=()=>setCarpetQuickFilter('TRANSFERRED');box.insertBefore(b,all||null);}

  reconcileCarpets(); reconcileGeneral(); addTransferredFilter();
  if(typeof carpetQuickFilter!=='undefined'&&!carpetQuickFilter)carpetQuickFilter='ACTIVE';
  try{renderCarpetInventory();renderDashboard();renderMap();}catch(e){console.warn('Build055 refresh',e);}
})();
