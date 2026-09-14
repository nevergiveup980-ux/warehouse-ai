// RUNLU Warehouse OS V6.12.30 Build125 · Pending shared-carpet placeholder adoption.
// Some legacy imports intentionally created zero-length Pending records such as CHC022-9692
// before the physical roll arrived. When CHC022/CHC023 + the same Manufacturer Roll is later
// received, update that placeholder in place instead of treating it as a duplicate or creating
// a second physical record. Active/used records remain protected as true duplicates.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD125_PENDING_CARPET_ADOPTION__)return;
  window.__RUNLU_BUILD125_PENDING_CARPET_ADOPTION__=true;

  const BUILD='125';
  const CARPET='runlu_carpet_inventory_v52';
  const SHARED=new Set(['CHC022','CHC023']);
  const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
  const text=v=>String(v??'').trim();
  const safe=v=>text(v).toUpperCase().replace(/[^A-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const isSharedRoll=v=>SHARED.has(norm(v));

  function localRows(){
    try{const rows=typeof window.carpetRecords==='function'?window.carpetRecords():[];return Array.isArray(rows)?rows:[]}catch{return []}
  }
  function label(r={}){
    return [text(r.roll)||'Roll',text(r.collection||r.product),text(r.colour||r.color),text(r.manufacturerRoll)?'MFG '+text(r.manufacturerRoll):'',text(r.location)?'Rack '+text(r.location):'',text(r.status)].filter(Boolean).join(' · ');
  }
  function isPendingPlaceholder(item={},record={}){
    const code=norm(item.roll),mfr=norm(item.manufacturerRoll);if(!isSharedRoll(code)||!mfr||norm(record.manufacturerRoll)!==mfr)return false;
    const rr=norm(record.roll||record._cloudRecordId),source=norm(record.sourceRoll);
    const family=source===code||rr===`${code}-${mfr}`||rr.startsWith(code+'-');
    const state=new Set([norm(record.status),norm(record.sourceStatus)]);
    const pending=[...state].some(v=>['PENDING','CHECK','WAITING','INCOMING'].includes(v));
    return family&&Number(record.length||0)<=0&&pending&&!text(record.sourceOperationId);
  }
  function localManufacturer(mfr){const wanted=norm(mfr);return wanted?localRows().find(r=>norm(r.manufacturerRoll)===wanted)||null:null}
  function localRoll(roll){const wanted=norm(roll);return wanted?localRows().find(r=>norm(r.roll)===wanted)||null:null}

  function formReceivingItems(){
    const out=[];
    try{if(typeof operationItemsDraft!=='undefined'&&Array.isArray(operationItemsDraft))out.push(...operationItemsDraft.map(clone))}catch(_){}
    try{if(typeof window.operationItemFromForm==='function'){const x=window.operationItemFromForm(true);if(x)out.push(x)}}catch(_){}
    if(!out.length){
      const type=document.getElementById('operationLineType')?.value||document.getElementById('operationType')?.value||'';
      const roll=document.getElementById('operationRoll')?.value||'';
      if(type||roll)out.push({type,roll,manufacturerRoll:document.getElementById('operationManufacturerRoll')?.value||''});
    }
    return out.map(x=>({...x,type:x.type||document.getElementById('operationType')?.value||''})).filter(x=>x.type==='Carpet Receiving');
  }
  function savedReceivingItems(x={}){
    const raw=Array.isArray(x.items)&&x.items.length?x.items:[x];
    return raw.map(i=>({...i,type:i.type||x.type})).filter(i=>i.type==='Carpet Receiving');
  }
  function batchDuplicate(items){
    const rolls=new Set(),mfrs=new Set();
    for(const item of items){
      const r=norm(item.roll);if(r&&!isSharedRoll(r)){if(rolls.has(r))return {kind:'roll',item};rolls.add(r)}
      const m=norm(item.manufacturerRoll);if(m){if(mfrs.has(m))return {kind:'manufacturer',item};mfrs.add(m)}
    }
    return null;
  }

  async function cloudRows(){
    if(typeof window.cloudEnsureSession!=='function'||typeof window.cloudRequest!=='function'||typeof window.cloudHeaders!=='function')throw new Error('Warehouse Cloud is not ready.');
    const s=await window.cloudEnsureSession();if(!s?.access_token)throw new Error('Warehouse Cloud sign-in is required.');
    const path='/rest/v1/warehouse_records?select=record_id,payload,version,deleted_at,updated_at&user_id=eq.'+encodeURIComponent(s.user.id)+'&dataset_key=eq.'+encodeURIComponent(CARPET)+'&deleted_at=is.null&order=record_id.asc&limit=1000';
    const rows=await window.cloudRequest(path,{headers:window.cloudHeaders(s.access_token,false)});
    if(!Array.isArray(rows))throw new Error('Warehouse Cloud carpet lookup returned an invalid result.');return rows;
  }
  function cloudPayload(row={}){
    const p=row.payload&&typeof row.payload==='object'?clone(row.payload):{};
    if(!text(p.roll))p.roll=text(row.record_id);p._cloudRecordId=text(row.record_id);return p;
  }
  function duplicateManufacturerMessage(item,record){return `Manufacturer Roll ${text(item.manufacturerRoll)} already belongs to ${label(record)}.\n\nThe receiving record was NOT applied.`}
  function duplicateRollMessage(item,record){return `Roll ${norm(item.roll)} already exists in Carpet Inventory.\n\n${label(record)}\n\nThe receiving record was NOT applied.`}

  async function validateItems(items,{requireCloud=false,announce=true}={}){
    const list=(Array.isArray(items)?items:[]).filter(Boolean);if(!list.length)return {ok:true};
    const repeated=batchDuplicate(list);
    if(repeated){const msg=repeated.kind==='manufacturer'?`Manufacturer Roll ${text(repeated.item.manufacturerRoll)} appears more than once in this receiving batch.`:`Roll ${norm(repeated.item.roll)} appears more than once in this receiving batch.`;if(announce)alert(msg);return {ok:false,reason:repeated.kind==='manufacturer'?'batch-manufacturer-duplicate':'batch-duplicate'}}
    for(const item of list){
      if(!text(item.roll)){if(announce)alert('Enter the Carpet Roll # before receiving stock.');return {ok:false,reason:'missing-roll'}}
      if(!isSharedRoll(item.roll)){
        const lr=localRoll(item.roll);if(lr){if(announce)alert(duplicateRollMessage(item,lr));return {ok:false,reason:'local-duplicate',record:lr}}
      }
      const lm=localManufacturer(item.manufacturerRoll);
      if(lm&&!isPendingPlaceholder(item,lm)){if(announce)alert(duplicateManufacturerMessage(item,lm));return {ok:false,reason:'local-manufacturer-duplicate',record:lm}}
    }
    let rows=[];try{rows=await cloudRows()}catch(e){if(requireCloud){if(announce)alert(`Live Warehouse Cloud is required before completed Carpet Receiving can change inventory.\n\n${e?.message||e}\n\nNothing was applied.`);return {ok:false,reason:'cloud-unavailable'}}return {ok:true,warning:'cloud-unavailable-draft'}}
    const remote=rows.map(cloudPayload);
    for(const item of list){
      if(!isSharedRoll(item.roll)){
        const hit=remote.find(r=>norm(r._cloudRecordId)===norm(item.roll)||norm(r.roll)===norm(item.roll));
        if(hit){if(announce)alert(duplicateRollMessage(item,hit));return {ok:false,reason:'cloud-duplicate',record:hit}}
      }
      const m=norm(item.manufacturerRoll);if(m){
        const mh=remote.find(r=>norm(r.manufacturerRoll)===m);
        if(mh&&!isPendingPlaceholder(item,mh)){if(announce)alert(duplicateManufacturerMessage(item,mh));return {ok:false,reason:'manufacturer-duplicate',record:mh}}
      }
    }
    return {ok:true};
  }

  function unwrapBuild120(fn){return typeof fn==='function'&&fn.__build120&&typeof fn.__original==='function'?fn.__original:fn}
  function installSaveGuard(){
    const current=window.saveOperation;if(typeof current!=='function'||current.__build125)return false;const bypass=unwrapBuild120(current);
    const wrapped=async function(){const items=formReceivingItems();if(!items.length)return current.apply(this,arguments);const requireCloud=(document.getElementById('operationStatus')?.value||'')==='Completed';const v=await validateItems(items,{requireCloud});if(!v.ok)return false;return bypass.apply(this,arguments)};
    wrapped.__build125=true;wrapped.__original=current;window.saveOperation=wrapped;return true;
  }
  function installAddLineGuard(){
    const current=window.addOperationItem;if(typeof current!=='function'||current.__build125)return false;const bypass=unwrapBuild120(current);
    const wrapped=async function(){const items=formReceivingItems();if(!items.length)return current.apply(this,arguments);const v=await validateItems(items,{requireCloud:false});if(!v.ok)return false;return bypass.apply(this,arguments)};
    wrapped.__build125=true;wrapped.__original=current;window.addOperationItem=wrapped;return true;
  }
  function installCompletionGuard(){
    const current=window.setOperationStatus;if(typeof current!=='function'||current.__build125)return false;const bypass=unwrapBuild120(current);
    const wrapped=async function(id,status){if(status!=='Completed')return current.apply(this,arguments);let x=null;try{x=(typeof window.operationRecords==='function'?window.operationRecords():[]).find(r=>Number(r.id)===Number(id))}catch(_){}const items=savedReceivingItems(x||{});if(!items.length)return current.apply(this,arguments);const v=await validateItems(items,{requireCloud:true});if(!v.ok)return false;return bypass.apply(this,arguments)};
    wrapped.__build125=true;wrapped.__original=current;window.setOperationStatus=wrapped;return true;
  }

  function finishImpact(r,result){
    try{const events=load(EVENTDB),exists=events.some(e=>String(e.operationId)===String(r.id)&&String(e.type)===String(r.type));if(!exists){events.unshift({id:Date.now()+Math.random(),operationId:r.id,time:new Date().toISOString(),type:r.type,reference:r.po||r.roll||r.product,result});save(EVENTDB,events)}}catch(e){console.warn('[Build125] event log',e)}
    r.impactApplied=true;r.impactResult=result;r.appliedAt=new Date().toISOString();return true;
  }
  function adoptPendingPlaceholder(r,hit){
    try{
      const err=typeof validateOperationForImpact==='function'?validateOperationForImpact(r):'';if(err){alert(err);return false}
      const rows=carpetRecords(),target=rows.find(x=>String(x.id)===String(hit.id))||rows.find(x=>norm(x.manufacturerRoll)===norm(r.manufacturerRoll)&&isPendingPlaceholder(r,x));if(!target)throw new Error('The Pending carpet placeholder is no longer available. Refresh and try again.');
      const now=new Date().toISOString(),oldCloudId=text(target.cloudRecordId||target._cloudRecordId||target.roll),physicalRollId=text(target.physicalRollId)||`LEGACY-${safe(oldCloudId||`${norm(r.roll)}-${r.manufacturerRoll}`)}`,cloudRecordId=oldCloudId||`${norm(r.roll)}__${physicalRollId}`;
      Object.assign(target,{
        roll:norm(r.roll),sourceRoll:norm(r.roll),physicalRollId,cloudRecordId,sharedRollCode:true,
        manufacturerRoll:typeof cleanManufacturerRoll==='function'?cleanManufacturerRoll(r.manufacturerRoll):text(r.manufacturerRoll),
        lot:r.lot||target.lot||'',collection:r.collection||r.product||target.collection||'Carpet',colour:r.colour||target.colour||'',
        length:Number(r.quantity||0),originalLength:Number(r.quantity||0),width:r.width||target.width||'12',location:r.location||target.location||'Receiving',
        measure:'FULL',status:Number(r.quantity||0)<3?'Used Up':'Active',tmRequired:false,warehouseScope:'warehouse',transferredOut:false,
        po:r.po||target.po||'',supplier:r.supplier||target.supplier||'',sqYd:Number(r.sqYd||target.sqYd||0),weightLb:Number(r.weightLb||target.weightLb||0),
        sourceStatus:'RECEIVED',sourceOperationId:r.id,arrivalPlaceholderId:oldCloudId,arrivalPlaceholderAdoptedAt:now,receivedAt:now,updatedAt:now,reviewNote:''
      });
      if(!target.createdAt)target.createdAt=now;
      if(!save(CARPETDB,rows))throw new Error(`Pending placeholder ${oldCloudId||r.manufacturerRoll} could not be updated.`);
      const verified=load(CARPETDB).some(x=>String(x.id)===String(target.id)&&String(x.sourceOperationId||'')===String(r.id)&&norm(x.roll)===norm(r.roll)&&Number(x.length||0)>0);
      if(!verified)throw new Error('Pending placeholder update failed post-save verification. The operation was not linked.');
      return finishImpact(r,`Pending carpet placeholder ${oldCloudId||r.manufacturerRoll} received in place as ${norm(r.roll)} · MFG ${r.manufacturerRoll} · ${Number(r.quantity||0)} ft · Rack ${r.location||'Receiving'} · FULL`);
    }catch(e){alert('Linked update stopped: '+(e?.message||e));return false}
  }
  function installImpact(){
    const current=window.applySingleOperationImpact;if(typeof current!=='function'||current.__build125)return false;
    const wrapped=function(r){
      if(r&&r.type==='Carpet Receiving'&&r.inventoryMode==='Stock'&&r.status==='Completed'&&!r.impactApplied&&isSharedRoll(r.roll)&&text(r.manufacturerRoll)){
        const hit=localManufacturer(r.manufacturerRoll);if(hit&&isPendingPlaceholder(r,hit))return adoptPendingPlaceholder(r,hit);
      }
      return current.apply(this,arguments);
    };
    wrapped.__build125=true;wrapped.__original=current;window.applySingleOperationImpact=wrapped;return true;
  }
  function installManifestGuard(){
    const current=window.manifestIssues;if(typeof current!=='function'||current.__build125)return false;
    const wrapped=function(row,index){let issues=current.apply(this,arguments);if(!Array.isArray(issues)||!isSharedRoll(row?.roll)||!text(row?.manufacturerRoll))return issues;const hit=localManufacturer(row.manufacturerRoll);if(hit&&isPendingPlaceholder({roll:row.roll,manufacturerRoll:row.manufacturerRoll},hit))issues=issues.filter(x=>String(x?.text||'')!=='This manufacturer roll already exists in Carpet Inventory.');return issues};
    wrapped.__build125=true;wrapped.__original=current;window.manifestIssues=wrapped;return true;
  }

  function hintElement(){return document.getElementById('build120RollIdentityHint')}
  function paintLocalPlaceholderHint(){
    const roll=document.getElementById('operationRoll')?.value||'',mfr=document.getElementById('operationManufacturerRoll')?.value||'';if(!isSharedRoll(roll)||!text(mfr))return;
    const hit=localManufacturer(mfr),hint=hintElement();if(!hint)return;
    if(hit&&isPendingPlaceholder({roll,manufacturerRoll:mfr},hit)){
      hint.textContent=`✓ ${norm(roll)} / MFG ${text(mfr)} matches an existing Pending arrival placeholder. Completing receiving will update that record in place.`;hint.style.fontWeight='800';hint.style.color='#176b40';const input=document.getElementById('operationRoll');if(input)input.style.borderColor='#2f9d62';
    }
  }
  function bindHint(){
    for(const id of ['operationRoll','operationManufacturerRoll']){const el=document.getElementById(id);if(!el||el.dataset.build125Bound==='1')continue;el.dataset.build125Bound='1';el.addEventListener('input',()=>setTimeout(paintLocalPlaceholderHint,750));el.addEventListener('blur',()=>setTimeout(paintLocalPlaceholderHint,900))}
  }
  function install(){installSaveGuard();installAddLineGuard();installCompletionGuard();installImpact();installManifestGuard();bindHint();document.documentElement.setAttribute('data-runlu-pending-carpet-adoption',BUILD)}
  install();let tries=0;const timer=setInterval(()=>{install();if(++tries>140)clearInterval(timer)},100);
  window.addEventListener('pageshow',()=>setTimeout(install,40));

  window.RUNLUPendingCarpetAdoptionBuild125={version:BUILD,isSharedRoll,isPendingPlaceholder,validateItems,adoptPendingPlaceholder};
})();
