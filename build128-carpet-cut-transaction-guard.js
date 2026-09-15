// RUNLU Warehouse OS Build128 · Carpet Cut Transaction Guard
// Candidate hardening layer for actual carpet cuts.
// Goals: one execution key can deduct only once; cut-linked local datasets commit together;
// cloud queueing begins only after the local transaction has verified successfully; an
// interrupted browser write is recovered from a compact journal on the next load.
(() => {
  const BUILD='128';
  const JOURNAL='runlu_carpet_cut_transaction_v128';
  const LEDGER='runlu_cut_execution_guard_v128';
  const MAX_LEDGER=10000;
  const originalApply=window.applySingleOperationImpact;
  const originalSave=window.save;
  if(typeof originalApply!=='function'||typeof originalSave!=='function'){
    console.warn('[Build128] Cut transaction guard not installed: base functions unavailable.');
    return;
  }

  const clean=v=>String(v??'').trim();
  const keyRoll=v=>typeof window.carpetRollKey==='function'?window.carpetRollKey(v):clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const parse=(raw,fallback)=>{try{return raw==null?fallback:JSON.parse(raw)}catch{return fallback}};
  const raw=k=>localStorage.getItem(k);
  const direct=(k,value)=>{if(value==null)localStorage.removeItem(k);else localStorage.setItem(k,value)};
  const clone=v=>parse(JSON.stringify(v),v);
  const sameId=(a,b)=>String(a??'')===String(b??'');

  function executionKey(r){
    return ['CUT',String(r?.id??''),String(r?.carpetRecordId??''),keyRoll(r?.roll)].join('|');
  }
  function cutMatches(c,r){
    if(!sameId(c?.operationId,r?.id))return false;
    const wantedId=clean(r?.carpetRecordId),cutId=clean(c?.carpetRecordId);
    if(wantedId&&cutId&&wantedId!==cutId)return false;
    const wantedRoll=keyRoll(r?.roll),cutRoll=keyRoll(c?.roll);
    return !wantedRoll||!cutRoll||wantedRoll===cutRoll;
  }
  function eventMatches(e,r){
    if(!sameId(e?.operationId,r?.id))return false;
    const wanted=keyRoll(r?.roll),ref=keyRoll(e?.reference);
    return !wanted||!ref||wanted===ref;
  }
  function loadLedger(){
    const x=parse(raw(LEDGER),null);
    return x&&Array.isArray(x.entries)?x:{version:1,build:BUILD,entries:[]};
  }
  function ledgerHas(r){const k=executionKey(r);return loadLedger().entries.some(x=>x&&x.key===k)}
  function ledgerCommit(r,cut){
    const ledger=loadLedger(),k=executionKey(r);
    if(!ledger.entries.some(x=>x&&x.key===k))ledger.entries.unshift({
      key:k,operationId:r.id,carpetRecordId:r.carpetRecordId||cut?.carpetRecordId||'',roll:r.roll||cut?.roll||'',
      po:r.po||cut?.po||'',remainingLength:cut?.remainingLength,committedAt:new Date().toISOString(),build:BUILD
    });
    ledger.entries=ledger.entries.slice(0,MAX_LEDGER);ledger.build=BUILD;
    direct(LEDGER,JSON.stringify(ledger));
  }
  function ledgerRemoveKey(k){
    const ledger=loadLedger(),next=ledger.entries.filter(x=>x&&x.key!==k);
    if(next.length===ledger.entries.length)return;
    ledger.entries=next;direct(LEDGER,JSON.stringify(ledger));
  }
  function existingCut(r){
    const rows=typeof window.cuttingRecords==='function'?window.cuttingRecords():parse(raw(window.CUTDB||'runlu_cutting_log_v52'),[]);
    return (rows||[]).find(c=>cutMatches(c,r))||null;
  }
  function markReplaySafe(r,cut){
    r.impactApplied=true;r.appliedAt=r.appliedAt||cut?.createdAt||new Date().toISOString();
    r.requestedQuantity=Number(cut?.requestedCutLength??cut?.cutLength??r.requestedQuantity??r.quantity??0);
    r.plannedStockQuantity=Number(cut?.plannedCutLength??r.plannedStockQuantity??0);
    r.actualStockQuantity=Number(cut?.actualCutLength??r.actualStockQuantity??0);
    r.allowanceInches=Number(cut?.allowanceInches??r.allowanceInches??0);
    r.fullRollConsumed=!!(cut?.fullRollConsumed??r.fullRollConsumed);
    r.impactResult=r.impactResult||`IDEMPOTENT REPLAY BLOCKED · Roll ${cut?.roll||r.roll||'—'} · existing cut operation ${r.id}`;
    return true;
  }

  function matchingOrder(r,rows){
    if(!r?.po)return null;const ref=clean(r.po).toLowerCase();
    return (rows||[]).find(o=>[o?.poNumber,o?.soNumber,o?.po].some(v=>clean(v).toLowerCase()===ref))||null;
  }
  function compactJournal(r,before){
    const carpets=parse(before.carpet,[]),orders=parse(before.orders,[]),cuts=parse(before.cuts,[]),events=parse(before.events,[]);
    const carpet=carpets.find(x=>clean(r.carpetRecordId)&&sameId(x?.id,r.carpetRecordId))||carpets.find(x=>keyRoll(x?.roll)===keyRoll(r.roll))||null;
    const order=matchingOrder(r,orders);
    return {version:1,build:BUILD,phase:'prepared',executionKey:executionKey(r),operationId:r.id,carpetRecordId:r.carpetRecordId||carpet?.id||'',roll:r.roll||carpet?.roll||'',po:r.po||'',
      before:{carpet:carpet?clone(carpet):null,order:order?clone(order):null,cuts:cuts.filter(c=>cutMatches(c,r)).map(clone),events:events.filter(e=>eventMatches(e,r)).map(clone)},
      touched:[],startedAt:new Date().toISOString()};
  }
  function replaceMatching(rows,predicate,beforeRows){
    const kept=(rows||[]).filter(x=>!predicate(x));return [...(beforeRows||[]).map(clone),...kept];
  }
  function recoverJournal(j,announce=false){
    if(!j||!j.executionKey)return false;
    if(j.phase==='committed'){
      try{(j.touched||[]).forEach(k=>{if(k===LEDGER)return;const v=parse(raw(k),null);if(v!==null&&typeof window.queueCloudSave==='function')window.queueCloudSave(k,v)})}catch(e){console.warn('[Build128] committed cloud queue recovery deferred',e)}
      try{localStorage.removeItem(JOURNAL)}catch(_){}return true;
    }
    try{
      const r={id:j.operationId,carpetRecordId:j.carpetRecordId,roll:j.roll,po:j.po};
      const carpetKey=window.CARPETDB||'runlu_carpet_inventory_v52',cutKey=window.CUTDB||'runlu_cutting_log_v52',orderKey=window.ODB||'runlu_orders_v20',eventKey=window.EVENTDB||'runlu_event_history_v52';
      let carpets=parse(raw(carpetKey),[]);const beforeCarpet=j.before?.carpet;
      if(beforeCarpet){const target=carpets.findIndex(x=>(clean(j.carpetRecordId)&&sameId(x?.id,j.carpetRecordId))||keyRoll(x?.roll)===keyRoll(j.roll));if(target>=0)carpets[target]=clone(beforeCarpet);else carpets.unshift(clone(beforeCarpet));direct(carpetKey,JSON.stringify(carpets))}
      let cuts=parse(raw(cutKey),[]);cuts=replaceMatching(cuts,c=>cutMatches(c,r),j.before?.cuts||[]);direct(cutKey,JSON.stringify(cuts));
      if(j.before?.order){let orders=parse(raw(orderKey),[]),idx=orders.findIndex(o=>matchingOrder(r,[o]));if(idx>=0)orders[idx]=clone(j.before.order);else orders.unshift(clone(j.before.order));direct(orderKey,JSON.stringify(orders))}
      let events=parse(raw(eventKey),[]);events=replaceMatching(events,e=>eventMatches(e,r),j.before?.events||[]);direct(eventKey,JSON.stringify(events));
      ledgerRemoveKey(j.executionKey);localStorage.removeItem(JOURNAL);
      if(announce)console.warn('[Build128] Recovered interrupted carpet cut transaction',j.executionKey);
      return true;
    }catch(e){console.error('[Build128] Transaction recovery failed',e);return false}
  }
  function recoverPending(){const j=parse(raw(JOURNAL),null);return j?recoverJournal(j,true):false}

  recoverPending();

  window.applySingleOperationImpact=function guardedApplySingleOperationImpact(r){
    const isCut=r?.type==='Carpet Cutting'&&r?.inventoryMode==='Stock'&&r?.status==='Completed';
    if(!isCut)return originalApply(r);
    if(r?.impactApplied)return true;
    const prior=existingCut(r);if(prior){if(!ledgerHas(r))try{ledgerCommit(r,prior)}catch(_){}return markReplaySafe(r,prior)}
    if(ledgerHas(r)){
      const cut=existingCut(r);if(cut)return markReplaySafe(r,cut);
      alert('This carpet cut execution is already committed, but its Cutting History entry is not available on this device. Sync/repair history before retrying. No inventory was changed.');return false;
    }

    const keys={carpet:window.CARPETDB||'runlu_carpet_inventory_v52',cuts:window.CUTDB||'runlu_cutting_log_v52',orders:window.ODB||'runlu_orders_v20',events:window.EVENTDB||'runlu_event_history_v52'};
    const before={carpet:raw(keys.carpet),cuts:raw(keys.cuts),orders:raw(keys.orders),events:raw(keys.events),ledger:raw(LEDGER)};
    const recordBefore=clone(r),journal=compactJournal(r,before),touched=new Set();let committed=false;
    try{direct(JOURNAL,JSON.stringify(journal))}catch(e){alert('Carpet cut was not started because the local transaction journal could not be secured. No inventory was changed.');return false}

    const transactionalSave=(k,v)=>{
      const encoded=JSON.stringify(v);localStorage.setItem(k,encoded);touched.add(k);return true;
    };
    window.save=transactionalSave;
    try{
      journal.phase='writing';direct(JOURNAL,JSON.stringify(journal));
      const ok=originalApply(r);if(ok!==true)throw new Error('Base carpet cut rejected the transaction.');
      const matches=(typeof window.cuttingRecords==='function'?window.cuttingRecords():parse(raw(keys.cuts),[])).filter(c=>cutMatches(c,r));
      if(matches.length!==1)throw new Error(`Cutting History verification expected 1 exact entry and found ${matches.length}.`);
      const cut=matches[0],carpets=typeof window.carpetRecords==='function'?window.carpetRecords():parse(raw(keys.carpet),[]),carpet=carpets.find(x=>(clean(r.carpetRecordId)&&sameId(x?.id,r.carpetRecordId))||keyRoll(x?.roll)===keyRoll(r.roll));
      if(!carpet)throw new Error('Exact carpet record disappeared during commit.');
      if(Number.isFinite(Number(cut.remainingLength))&&Math.abs(Number(carpet.length)-Number(cut.remainingLength))>0.011)throw new Error('Carpet balance and Cutting History do not agree.');
      ledgerCommit(r,cut);touched.add(LEDGER);
      journal.phase='committed';journal.touched=[...touched];journal.committedAt=new Date().toISOString();direct(JOURNAL,JSON.stringify(journal));committed=true;
    }catch(e){
      try{direct(keys.carpet,before.carpet);direct(keys.cuts,before.cuts);direct(keys.orders,before.orders);direct(keys.events,before.events);direct(LEDGER,before.ledger);localStorage.removeItem(JOURNAL)}catch(rollbackErr){console.error('[Build128] Immediate rollback failed; recovery journal retained if possible.',rollbackErr);try{direct(JOURNAL,JSON.stringify(journal))}catch(_){}}
      try{Object.keys(r).forEach(k=>{if(!(k in recordBefore))delete r[k]});Object.assign(r,recordBefore)}catch(_){}
      console.error('[Build128] Carpet cut transaction rolled back',e);alert('Carpet cut was NOT committed. All linked local records were rolled back. '+String(e?.message||e));return false;
    }finally{window.save=originalSave}

    if(committed){
      try{for(const k of touched){if(k===LEDGER)continue;const v=parse(raw(k),null);if(v!==null&&typeof window.queueCloudSave==='function')window.queueCloudSave(k,v)}}catch(e){console.warn('[Build128] Cloud queue will retry later',e)}
      try{localStorage.removeItem(JOURNAL)}catch(_){}
      return true;
    }
    return false;
  };

  window.RUNLU_CUT_TRANSACTION_GUARD_V128={build:BUILD,journalKey:JOURNAL,ledgerKey:LEDGER,executionKey,recoverPending,existingCut};
  console.info('[Build128] Carpet Cut Transaction Guard active');
})();
