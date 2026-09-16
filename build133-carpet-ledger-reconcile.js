// RUNLU Warehouse OS V6.12.38 Build133 · Carpet Ledger Reconcile.
// 1) Install the carpet-tag cut ledger override after the base app has finished loading,
//    so older cuts stay at the top and the newest balance stays at the bottom.
// 2) Reconcile a very specific stale-duplicate pattern: two active records for the same
//    physical carpet roll where the latest cut log proves one row is the pre-cut balance
//    and the other row is the post-cut balance. The pre-cut row is archived, not deleted.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD133_CARPET_LEDGER_RECONCILE__)return;
  window.__RUNLU_BUILD133_CARPET_LEDGER_RECONCILE__=true;

  const BUILD='133';
  const ARCHIVE_STATUS='Archived Duplicate';
  const ARCHIVE_RELATION='CUT PREDECESSOR DUPLICATE';
  const TOLERANCE=0.03; // feet; tolerant to stored decimal/inch rounding only.

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ');
  const num=v=>Number(v);
  const near=(a,b)=>Number.isFinite(num(a))&&Number.isFinite(num(b))&&Math.abs(num(a)-num(b))<=TOLERANCE;

  function timeValue(v){
    const s=text(v);
    if(!s)return '';
    const m=s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(!m)return s;
    return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}:${m[3]||'00'}`;
  }
  function createdValue(v){
    const n=Date.parse(text(v));
    return Number.isFinite(n)?n:0;
  }
  function compareCutsOldestFirst(a,b){
    const ad=text(a?.date),bd=text(b?.date);
    if(ad!==bd)return ad.localeCompare(bd,undefined,{numeric:true});
    const at=timeValue(a?.time),bt=timeValue(b?.time);
    if(at!==bt)return at.localeCompare(bt,undefined,{numeric:true});
    const ac=createdValue(a?.createdAt),bc=createdValue(b?.createdAt);
    if(ac!==bc)return ac-bc;
    const ai=Number(a?.id),bi=Number(b?.id);
    if(Number.isFinite(ai)&&Number.isFinite(bi)&&ai!==bi)return ai-bi;
    return 0;
  }

  function orderedRecentCutsForTag(x,limit=5){
    const rows=(typeof window.cuttingRecords==='function'?window.cuttingRecords():[])
      .filter(c=>typeof window.cutBelongsToRoll==='function'&&window.cutBelongsToRoll(c,x))
      .sort(compareCutsOldestFirst);
    return rows.slice(-Math.max(1,Number(limit)||5));
  }

  function installTagLedger(){
    if(typeof window.cuttingRecords!=='function'||typeof window.cutBelongsToRoll!=='function'||typeof window.esc!=='function'||typeof window.feetLabel!=='function')return false;
    if(window.cutRowsForTag?.__build133)return true;
    const fixed=function cutRowsForTagBuild133(x){
      const cuts=orderedRecentCutsForTag(x,5);
      return Array.from({length:5},(_,i)=>{
        const c=cuts[i];
        return c
          ?`<tr><td>${window.esc(c.date||'')}</td><td>${window.esc(c.po||'')}</td><td>${window.esc(c.customer||'')}</td><td>${window.esc(c.operator||'')}</td><td>${window.feetLabel(c.cutLength)}</td><td>${window.feetLabel(c.remainingLength)}</td></tr>`
          :'<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
      }).join('');
    };
    fixed.__build133=true;
    window.cutRowsForTag=fixed;
    document.documentElement?.setAttribute('data-runlu-carpet-label-cut-order','oldest-first-build133');
    return true;
  }

  function physicalKey(r){
    const roll=norm(r?.roll),mfr=norm(r?.manufacturerRoll);
    if(!roll||!mfr)return '';
    return [roll,mfr,norm(r?.collection),norm(r?.colour),norm(r?.width||'12'),norm(r?.location)].join('|');
  }
  function isOperationalActive(r){
    if(!r||norm(r.status)!=='ACTIVE')return false;
    if(r.warehouseScope==='external'||r.transferredOut===true)return false;
    return true;
  }
  function isArchivedDuplicate(r){
    return norm(r?.status)===norm(ARCHIVE_STATUS)||norm(r?.relationType)===norm(ARCHIVE_RELATION)||r?.archivedByBuild==='133';
  }
  function latestCutForRoll(roll,cuts){
    return (Array.isArray(cuts)?cuts:[])
      .filter(c=>norm(c?.roll)===norm(roll)&&Number.isFinite(num(c?.beforeLength))&&Number.isFinite(num(c?.remainingLength)))
      .sort(compareCutsOldestFirst)
      .at(-1)||null;
  }

  function logArchiveEvent(stale,current,cut){
    try{
      if(typeof window.load!=='function'||typeof window.save!=='function'||typeof EVENTDB==='undefined')return;
      const events=window.load(EVENTDB),eventRows=Array.isArray(events)?events:[];
      const exists=eventRows.some(e=>e?.type==='Stale Carpet Duplicate Archived'&&String(e?.reference)===String(stale?.roll)&&String(e?.archivedRecordId)===String(stale?.id));
      if(exists)return;
      eventRows.unshift({
        id:Date.now()+Math.random(),time:new Date().toISOString(),type:'Stale Carpet Duplicate Archived',reference:stale.roll,
        archivedRecordId:stale.id,keptRecordId:current.id,build:BUILD,
        result:`Archived stale pre-cut duplicate ${stale.roll}: ${window.feetLabel?.(cut.beforeLength)||cut.beforeLength} → ${window.feetLabel?.(cut.remainingLength)||cut.remainingLength}; kept post-cut record ${current.id}.`
      });
      window.save(EVENTDB,eventRows);
    }catch(e){console.warn('[Build133] archive event log skipped',e?.message||e)}
  }

  function reconcileCutPredecessorDuplicates(){
    try{
      if(typeof window.load!=='function'||typeof window.save!=='function'||typeof CARPETDB==='undefined'||typeof CUTDB==='undefined')return 0;
      const raw=window.load(CARPETDB),cuts=window.load(CUTDB);
      if(!Array.isArray(raw)||!Array.isArray(cuts))return 0;
      const groups=new Map();
      for(const r of raw){
        if(!isOperationalActive(r)||isArchivedDuplicate(r))continue;
        const k=physicalKey(r);if(!k)continue;
        if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);
      }
      let changed=0;
      const now=new Date().toISOString();
      for(const group of groups.values()){
        if(group.length<2)continue;
        const roll=group[0].roll,cut=latestCutForRoll(roll,cuts);
        if(!cut||near(cut.beforeLength,cut.remainingLength))continue;
        const current=group.filter(r=>near(r.length,cut.remainingLength));
        const stale=group.filter(r=>near(r.length,cut.beforeLength));
        // Safety rule: only auto-reconcile a single provable before/after pair.
        if(current.length!==1||stale.length!==1||String(current[0].id)===String(stale[0].id))continue;
        const keep=current[0],old=stale[0];
        old.status=ARCHIVE_STATUS;
        old.warehouseScope='archive';
        old.relationType=ARCHIVE_RELATION;
        old.operationallyHidden=true;
        old.duplicateOfRecordId=keep.id;
        old.archiveReason=`Latest cut log proves this row is the pre-cut balance (${cut.beforeLength} ft) while record ${keep.id} holds the post-cut balance (${cut.remainingLength} ft).`;
        old.archivedAt=now;
        old.archivedByBuild=BUILD;
        old.updatedAt=now;
        changed++;
        logArchiveEvent(old,keep,cut);
      }
      if(changed){
        window.save(CARPETDB,raw);
        console.info(`[Build133] archived ${changed} stale pre-cut carpet duplicate${changed===1?'':'s'} using cutting-log proof.`);
      }
      return changed;
    }catch(e){console.warn('[Build133] duplicate reconcile skipped',e?.message||e);return 0}
  }

  function installOperationalArchiveFilter(){
    const current=window.carpetRecords;
    if(typeof current!=='function')return false;
    if(current.__build133ArchiveFilter)return true;
    const wrapped=function carpetRecordsBuild133(){
      const rows=current.apply(this,arguments);
      return Array.isArray(rows)?rows.filter(r=>!isArchivedDuplicate(r)):rows;
    };
    wrapped.__build133ArchiveFilter=true;
    wrapped.__original=current;
    window.carpetRecords=wrapped;
    return true;
  }

  function refreshVisibleCarpetUI(){
    try{
      if(typeof window.renderCarpetInventory==='function'&&document.getElementById('carpetInventoryList'))window.renderCarpetInventory();
      if(typeof window.renderDashboard==='function')window.renderDashboard();
    }catch(e){console.warn('[Build133] UI refresh skipped',e?.message||e)}
  }

  function install(reason='boot'){
    const tagReady=installTagLedger();
    const repaired=reconcileCutPredecessorDuplicates();
    const filterReady=installOperationalArchiveFilter();
    if(repaired)refreshVisibleCarpetUI();
    if(tagReady||filterReady)document.documentElement?.setAttribute('data-runlu-carpet-ledger-reconcile',BUILD);
    return {reason,tagReady,filterReady,repaired};
  }
  function boot(){
    install('DOMContentLoaded');
    let tries=0;
    const timer=setInterval(()=>{
      install('settle');
      if(++tries>=120)clearInterval(timer);
    },1000);
    window.addEventListener('pageshow',()=>setTimeout(()=>install('pageshow'),40));
    window.addEventListener('focus',()=>setTimeout(()=>install('focus'),40));
    window.addEventListener('online',()=>setTimeout(()=>install('online'),120));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>install('visible'),40)});
  }

  window.RUNLUCarpetLedgerReconcileBuild133={version:BUILD,compareCutsOldestFirst,orderedRecentCutsForTag,reconcileCutPredecessorDuplicates,isArchivedDuplicate,install};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
