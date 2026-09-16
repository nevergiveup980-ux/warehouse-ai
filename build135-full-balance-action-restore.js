// RUNLU Warehouse OS V6.12.40 Build135 · FULL Balance Recovery + Work Action Restore.
// Legacy FULL carpet records can have a valid Original Size but a zero/missing Current Length.
// The base detail page intentionally hides Record Cut / TM / Return / REM / Transfer when Current
// Length is unknown, which can stop warehouse work. For a warehouse-active FULL roll with no cut
// history, Original Size is the safe opening balance. If cut history exists, the newest logged
// remaining balance is authoritative. Recover that balance in place, audit it, and let the normal
// carpet workflow render its standard work buttons again. No new carpet record is created.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD135_FULL_BALANCE_ACTION_RESTORE__)return;
  window.__RUNLU_BUILD135_FULL_BALANCE_ACTION_RESTORE__=true;

  const BUILD='135';
  const CARPET='runlu_carpet_inventory_v52';
  const CUT='runlu_cutting_log_v52';
  const EVENT='runlu_event_history_v52';
  let recovering=false;

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ');
  const num=v=>Number(v);
  const parseMs=v=>{const n=Date.parse(text(v));return Number.isFinite(n)?n:0};
  const loadArray=k=>{try{const a=typeof window.load==='function'?window.load(k):JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(a)?a:[]}catch{return []}};

  function warehouseActive(r={}){
    if(norm(r.status)!=='ACTIVE')return false;
    if(r.transferredOut===true||norm(r.warehouseScope)==='EXTERNAL')return false;
    return true;
  }
  function cutMatches(c,r){
    if(!c||!r)return false;
    if(c.carpetRecordId!=null&&r.id!=null&&String(c.carpetRecordId)===String(r.id))return true;
    return !!norm(c.roll)&&norm(c.roll)===norm(r.roll);
  }
  function compareCut(a,b){
    const ad=text(a?.date),bd=text(b?.date);if(ad!==bd)return ad.localeCompare(bd,undefined,{numeric:true});
    const at=text(a?.time),bt=text(b?.time);if(at!==bt)return at.localeCompare(bt,undefined,{numeric:true});
    const ac=parseMs(a?.createdAt),bc=parseMs(b?.createdAt);if(ac!==bc)return ac-bc;
    return Number(a?.id||0)-Number(b?.id||0);
  }
  function cutsFor(r,cuts=loadArray(CUT)){return cuts.filter(c=>cutMatches(c,r)).sort(compareCut)}
  function latestLoggedBalance(r,cuts){
    const rows=cutsFor(r,cuts);
    for(let i=rows.length-1;i>=0;i--){
      const n=num(rows[i]?.remainingLength);
      if(Number.isFinite(n)&&n>=0)return {balance:n,cut:rows[i],count:rows.length};
    }
    return null;
  }
  function recoveryPlan(r,cuts){
    if(!r||Number(r.length||0)>0||!warehouseActive(r))return null;
    const logged=latestLoggedBalance(r,cuts);
    if(logged){
      if(logged.balance<=0)return {balance:0,reason:'latest-cut-balance',cut:logged.cut,count:logged.count,usedUp:true};
      return {balance:logged.balance,reason:'latest-cut-balance',cut:logged.cut,count:logged.count};
    }
    const original=Number(r.originalLength||0);
    if(norm(r.measure)==='FULL'&&original>0)return {balance:original,reason:'full-original-opening-balance',count:0};
    return null;
  }
  function appendAudit(events,r,plan){
    const key=`BUILD135:${String(r.id??'')}:${plan.reason}:${Number(plan.balance||0).toFixed(4)}`;
    if(events.some(e=>text(e.build135RecoveryKey)===key))return;
    const label=typeof window.feetLabel==='function'?window.feetLabel(plan.balance):`${plan.balance} ft`;
    events.unshift({
      id:Date.now()+Math.random(),time:new Date().toISOString(),type:'Carpet Balance Recovery',reference:r.roll||'',build135RecoveryKey:key,
      result:plan.reason==='latest-cut-balance'
        ?`Recovered current carpet balance from the newest Cutting History entry: ${label}. No new carpet record was created.`
        :`Recovered missing current balance for active FULL roll from Original Size: ${label}. No Cutting History existed and no new carpet record was created.`
    });
  }
  function recoverVisibleBalances(reason='automatic'){
    if(recovering)return {changed:0,busy:true};
    recovering=true;
    try{
      const raw=loadArray(CARPET),cuts=loadArray(CUT),events=loadArray(EVENT);
      if(!raw.length)return {changed:0};
      let visible=[];
      try{visible=typeof window.carpetRecords==='function'?window.carpetRecords():raw}catch{visible=raw}
      if(!Array.isArray(visible))visible=raw;
      const visibleIds=new Set(visible.map(r=>String(r.id)));
      let changed=0,eventChanged=false;const now=new Date().toISOString();
      for(const r of raw){
        // Build134 hides compatible backup rows. Recover only the operational/canonical row.
        if(r.id!=null&&!visibleIds.has(String(r.id)))continue;
        const plan=recoveryPlan(r,cuts);if(!plan)continue;
        r.length=Number(plan.balance.toFixed(4));
        r.updatedAt=now;r.balanceRecoveredAt=now;r.balanceRecoveredByBuild=BUILD;r.balanceRecoveryReason=plan.reason;
        if(plan.usedUp){r.status='Used Up';r.tmRequired=false;}
        else{
          if(norm(r.measure)==='FULL'&&plan.reason==='latest-cut-balance')r.measure='CAL';
          r.status='Active';
          r.tmRequired=norm(r.measure)!=='TM'&&r.length<=50&&r.length>=3;
        }
        const beforeEvents=events.length;appendAudit(events,r,plan);if(events.length!==beforeEvents)eventChanged=true;
        changed++;
      }
      if(changed){
        if(typeof window.save==='function')window.save(CARPET,raw);else localStorage.setItem(CARPET,JSON.stringify(raw));
        if(eventChanged){if(typeof window.save==='function')window.save(EVENT,events);else localStorage.setItem(EVENT,JSON.stringify(events));}
        document.documentElement?.setAttribute('data-runlu-full-balance-recovery',`${BUILD}:${changed}:${reason}`);
        setTimeout(()=>window.runluCloudMasterSync?.({silent:true}),900);
      }
      return {changed};
    }catch(e){console.warn('[Build135] carpet balance recovery stopped',e?.message||e);return {changed:0,error:e?.message||String(e)}}
    finally{recovering=false}
  }
  function recoverExact(recordId,roll=''){
    const raw=loadArray(CARPET),cuts=loadArray(CUT),events=loadArray(EVENT);if(!raw.length)return false;
    let target=recordId!=null&&recordId!==''?raw.find(r=>String(r.id)===String(recordId)):null;
    if(!target&&norm(roll)){
      let visible=[];try{visible=typeof window.carpetRecords==='function'?window.carpetRecords():raw}catch{visible=raw}
      target=(Array.isArray(visible)?visible:raw).find(r=>norm(r.roll)===norm(roll))||null;
      if(target&&target.id!=null)target=raw.find(r=>String(r.id)===String(target.id))||target;
    }
    if(!target)return false;
    const plan=recoveryPlan(target,cuts);if(!plan)return Number(target.length||0)>0;
    const now=new Date().toISOString();target.length=Number(plan.balance.toFixed(4));target.updatedAt=now;target.balanceRecoveredAt=now;target.balanceRecoveredByBuild=BUILD;target.balanceRecoveryReason=plan.reason;
    if(plan.usedUp){target.status='Used Up';target.tmRequired=false}else{if(norm(target.measure)==='FULL'&&plan.reason==='latest-cut-balance')target.measure='CAL';target.status='Active';target.tmRequired=norm(target.measure)!=='TM'&&target.length<=50&&target.length>=3;}
    appendAudit(events,target,plan);
    if(typeof window.save==='function'){window.save(CARPET,raw);window.save(EVENT,events)}else{localStorage.setItem(CARPET,JSON.stringify(raw));localStorage.setItem(EVENT,JSON.stringify(events))}
    setTimeout(()=>window.runluCloudMasterSync?.({silent:true}),900);return Number(target.length||0)>0;
  }
  function installOpenDetailGuard(){
    const current=window.openCarpetDetail;if(typeof current!=='function')return false;if(current.__build135BalanceGuard)return true;
    const wrapped=function(id){recoverExact(id);return current.apply(this,arguments)};
    wrapped.__build135BalanceGuard=true;wrapped.__original=current;window.openCarpetDetail=wrapped;return true;
  }
  function installStartCutGuard(){
    const current=window.startCarpetCut;if(typeof current!=='function')return false;if(current.__build135BalanceGuard)return true;
    const wrapped=function(roll,recordId=''){
      const ok=recoverExact(recordId,roll);
      let found=null;try{found=(typeof window.carpetRecords==='function'?window.carpetRecords():[]).find(r=>(recordId!==''&&String(r.id)===String(recordId))||norm(r.roll)===norm(roll))}catch(_){}
      if(!ok&&!(Number(found?.length||0)>0)){
        alert(`Roll ${roll||'—'} still has no usable Current Length. Enter the current length in Edit, or use Cut History if you are reconstructing an older cut, before starting a new cut.`);
        return false;
      }
      return current.apply(this,arguments);
    };
    wrapped.__build135BalanceGuard=true;wrapped.__original=current;window.startCarpetCut=wrapped;return true;
  }
  function install(){
    installOpenDetailGuard();installStartCutGuard();
    const result=recoverVisibleBalances('install');
    if(result.changed){
      try{window.renderCarpetInventory?.()}catch(_){}
      try{const id=typeof activeCarpetId!=='undefined'?activeCarpetId:null;if(id)window.openCarpetDetail?.(id)}catch(_){}
    }
    document.documentElement?.setAttribute('data-runlu-full-balance-action-restore',BUILD);
  }
  function boot(){
    install();let tries=0;const timer=setInterval(()=>{installOpenDetailGuard();installStartCutGuard();if(++tries>=120)clearInterval(timer)},100);
    setTimeout(()=>{const r=recoverVisibleBalances('settled');if(r.changed)try{window.renderCarpetInventory?.()}catch(_){}},1200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('pageshow',()=>setTimeout(()=>{installOpenDetailGuard();installStartCutGuard();recoverVisibleBalances('pageshow')},80));
  window.addEventListener('focus',()=>setTimeout(()=>recoverVisibleBalances('focus'),120));
  window.RUNLUFullBalanceActionRestoreBuild135={version:BUILD,recoveryPlan,recoverVisibleBalances,recoverExact};
})();
