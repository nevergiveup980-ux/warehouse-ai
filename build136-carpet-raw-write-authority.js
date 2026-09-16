// RUNLU Warehouse OS V6.12.41 Build136 · Carpet Raw Write Authority.
// Stabilization: carpet mutations write the raw inventory record, never Build134's filtered UI view.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD136_CARPET_RAW_WRITE_AUTHORITY__)return;
  window.__RUNLU_BUILD136_CARPET_RAW_WRITE_AUTHORITY__=true;

  const BUILD='136',CARPET='runlu_carpet_inventory_v52',CUT='runlu_cutting_log_v52',EVENT='runlu_event_history_v52';
  const ARCHIVE_STATUS='ARCHIVED DUPLICATE';
  let repairing=false;
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ').trim();
  const num=v=>Number(v);
  const parseMs=v=>{const n=Date.parse(text(v));return Number.isFinite(n)?n:0};
  const rawArray=k=>{try{const x=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
  const saveArray=(k,v)=>typeof window.save==='function'?window.save(k,v):(localStorage.setItem(k,JSON.stringify(v)),true);
  const operational=r=>!!r&&norm(r.status)!==ARCHIVE_STATUS&&r.operationallyHidden!==true&&norm(r.warehouseScope)!=='EXTERNAL'&&r.transferredOut!==true;
  const active=r=>operational(r)&&norm(r.status)==='ACTIVE';
  const sameRoll=(a,b)=>!!norm(a)&&norm(a)===norm(b);
  const feet=v=>typeof window.feetLabel==='function'?window.feetLabel(v):`${Number(v||0)} ft`;

  function cutMatches(c,r){
    if(!c||!r)return false;
    if(c.carpetRecordId!=null&&r.id!=null&&String(c.carpetRecordId)===String(r.id))return true;
    return sameRoll(c.roll,r.roll);
  }
  function compareCut(a,b){
    const ad=text(a?.date),bd=text(b?.date);if(ad!==bd)return ad.localeCompare(bd,undefined,{numeric:true});
    const at=text(a?.time),bt=text(b?.time);if(at!==bt)return at.localeCompare(bt,undefined,{numeric:true});
    const ac=parseMs(a?.createdAt),bc=parseMs(b?.createdAt);if(ac!==bc)return ac-bc;
    return Number(a?.id||0)-Number(b?.id||0);
  }
  function latestBalanceFor(r,cuts){
    const rows=(Array.isArray(cuts)?cuts:[]).filter(c=>cutMatches(c,r)).sort(compareCut);
    for(let i=rows.length-1;i>=0;i--){const n=num(rows[i]?.remainingLength);if(Number.isFinite(n)&&n>=0)return {balance:n,cut:rows[i],count:rows.length}}
    return null;
  }
  function visibleCanonicalId(roll){
    try{const rows=typeof window.carpetRecords==='function'?window.carpetRecords():[];const x=(Array.isArray(rows)?rows:[]).find(r=>sameRoll(r?.roll,roll));return x?.id!=null?String(x.id):''}catch{return ''}
  }
  function completeness(r){
    let s=0;if(Number(r?.length||0)>0)s+=1000;if(active(r))s+=300;if(Number(r?.originalLength||0)>0)s+=100;if(text(r?.manufacturerRoll))s+=60;if(text(r?.lot))s+=25;if(text(r?.location))s+=20;s+=Math.min(50,parseMs(r?.updatedAt||r?.createdAt)/1e12);return s;
  }
  function resolveRawTarget(raw,r){
    const wantedRoll=norm(r?.roll),family=(Array.isArray(raw)?raw:[]).filter(x=>operational(x)&&sameRoll(x?.roll,wantedRoll));
    if(!family.length)return null;
    const selected=r?.carpetRecordId!=null&&r.carpetRecordId!==''?family.find(x=>String(x.id)===String(r.carpetRecordId))||null:null;
    if(selected&&Number(selected.length||0)>0)return selected;
    const canonicalId=visibleCanonicalId(wantedRoll),canonical=canonicalId?family.find(x=>String(x.id)===canonicalId)||null:null;
    if(canonical&&Number(canonical.length||0)>0)return canonical;
    const positive=family.filter(x=>Number(x.length||0)>0);
    if(positive.length===1)return positive[0];
    if(positive.length>1){const mfrs=[...new Set(positive.map(x=>norm(x.manufacturerRoll)).filter(Boolean))];if(mfrs.length>1)throw new Error(`Roll ${r?.roll||'—'} has more than one active manufacturer-roll identity. Review the duplicate before cutting.`);return [...positive].sort((a,b)=>completeness(b)-completeness(a))[0]}
    if(selected)return selected;if(canonical)return canonical;if(family.length===1)return family[0];
    const mfrs=[...new Set(family.map(x=>norm(x.manufacturerRoll)).filter(Boolean))];if(mfrs.length>1)throw new Error(`Roll ${r?.roll||'—'} has conflicting physical identities. Review the duplicate before cutting.`);
    return [...family].sort((a,b)=>completeness(b)-completeness(a))[0]||null;
  }
  function recoverTargetBalance(target,cuts){
    if(!target||Number(target.length||0)>0)return false;
    const logged=latestBalanceFor(target,cuts);let balance=null,reason='';
    if(logged){balance=Number(logged.balance);reason='latest-cut-balance'}
    else if(active(target)&&norm(target.measure)==='FULL'&&Number(target.originalLength||0)>0){balance=Number(target.originalLength);reason='full-original-opening-balance'}
    if(balance==null||!Number.isFinite(balance))return false;
    target.length=Number(balance.toFixed(4));target.updatedAt=new Date().toISOString();target.balanceRecoveredAt=target.updatedAt;target.balanceRecoveredByBuild=BUILD;target.balanceRecoveryReason=reason;
    if(balance<=0){target.status='Used Up';target.tmRequired=false}else{target.status='Active';if(reason==='latest-cut-balance'&&norm(target.measure)==='FULL')target.measure='CAL';target.tmRequired=norm(target.measure)!=='TM'&&balance<=50&&balance>=3}
    return true;
  }
  function auditRecovery(events,target,before,reason='operation-preflight'){
    const key=`BUILD136:${String(target?.id??'')}:${reason}:${Number(target?.length||0).toFixed(4)}`;if(events.some(e=>text(e.build136RecoveryKey)===key))return;
    events.unshift({id:Date.now()+Math.random(),time:new Date().toISOString(),type:'Carpet Balance Authority Repair',reference:target?.roll||'',build136RecoveryKey:key,result:`Recovered the operational raw carpet balance before ${reason}: ${feet(before)} → ${feet(target?.length)}. No new carpet record was created.`});
  }

  function applyCarpetCutRaw(r){
    const requested=Number(r.requestedQuantity??r.quantity??0);
    const planned=typeof window.carpetActualCutLength==='function'?window.carpetActualCutLength({...r,type:'Carpet Cutting'}):Number((requested+(Number(r.numberOfCuts||1)*3)/12).toFixed(4));
    const raw=rawArray(CARPET),cuts=rawArray(CUT),events=rawArray(EVENT),target=resolveRawTarget(raw,r);
    if(!target)throw new Error(`Roll ${r.roll||'—'} was not found in the operational Carpet Inventory. Re-open the roll and try again.`);
    const prior=Number(target.length||0),recovered=recoverTargetBalance(target,cuts);if(recovered)auditRecovery(events,target,prior,'carpet-cut preflight');
    const before=Number(target.length||0);if(!(before>0))throw new Error(`Roll ${target.roll||r.roll||'—'} has no usable Current Length. Edit the roll or reconstruct Cut History before cutting.`);
    if(before+1e-6<planned)throw new Error(`Not enough carpet remaining. Requested ${feet(requested)} plus 3″ cutting allowance requires ${feet(planned)}. Current balance: ${feet(before)}.`);
    const plan=typeof window.carpetCutConsumptionPlan==='function'?window.carpetCutConsumptionPlan({...r,type:'Carpet Cutting'},before):{consumed:planned,remaining:Number((before-planned).toFixed(4)),useFullRoll:false};
    const actual=Number(plan.consumed);target.length=Number(plan.remaining);target.measure='CAL';target.status=plan.useFullRoll||target.length<3?'Used Up':'Active';target.tmRequired=!plan.useFullRoll&&target.length<=50&&target.length>=3;target.updatedAt=new Date().toISOString();
    if(saveArray(CARPET,raw)===false)throw new Error(`Roll ${target.roll||r.roll} could not be saved to Carpet Inventory.`);
    cuts.unshift({id:Date.now()+Math.random(),operationId:r.id,carpetRecordId:target.id,date:r.date,time:r.time,roll:target.roll||r.roll,collection:r.collection||target.collection,colour:r.colour||target.colour,po:r.po,customer:r.customer||'',cutLength:requested,requestedCutLength:requested,plannedCutLength:planned,actualCutLength:actual,numberOfCuts:r.numberOfCuts||1,allowanceInches:r.allowanceInches||3,beforeLength:before,remainingLength:target.length,fullRollConsumed:!!plan.useFullRoll,operator:r.operator,notes:r.notes,createdAt:new Date().toISOString()});
    if(saveArray(CUT,cuts)===false)throw new Error('The cutting log could not be saved.');
    try{window.updateLinkedOrder?.(r,'Ready')}catch(e){console.warn('[Build136] linked order update',e)}
    r.carpetRecordId=target.id;r.roll=target.roll||r.roll;r.requestedQuantity=requested;r.plannedStockQuantity=planned;r.actualStockQuantity=actual;r.allowanceInches=(r.numberOfCuts||1)*3;r.fullRollConsumed=!!plan.useFullRoll;
    const result=plan.useFullRoll?`FULL ROLL FINISH · Roll ${r.roll}: requested ${feet(requested)} + ${r.numberOfCuts||1} cut(s) × 3″ = ${feet(planned)} planned; short tail consumed with full roll; ${feet(before)} → 0; status Used Up`:`Roll ${r.roll}: requested ${feet(requested)} + ${r.numberOfCuts||1} cut(s) × 3″ = ${feet(planned)} actual; ${feet(before)} → ${feet(target.length)}; measure CAL${target.tmRequired?'; TRUE MEASURE REQUIRED':''}`;
    events.unshift({id:Date.now()+Math.random(),operationId:r.id,time:new Date().toISOString(),type:r.type,reference:r.po||r.roll||r.product,result});if(saveArray(EVENT,events)===false)throw new Error('The event history could not be saved.');
    r.impactApplied=true;r.impactResult=result;r.appliedAt=new Date().toISOString();document.documentElement?.setAttribute('data-runlu-carpet-cut-raw-authority',`${BUILD}:${target.id}`);return true;
  }

  function installSingleImpactAuthority(){
    const current=window.applySingleOperationImpact;if(typeof current!=='function')return false;if(current.__build136CarpetRawWriteAuthority)return true;
    const wrapped=function(r){
      if(!r||r.type!=='Carpet Cutting')return current.apply(this,arguments);
      if(r.impactApplied||r.status!=='Completed')return true;
      if(r.inventoryMode!=='Stock')return current.apply(this,arguments);
      try{const err=typeof window.validateOperationForImpact==='function'?window.validateOperationForImpact(r):'';if(err){alert(err);return false}return applyCarpetCutRaw(r)}catch(e){alert('Linked update stopped: '+(e?.message||e));return false}
    };
    wrapped.__build136CarpetRawWriteAuthority=true;
    // Build093 keeps exact Roll#/record identity locking inside this wrapper. Mark its ownership
    // so its legacy retry loop does not repeatedly wrap Build136 and build an ever-growing chain.
    wrapped.__build093=true;
    wrapped.__original=current;window.applySingleOperationImpact=wrapped;return true;
  }

  function repairCanonicalFullBalances(reason='invariant'){
    if(repairing)return 0;repairing=true;
    try{
      const raw=rawArray(CARPET),cuts=rawArray(CUT),events=rawArray(EVENT);if(!raw.length)return 0;
      let visible=[];try{visible=typeof window.carpetRecords==='function'?window.carpetRecords():raw}catch{visible=raw}
      const visibleIds=new Set((Array.isArray(visible)?visible:raw).map(x=>String(x.id)));let changed=0,eventChanged=false;
      for(const r of raw){if(r.id!=null&&!visibleIds.has(String(r.id)))continue;if(!active(r)||Number(r.length||0)>0)continue;const before=Number(r.length||0);if(!recoverTargetBalance(r,cuts))continue;const n=events.length;auditRecovery(events,r,before,`post-cloud ${reason}`);if(events.length!==n)eventChanged=true;changed++}
      if(changed){saveArray(CARPET,raw);if(eventChanged)saveArray(EVENT,events);document.documentElement?.setAttribute('data-runlu-carpet-balance-invariant',`${BUILD}:${changed}:${reason}`)}
      return changed;
    }catch(e){console.warn('[Build136] balance invariant',e);return 0}finally{repairing=false}
  }
  function install(){installSingleImpactAuthority();repairCanonicalFullBalances('install');document.documentElement?.setAttribute('data-runlu-carpet-raw-write-authority',BUILD)}
  function boot(){install();let tries=0;const settle=setInterval(()=>{installSingleImpactAuthority();if(++tries>=120)clearInterval(settle)},100);setInterval(()=>repairCanonicalFullBalances('watch'),2500)}
  window.addEventListener('pageshow',()=>setTimeout(()=>{installSingleImpactAuthority();repairCanonicalFullBalances('pageshow')},80));
  window.addEventListener('focus',()=>setTimeout(()=>repairCanonicalFullBalances('focus'),120));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>repairCanonicalFullBalances('visible'),120)});
  window.RUNLUCarpetRawWriteAuthorityBuild136={version:BUILD,resolveRawTarget,recoverTargetBalance,repairCanonicalFullBalances,applyCarpetCutRaw,install};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
