// RUNLU Warehouse AI V6.12.37 Build132 — Carpet Cut Transaction Guard
(() => {
  if(window.__RUNLU_BUILD132_CARPET_CUT_TRANSACTION_GUARD__) return;
  window.__RUNLU_BUILD132_CARPET_CUT_TRANSACTION_GUARD__=true;

  const CARPETDB_KEY='runlu_carpet_inventory_v52';
  const CUTDB_KEY='runlu_cutting_log_v52';
  const ORDERDB_KEY='runlu_orders_v20';
  const EVENTDB_KEY='runlu_event_history_v52';
  const WATCHED=[CARPETDB_KEY,CUTDB_KEY,ORDERDB_KEY,EVENTDB_KEY];
  const EPS=0.011;

  const text=v=>String(v??'').trim();
  const key=v=>typeof window.normKey==='function'?window.normKey(v):text(v).toLowerCase().replace(/\s+/g,' ');
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const close=(a,b)=>Math.abs(num(a)-num(b))<EPS;
  const clone=v=>{try{return JSON.parse(JSON.stringify(v))}catch{return v}};
  const rows=k=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch{return[]}};

  function capture(){return Object.fromEntries(WATCHED.map(k=>[k,localStorage.getItem(k)]));}
  function restore(snapshot){
    for(const k of WATCHED){
      const raw=snapshot[k];
      if(raw===null||raw===undefined)localStorage.removeItem(k);else localStorage.setItem(k,raw);
    }
  }
  function restoreObject(target,snapshot){
    if(!target||!snapshot)return;
    for(const k of Object.keys(target))delete target[k];
    Object.assign(target,clone(snapshot));
  }
  function operationCuts(id){const idKey=text(id);return rows(CUTDB_KEY).filter(c=>text(c?.operationId)===idKey);}
  function operationEvents(id){const idKey=text(id);return rows(EVENTDB_KEY).filter(e=>text(e?.operationId)===idKey);}
  function linkedOrder(po){
    const p=key(po);if(!p)return null;
    return rows(ORDERDB_KEY).find(o=>[o?.poNumber,o?.soNumber,o?.po].some(v=>key(v)===p))||null;
  }
  function physicalRoll(cut,r){
    const carpets=rows(CARPETDB_KEY);
    if(cut?.carpetRecordId!==undefined&&cut?.carpetRecordId!==null&&text(cut.carpetRecordId)!==''){
      const byId=carpets.find(x=>text(x?.id)===text(cut.carpetRecordId));if(byId)return byId;
    }
    if(r?.carpetRecordId!==undefined&&r?.carpetRecordId!==null&&text(r.carpetRecordId)!==''){
      const byId=carpets.find(x=>text(x?.id)===text(r.carpetRecordId));if(byId)return byId;
    }
    const rollKey=key(cut?.roll||r?.roll);return carpets.find(x=>key(x?.roll)===rollKey)||null;
  }
  function materiallySame(cut,r){
    const requested=num(r?.requestedQuantity??r?.quantity),cuts=Math.max(1,num(r?.numberOfCuts||1));
    if(!close(cut?.requestedCutLength??cut?.cutLength,requested))return false;
    if(num(cut?.numberOfCuts||1)!==cuts)return false;
    if(r?.roll&&key(cut?.roll)!==key(r.roll))return false;
    if(r?.carpetRecordId&&text(cut?.carpetRecordId)!==text(r.carpetRecordId))return false;
    if(r?.po&&key(cut?.po)!==key(r.po))return false;
    return true;
  }
  function consistentRecordedCut(cut,r){
    const roll=physicalRoll(cut,r),events=operationEvents(r.id),order=linkedOrder(r.po);
    if(!roll||!close(roll.length,cut?.remainingLength))return false;
    if(events.length!==1)return false;
    if(order&&String(order.status||'')!=='Ready')return false;
    const before=num(cut?.beforeLength),remaining=num(cut?.remainingLength),actual=num(cut?.actualCutLength);
    if(!close(before-remaining,actual))return false;
    const count=Math.max(1,num(cut?.numberOfCuts||1)),requested=num(cut?.requestedCutLength??cut?.cutLength),planned=requested+(count*0.25);
    if(!close(cut?.plannedCutLength,planned))return false;
    if(num(cut?.allowanceInches)!==count*3)return false;
    return true;
  }
  function recoverReplay(r,cut){
    r.requestedQuantity=num(cut.requestedCutLength??cut.cutLength);
    r.plannedStockQuantity=num(cut.plannedCutLength);
    r.actualStockQuantity=num(cut.actualCutLength);
    r.allowanceInches=num(cut.allowanceInches);
    r.fullRollConsumed=!!cut.fullRollConsumed;
    r.impactApplied=true;
    r.appliedAt=cut.createdAt||new Date().toISOString();
    r.impactResult=`Carpet cut already applied · operation ${text(r.id)} · replay ignored safely`;
    return true;
  }
  function validateCommittedCut(r,hadLinkedOrder){
    const cuts=operationCuts(r.id);if(cuts.length!==1)throw new Error(`expected one cut ledger row for operation ${text(r.id)}; found ${cuts.length}`);
    const cut=cuts[0],roll=physicalRoll(cut,r),events=operationEvents(r.id);
    if(!roll)throw new Error('physical carpet roll missing after cut');
    if(!close(roll.length,cut.remainingLength))throw new Error('physical roll balance does not match cut ledger');
    if(events.length!==1)throw new Error(`expected one event-history row; found ${events.length}`);
    if(hadLinkedOrder){const order=linkedOrder(r.po);if(!order||String(order.status||'')!=='Ready')throw new Error('linked order was not committed to Ready');}
    const count=Math.max(1,num(cut.numberOfCuts||1)),requested=num(cut.requestedCutLength??cut.cutLength),planned=requested+(count*0.25);
    if(!close(cut.plannedCutLength,planned))throw new Error('3-inch-per-cut planned consumption mismatch');
    if(num(cut.allowanceInches)!==count*3)throw new Error('cut allowance ledger mismatch');
    if(!close(num(cut.beforeLength)-num(cut.remainingLength),num(cut.actualCutLength)))throw new Error('cut ledger does not conserve roll length');
    if(r.impactApplied!==true)throw new Error('operation was not marked applied');
    return cut;
  }

  function install(){
    const current=window.applySingleOperationImpact;
    if(typeof current!=='function'||current.__build132) return false;
    const original=current;
    const wrapped=function(r){
      if(!r||r.type!=='Carpet Cutting'||r.inventoryMode!=='Stock'||r.status!=='Completed'||r.impactApplied===true){
        return original.apply(this,arguments);
      }
      if(!text(r.id)){alert('Carpet cutting requires a stable operation ID before inventory can be changed.');return false;}

      const previous=operationCuts(r.id);
      if(previous.length){
        if(previous.length!==1){alert(`Carpet cut stopped: operation ${text(r.id)} has ${previous.length} cut-history rows and needs review.`);return false;}
        const cut=previous[0];
        if(!materiallySame(cut,r)){alert(`Carpet cut stopped: operation ID ${text(r.id)} is already linked to different cut details.`);return false;}
        if(!consistentRecordedCut(cut,r)){alert(`Carpet cut stopped: operation ${text(r.id)} has an incomplete prior execution and needs review before retry.`);return false;}
        return recoverReplay(r,cut);
      }

      const stateBefore=capture(),operationBefore=clone(r),hadLinkedOrder=!!linkedOrder(r.po),queued=[];
      const originalQueue=window.queueCloudSave;
      if(typeof originalQueue==='function')window.queueCloudSave=(k,v)=>queued.push([k,clone(v)]);
      let ok=false,reason='';
      try{
        ok=original.apply(this,arguments)===true;
        if(!ok)throw new Error('base cut execution rejected the operation');
        validateCommittedCut(r,hadLinkedOrder);
      }catch(err){reason=err?.message||String(err);ok=false;}
      window.queueCloudSave=originalQueue;

      if(!ok){
        try{restore(stateBefore);}catch(rollbackErr){
          console.error('[Build132] carpet cut rollback failed',rollbackErr);
          alert('CRITICAL: Carpet cut rollback could not restore local data. Stop work on this roll and review Carpet Inventory and Cut History before continuing.');
          return false;
        }
        restoreObject(r,operationBefore);
        alert(`Carpet cut transaction stopped and rolled back: ${reason}`);
        return false;
      }

      if(typeof originalQueue==='function'){
        try{for(const [k,v] of queued)originalQueue(k,v);}catch(err){console.error('[Build132] cloud queue handoff failed',err);alert('Carpet cut was saved locally, but Cloud sync could not be queued. Keep this page open and confirm Cloud status before continuing.');}
      }
      return true;
    };
    wrapped.__build132=true;
    wrapped.__original=original;
    window.applySingleOperationImpact=wrapped;
    document.documentElement.setAttribute('data-runlu-carpet-cut-transaction-guard','132');
    return true;
  }

  window.runluCarpetCutTransactionGuard132={install,operationCuts,operationEvents,consistentRecordedCut};
  install();
  [80,350,1200].forEach(ms=>setTimeout(install,ms));
  window.addEventListener('pageshow',()=>setTimeout(install,40));
})();