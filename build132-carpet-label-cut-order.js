// RUNLU Warehouse OS V6.12.37 Build132 · Carpet Label Cut History Order.
// Printed/previewed carpet roll cards should read like a physical ledger:
// older cuts at the top, newer cuts below. When a roll has more than five cuts,
// keep the most recent five, but still display those five oldest-to-newest.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD132_CARPET_LABEL_CUT_ORDER__)return;
  window.__RUNLU_BUILD132_CARPET_LABEL_CUT_ORDER__=true;

  const BUILD='132';

  function text(v){return String(v??'').trim()}
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
    const rows=(typeof cuttingRecords==='function'?cuttingRecords():[])
      .filter(c=>typeof cutBelongsToRoll==='function'&&cutBelongsToRoll(c,x))
      .sort(compareCutsOldestFirst);
    return rows.slice(-Math.max(1,Number(limit)||5));
  }

  window.cutRowsForTag=function cutRowsForTagBuild132(x){
    const cuts=orderedRecentCutsForTag(x,5);
    return Array.from({length:5},(_,i)=>{
      const c=cuts[i];
      return c
        ?`<tr><td>${esc(c.date||'')}</td><td>${esc(c.po||'')}</td><td>${esc(c.customer||'')}</td><td>${esc(c.operator||'')}</td><td>${feetLabel(c.cutLength)}</td><td>${feetLabel(c.remainingLength)}</td></tr>`
        :'<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    }).join('');
  };

  document.documentElement?.setAttribute('data-runlu-carpet-label-cut-order','oldest-first');
  window.RUNLUCarpetLabelCutOrderBuild132={
    version:BUILD,
    compareCutsOldestFirst,
    orderedRecentCutsForTag
  };
})();
