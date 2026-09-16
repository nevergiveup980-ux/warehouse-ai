// RUNLU Warehouse OS V6.12.39 Build134 · Carpet Edit Authority + Cut History Editor.
// Non-shared carpet Roll # is one physical inventory identity. Legacy/cloud backup rows
// with the same Roll # are collapsed in the operational view so editing never creates a
// second visible roll. Carpet editing updates the canonical row in place and archives
// compatible backup rows without deleting audit data. Historical cut data can be entered
// or corrected directly from the roll, including when current length is still unknown.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD134_CARPET_EDIT_CUT_HISTORY__)return;
  window.__RUNLU_BUILD134_CARPET_EDIT_CUT_HISTORY__=true;

  const BUILD='134';
  const CARPET='runlu_carpet_inventory_v52';
  const CUT='runlu_cutting_log_v52';
  const EVENT='runlu_event_history_v52';
  const SHARED=new Set(['CHC022','CHC023']);
  const ARCHIVE_STATUS='Archived Duplicate';
  const ARCHIVE_RELATION='LEGACY BACKUP DUPLICATE';
  let cutEditorState={recordId:null,cutId:null};

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ');
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const num=v=>Number(v);
  const parseMs=v=>{const n=Date.parse(text(v));return Number.isFinite(n)?n:0};
  const isShared=v=>SHARED.has(norm(v));
  const isArchived=r=>norm(r?.status)===norm(ARCHIVE_STATUS)||norm(r?.relationType)===norm(ARCHIVE_RELATION)||r?.operationallyHidden===true&&String(r?.archivedByBuild||'')==='134';
  const rawRows=()=>{try{const a=typeof window.load==='function'?window.load(CARPET):JSON.parse(localStorage.getItem(CARPET)||'[]');return Array.isArray(a)?a:[]}catch{return []}};
  const rawCuts=()=>{try{const a=typeof window.load==='function'?window.load(CUT):JSON.parse(localStorage.getItem(CUT)||'[]');return Array.isArray(a)?a:[]}catch{return []}};

  function compatibleManufacturer(a,b){
    const am=norm(a?.manufacturerRoll),bm=norm(b?.manufacturerRoll);
    return !am||!bm||am===bm;
  }
  function completenessScore(r={}){
    let s=0;
    const length=Number(r.length||0),original=Number(r.originalLength||0),status=norm(r.status),measure=norm(r.measure);
    if(length>0)s+=500;
    if(status==='ACTIVE')s+=220;
    if(status==='USED UP')s+=120;
    if(status==='PENDING'||status==='CHECK'||status==='WAITING')s-=100;
    if(original>0)s+=80;
    if(measure==='FULL')s+=45;else if(measure.startsWith('CAL')||measure==='TM')s+=35;
    if(text(r.manufacturerRoll))s+=45;
    if(text(r.collection))s+=25;
    if(text(r.colour))s+=25;
    if(text(r.lot))s+=22;
    if(text(r.location))s+=18;
    if(text(r.width))s+=10;
    if(text(r.sourceOperationId))s+=12;
    if(text(r.physicalRollId)||text(r.cloudRecordId))s+=8;
    s+=Math.min(50,parseMs(r.updatedAt||r.receivedAt||r.createdAt)/1e12);
    return s;
  }
  function chooseCanonical(group=[]){
    return [...group].sort((a,b)=>completenessScore(b)-completenessScore(a)||parseMs(b.updatedAt||b.createdAt)-parseMs(a.updatedAt||a.createdAt)||Number(b.id||0)-Number(a.id||0))[0]||null;
  }
  function logicalRows(rows){
    const visible=(Array.isArray(rows)?rows:[]).filter(r=>!isArchived(r));
    const byRoll=new Map(),out=[];
    for(const r of visible){
      const roll=norm(r?.roll);
      if(!roll||isShared(roll)){out.push(r);continue}
      if(!byRoll.has(roll))byRoll.set(roll,[]);
      byRoll.get(roll).push(r);
    }
    for(const group of byRoll.values()){
      if(group.length===1){out.push(group[0]);continue}
      const mfrs=[...new Set(group.map(r=>norm(r.manufacturerRoll)).filter(Boolean))];
      if(mfrs.length>1){out.push(...group);continue}
      out.push(chooseCanonical(group));
    }
    return out;
  }
  function familyFor(rows,roll,manufacturerRoll=''){
    const wanted=norm(roll),mfr=norm(manufacturerRoll);
    return (Array.isArray(rows)?rows:[]).filter(r=>!isShared(wanted)&&norm(r.roll)===wanted&&(!mfr||!norm(r.manufacturerRoll)||norm(r.manufacturerRoll)===mfr));
  }
  function archiveBackupRows(rows,target,roll,manufacturerRoll){
    if(!target||isShared(roll))return 0;
    const family=familyFor(rows,roll,manufacturerRoll);
    let changed=0;const now=new Date().toISOString();
    for(const r of family){
      if(String(r.id)===String(target.id)||isArchived(r))continue;
      r.status=ARCHIVE_STATUS;
      r.warehouseScope='archive';
      r.operationallyHidden=true;
      r.relationType=ARCHIVE_RELATION;
      r.duplicateOfRecordId=target.id;
      r.archiveReason=`Same non-shared physical Roll # ${norm(roll)} is represented by canonical record ${target.id}. This legacy/cloud backup remains retained for audit only.`;
      r.archivedAt=now;r.archivedByBuild=BUILD;r.updatedAt=now;changed++;
    }
    return changed;
  }
  function canonicalRawForRoll(roll){
    const family=familyFor(rawRows(),roll);
    if(!family.length)return null;
    const mfrs=[...new Set(family.map(r=>norm(r.manufacturerRoll)).filter(Boolean))];
    return mfrs.length<=1?chooseCanonical(family):family[0];
  }

  function installCarpetRecordsAuthority(){
    const current=window.carpetRecords;
    if(typeof current!=='function')return false;
    if(current.__build134LogicalRows)return true;
    const wrapped=function carpetRecordsBuild134(){
      const rows=current.apply(this,arguments);
      return logicalRows(rows);
    };
    wrapped.__build134LogicalRows=true;wrapped.__original=current;window.carpetRecords=wrapped;return true;
  }

  function mergeMissing(target,group){
    const fields=['manufacturerRoll','collection','colour','lot','width','location','supplier','po','physicalRollId','cloudRecordId','sourceOperationId','sourceRoll'];
    for(const r of group||[])for(const f of fields)if(!text(target[f])&&text(r?.[f]))target[f]=r[f];
    if(!(Number(target.originalLength)>0)){const best=Math.max(0,...(group||[]).map(r=>Number(r.originalLength||0)));if(best>0)target.originalLength=best}
    if(!(Number(target.length)>0)){const best=Math.max(0,...(group||[]).map(r=>Number(r.length||0)));if(best>0)target.length=best}
  }
  function reorderCanonicalLast(rows,target){
    if(!target)return rows;
    return [...rows.filter(r=>String(r.id)!==String(target.id)),target];
  }
  function installSaveCarpetEditAuthority(){
    const current=window.saveCarpetEdit;
    if(typeof current!=='function')return false;
    if(current.__build134EditAuthority)return true;
    const fixed=function saveCarpetEditBuild134(){
      const rows=rawRows();
      if(!rows.length)return current.apply(this,arguments);
      let activeId=null;try{activeId=typeof activeCarpetId!=='undefined'?activeCarpetId:null}catch(_){}
      let selected=rows.find(r=>String(r.id)===String(activeId))||null;
      const formRoll=text(document.getElementById('ceRoll')?.value).toUpperCase();
      const selectedRoll=norm(selected?.roll||formRoll);
      const selectedFamily=familyFor(rows,selectedRoll,selected?.manufacturerRoll);
      let target=selectedFamily.length?chooseCanonical(selectedFamily):selected;
      if(!target){alert('The carpet record changed. Re-open the roll and try again.');return false}
      mergeMissing(target,selectedFamily);
      if(typeof window.syncCarpetEditLength==='function'&&(!window.syncCarpetEditLength('current')||!window.syncCarpetEditLength('original'))){alert('Please enter inches from 0 to 11.');return false}
      const roll=formRoll,oldRoll=target.roll;
      if(!roll){alert('Roll number is required.');return false}
      let newLength=typeof window.carpetEditLengthValue==='function'?window.carpetEditLengthValue('current'):Number(document.getElementById('ceLength')?.value||0);
      let newOriginal=typeof window.carpetEditLengthValue==='function'?window.carpetEditLengthValue('original'):Number(document.getElementById('ceOriginal')?.value||0);
      if(!Number.isFinite(newLength)||!Number.isFinite(newOriginal)){alert('Please enter a valid carpet length.');return false}
      const manufacturerRoll=typeof window.cleanManufacturerRoll==='function'?window.cleanManufacturerRoll(document.getElementById('ceMfr')?.value):text(document.getElementById('ceMfr')?.value).toUpperCase();
      const oldGroupIds=new Set(selectedFamily.map(r=>String(r.id)));
      if(norm(oldRoll)!==norm(roll)){
        const conflict=rows.find(r=>!isArchived(r)&&!oldGroupIds.has(String(r.id))&&!isShared(roll)&&norm(r.roll)===norm(roll));
        if(conflict){alert('This operational roll number already exists on another physical carpet record.');return false}
      }
      if(manufacturerRoll){
        const conflict=rows.find(r=>!isArchived(r)&&!oldGroupIds.has(String(r.id))&&norm(r.manufacturerRoll)===norm(manufacturerRoll)&&norm(r.roll)!==norm(roll));
        if(conflict){alert('This manufacturer roll number already exists on another carpet roll.');return false}
      }
      const status=document.getElementById('ceStatus')?.value||target.status||'Active';
      let measure=document.getElementById('ceMeasure')?.value||target.measure||'';
      if(newLength===0&&Number(target.length||0)>0&&!['USED UP','CHECK'].includes(norm(status)))newLength=Number(target.length||0);
      if(newOriginal===0&&Number(target.originalLength||0)>0)newOriginal=Number(target.originalLength||0);
      Object.assign(target,{
        roll,
        manufacturerRoll,
        collection:text(document.getElementById('ceCollection')?.value),
        colour:text(document.getElementById('ceColour')?.value),
        length:newLength,
        originalLength:newOriginal,
        width:text(document.getElementById('ceWidth')?.value),
        location:text(document.getElementById('ceLocation')?.value),
        lot:text(document.getElementById('ceLot')?.value),
        measure,
        status,
        warehouseScope:['ACTIVE','USED UP','CHECK','PENDING'].includes(norm(status))?'warehouse':target.warehouseScope,
        operationallyHidden:false,
        relationType:target.relationType===ARCHIVE_RELATION?'':target.relationType,
        tmRequired:newLength<=50&&newLength>=3&&norm(measure)!=='TM',
        reviewNote:text(document.getElementById('ceNote')?.value),
        updatedAt:new Date().toISOString(),
        editAuthorityBuild:BUILD
      });
      if(norm(oldRoll)!==norm(roll)){
        try{
          const cuts=rawCuts();cuts.forEach(c=>{if(norm(c.roll)===norm(oldRoll))c.roll=roll});window.save?.(CUT,cuts);
          const ops=typeof window.operationRecords==='function'?window.operationRecords():[];ops.forEach(o=>{if(norm(o.roll)===norm(oldRoll))o.roll=roll});if(typeof LOGDB!=='undefined')window.save?.(LOGDB,ops);
        }catch(e){console.warn('[Build134] linked roll rename update',e)}
      }
      archiveBackupRows(rows,target,roll,manufacturerRoll);
      const ordered=reorderCanonicalLast(rows,target);
      if(window.save?.(CARPET,ordered)===false){alert('The carpet record could not be saved. Please try again.');return false}
      try{window.renderCarpetInventory?.()}catch(_){}
      try{window.openCarpetDetail?.(target.id)}catch(_){try{window.showPage?.('carpetInventory')}catch(__){}}
      return true;
    };
    fixed.__build134EditAuthority=true;fixed.__original=current;window.saveCarpetEdit=fixed;return true;
  }

  function compareCutTime(a,b){
    const ad=text(a?.date),bd=text(b?.date);if(ad!==bd)return ad.localeCompare(bd,undefined,{numeric:true});
    const at=text(a?.time),bt=text(b?.time);if(at!==bt)return at.localeCompare(bt,undefined,{numeric:true});
    const ac=parseMs(a?.createdAt),bc=parseMs(b?.createdAt);if(ac!==bc)return ac-bc;
    return Number(a?.id||0)-Number(b?.id||0);
  }
  function cutsForRoll(roll){return rawCuts().filter(c=>norm(c.roll)===norm(roll)).sort(compareCutTime)}
  function feetParts(n){
    n=Math.max(0,Number(n)||0);let f=Math.floor(n+1e-9),inch=Math.round((n-f)*12);if(inch>=12){f++;inch=0}return {feet:f,inches:inch};
  }
  function readFeet(prefix){
    const f=Number(document.getElementById(prefix+'Feet')?.value),i=Number(document.getElementById(prefix+'Inches')?.value);
    if(!Number.isFinite(f)||f<0||!Number.isFinite(i)||i<0||i>11)return NaN;
    return Number((Math.floor(f)+Math.floor(i)/12).toFixed(4));
  }
  function setFeet(prefix,value){const p=feetParts(value);const f=document.getElementById(prefix+'Feet'),i=document.getElementById(prefix+'Inches');if(f)f.value=p.feet;if(i)i.value=p.inches}
  function ensureCutEditor(){
    let el=document.getElementById('build134CutEditor');if(el)return el;
    el=document.createElement('div');el.id='build134CutEditor';el.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;padding:18px';
    el.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:880px;width:100%;max-height:92vh;overflow:auto;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.28)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h2 style="margin:0">Cutting History</h2><div id="build134CutTitle" class="meta"></div></div><button id="build134CutClose">Close</button></div>
      <div id="build134CutRows" style="margin:14px 0"></div>
      <div style="border-top:1px solid #ddd;padding-top:14px"><h3 id="build134CutFormTitle" style="margin:0 0 10px">Add Historical Cut</h3>
        <div class="formgrid">
          <div><label>Date</label><input id="b134Date" type="date"></div><div><label>PO</label><input id="b134PO"></div>
          <div><label>Name / Customer</label><input id="b134Customer"></div><div><label>Sales / Operator</label><input id="b134Operator"></div>
          <div class="full"><label>Requested Cut</label><div class="lengthPair"><div><span>Feet</span><input id="b134CutFeet" type="number" min="0" step="1"></div><div><span>Inches (0–11)</span><input id="b134CutInches" type="number" min="0" max="11" step="1"></div></div></div>
          <div class="full"><label>Balance After Cut</label><div class="lengthPair"><div><span>Feet</span><input id="b134BalFeet" type="number" min="0" step="1"></div><div><span>Inches (0–11)</span><input id="b134BalInches" type="number" min="0" max="11" step="1"></div></div></div>
        </div>
        <div class="notice" style="margin-top:10px">Historical entry uses the warehouse rule of one 3″ allowance per cut. The newest balance becomes the roll’s current inventory length. Existing operation-linked cuts remain auditable; edits are recorded as correction events.</div>
        <div class="actions" style="margin-top:12px"><button id="build134CutNew">New Entry</button><button class="green" id="build134CutSave">Save Cut Data</button></div>
      </div>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click',e=>{if(e.target===el)closeCutHistoryEditor()});
    document.getElementById('build134CutClose').onclick=closeCutHistoryEditor;
    document.getElementById('build134CutNew').onclick=()=>loadCutIntoForm(null);
    document.getElementById('build134CutSave').onclick=saveCutHistoryEntry;
    return el;
  }
  function renderCutEditorRows(){
    const roll=canonicalRawForRollById(cutEditorState.recordId);if(!roll)return;
    const rows=cutsForRoll(roll.roll),host=document.getElementById('build134CutRows');
    if(!host)return;
    host.innerHTML=rows.length?`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px">Date</th><th style="text-align:left;padding:6px">PO</th><th style="text-align:left;padding:6px">Name</th><th style="text-align:left;padding:6px">Sales</th><th style="text-align:left;padding:6px">Cut</th><th style="text-align:left;padding:6px">Bal.</th><th></th></tr></thead><tbody>${rows.map(c=>`<tr style="border-top:1px solid #eee"><td style="padding:6px">${window.esc?.(c.date||'')||text(c.date)}</td><td style="padding:6px">${window.esc?.(c.po||'')||text(c.po)}</td><td style="padding:6px">${window.esc?.(c.customer||'')||text(c.customer)}</td><td style="padding:6px">${window.esc?.(c.operator||'')||text(c.operator)}</td><td style="padding:6px">${window.feetLabel?.(c.requestedCutLength??c.cutLength)||text(c.cutLength)}</td><td style="padding:6px">${window.feetLabel?.(c.remainingLength)||text(c.remainingLength)}</td><td style="padding:6px"><button data-b134-edit="${String(c.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No cutting history yet. Add the first historical cut below.</div>';
    host.querySelectorAll('[data-b134-edit]').forEach(b=>b.onclick=()=>loadCutIntoForm(b.dataset.b134Edit));
  }
  function canonicalRawForRollById(id){
    const rows=rawRows(),direct=rows.find(r=>String(r.id)===String(id)&&!isArchived(r));
    if(direct){const family=familyFor(rows,direct.roll,direct.manufacturerRoll);return family.length?chooseCanonical(family):direct}
    try{return typeof window.carpetById==='function'?window.carpetById(id):null}catch{return null}
  }
  function loadCutIntoForm(cutId){
    const roll=canonicalRawForRollById(cutEditorState.recordId);if(!roll)return;
    const c=cutId?cutsForRoll(roll.roll).find(x=>String(x.id)===String(cutId)):null;
    cutEditorState.cutId=c?c.id:null;
    document.getElementById('build134CutFormTitle').textContent=c?'Edit Cutting Record':'Add Historical Cut';
    document.getElementById('b134Date').value=c?.date||new Date().toISOString().slice(0,10);
    document.getElementById('b134PO').value=c?.po||'';
    document.getElementById('b134Customer').value=c?.customer||'';
    document.getElementById('b134Operator').value=c?.operator||'';
    setFeet('b134Cut',Number(c?.requestedCutLength??c?.cutLength??0));
    setFeet('b134Bal',Number(c?.remainingLength??roll.length??0));
  }
  function openCutHistoryEditor(recordId){
    const roll=canonicalRawForRollById(recordId);if(!roll){alert('Carpet roll not found.');return}
    cutEditorState={recordId:roll.id,cutId:null};
    const el=ensureCutEditor();
    document.getElementById('build134CutTitle').textContent=`Roll ${roll.roll} · ${roll.collection||'Carpet'} ${roll.colour||''}`;
    el.style.display='flex';renderCutEditorRows();loadCutIntoForm(null);
  }
  function closeCutHistoryEditor(){const el=document.getElementById('build134CutEditor');if(el)el.style.display='none'}
  function logCutCorrection(roll,action,cut,previous){
    try{
      const events=typeof window.load==='function'?window.load(EVENT):[];if(!Array.isArray(events))return;
      events.unshift({id:Date.now()+Math.random(),time:new Date().toISOString(),type:action,reference:roll.roll,cutRecordId:cut.id,build:BUILD,previous:previous||null,result:`${action}: Roll ${roll.roll} · ${cut.date} · requested ${window.feetLabel?.(cut.requestedCutLength)||cut.requestedCutLength} · balance ${window.feetLabel?.(cut.remainingLength)||cut.remainingLength}`});
      window.save?.(EVENT,events);
    }catch(e){console.warn('[Build134] cut correction audit',e)}
  }
  function reconcileRollFromCutHistory(roll){
    if(!roll)return;
    const rows=rawRows(),family=familyFor(rows,roll.roll,roll.manufacturerRoll),target=family.length?chooseCanonical(family):rows.find(r=>String(r.id)===String(roll.id));
    if(!target)return;
    const cuts=cutsForRoll(target.roll);if(!cuts.length)return;
    const latest=cuts[cuts.length-1],earliest=cuts[0],balance=Number(latest.remainingLength);
    if(Number.isFinite(balance)){
      target.length=Math.max(0,balance);target.measure='CAL';target.status=balance<3?'Used Up':'Active';target.tmRequired=balance>=3&&balance<=50;target.warehouseScope='warehouse';target.operationallyHidden=false;
    }
    if(!(Number(target.originalLength)>0)&&Number(earliest.beforeLength)>0)target.originalLength=Number(earliest.beforeLength);
    target.updatedAt=new Date().toISOString();target.cutHistoryAuthorityBuild=BUILD;
    archiveBackupRows(rows,target,target.roll,target.manufacturerRoll);
    window.save?.(CARPET,reorderCanonicalLast(rows,target));
    cutEditorState.recordId=target.id;
  }
  function saveCutHistoryEntry(){
    const roll=canonicalRawForRollById(cutEditorState.recordId);if(!roll){alert('Carpet roll not found.');return}
    const date=text(document.getElementById('b134Date')?.value),requested=readFeet('b134Cut'),balance=readFeet('b134Bal');
    if(!date){alert('Enter the cut date.');return}
    if(!(requested>0)){alert('Enter a requested cut length greater than zero.');return}
    if(!Number.isFinite(balance)||balance<0){alert('Enter a valid balance after cut.');return}
    const cuts=rawCuts();let cut=cutEditorState.cutId?cuts.find(c=>String(c.id)===String(cutEditorState.cutId)):null;
    const previous=cut?clone(cut):null,actual=Number((requested+0.25).toFixed(4)),before=Number((balance+actual).toFixed(4)),now=new Date().toISOString();
    if(!cut){cut={id:Date.now()+Math.random(),createdAt:now,manualHistory:true,source:'Manual Cutting History'};cuts.push(cut)}
    Object.assign(cut,{
      carpetRecordId:roll.id,date,time:cut.time||'',roll:roll.roll,collection:roll.collection||'',colour:roll.colour||'',
      po:text(document.getElementById('b134PO')?.value),customer:text(document.getElementById('b134Customer')?.value),operator:text(document.getElementById('b134Operator')?.value),
      cutLength:requested,requestedCutLength:requested,plannedCutLength:actual,actualCutLength:actual,numberOfCuts:1,allowanceInches:3,beforeLength:before,remainingLength:balance,
      manualHistory:cut.manualHistory||!cut.operationId,updatedAt:now,editedByBuild:BUILD
    });
    if(previous){cut.correctionHistory=Array.isArray(cut.correctionHistory)?cut.correctionHistory:[];cut.correctionHistory.push({at:now,build:BUILD,previous:{date:previous.date,po:previous.po,customer:previous.customer,operator:previous.operator,requestedCutLength:previous.requestedCutLength??previous.cutLength,remainingLength:previous.remainingLength,beforeLength:previous.beforeLength}})}
    cuts.sort(compareCutTime);window.save?.(CUT,cuts);
    reconcileRollFromCutHistory(roll);
    logCutCorrection(roll,previous?'Cutting History Correction':'Historical Cutting Data Entry',cut,previous);
    renderCutEditorRows();cutEditorState.cutId=cut.id;loadCutIntoForm(cut.id);
    try{window.renderCarpetInventory?.();window.openCarpetDetail?.(cutEditorState.recordId)}catch(_){}
  }

  function decorateDetail(){
    const host=document.querySelector('#carpetDetailContent .actions');if(!host||host.querySelector('[data-build134-cut-history]'))return;
    let id=null;try{id=typeof activeCarpetId!=='undefined'?activeCarpetId:null}catch(_){}
    if(id==null)return;
    const b=document.createElement('button');b.type='button';b.dataset.build134CutHistory='1';b.textContent='✏️ Cut History';b.onclick=()=>openCutHistoryEditor(id);host.appendChild(b);
  }
  function decorateEditor(){
    const host=document.querySelector('#carpetEditor .actions');if(!host||host.querySelector('[data-build134-cut-history]'))return;
    let id=null;try{id=typeof activeCarpetId!=='undefined'?activeCarpetId:null}catch(_){}
    if(id==null)return;
    const b=document.createElement('button');b.type='button';b.dataset.build134CutHistory='1';b.textContent='✏️ Cut History';b.onclick=()=>openCutHistoryEditor(id);host.insertBefore(b,host.firstChild);
  }
  function installDecorators(){
    const detail=window.openCarpetDetail;
    if(typeof detail==='function'&&!detail.__build134Decorated){const wrapped=function(){const out=detail.apply(this,arguments);setTimeout(decorateDetail,0);return out};wrapped.__build134Decorated=true;wrapped.__original=detail;window.openCarpetDetail=wrapped}
    const edit=window.editCarpetRecord;
    if(typeof edit==='function'&&!edit.__build134Decorated){const wrapped=function(){const out=edit.apply(this,arguments);setTimeout(decorateEditor,0);return out};wrapped.__build134Decorated=true;wrapped.__original=edit;window.editCarpetRecord=wrapped}
  }

  function install(reason='boot'){
    const a=installCarpetRecordsAuthority(),b=installSaveCarpetEditAuthority();installDecorators();
    document.documentElement?.setAttribute('data-runlu-carpet-edit-authority',BUILD);
    if(a||b){try{window.renderCarpetInventory?.()}catch(_){}}
    return {reason,logical:a,edit:b};
  }
  function boot(){
    install('DOMContentLoaded');let n=0;const t=setInterval(()=>{install('settle');if(++n>=120)clearInterval(t)},500);
    window.addEventListener('pageshow',()=>setTimeout(()=>install('pageshow'),60));
    window.addEventListener('focus',()=>setTimeout(()=>install('focus'),60));
    window.addEventListener('online',()=>setTimeout(()=>install('online'),160));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>install('visible'),60)});
  }

  window.RUNLUCarpetEditCutHistoryBuild134={version:BUILD,logicalRows,chooseCanonical,openCutHistoryEditor,saveCutHistoryEntry,reconcileRollFromCutHistory,install};
  window.openCutHistoryEditor=openCutHistoryEditor;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
