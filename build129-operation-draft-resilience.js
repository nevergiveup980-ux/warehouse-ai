// RUNLU Warehouse OS V6.12.34 Build129 · resilient operation draft cache.
// Keeps Warehouse Work drafts durable when Safari/localStorage is full or temporarily unavailable.
// Drafts are local-only: this layer never queues or overwrites Warehouse Cloud data.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD129_OPERATION_DRAFT_RESILIENCE__)return;
  window.__RUNLU_BUILD129_OPERATION_DRAFT_RESILIENCE__=true;

  const VERSION='6.12.34', BUILD='129';
  const DRAFT_KEY='runlu_operation_draft_v55';
  const IDB_NAME='runlu_warehouse_resilient_cache_v129';
  const IDB_STORE='drafts';
  const IDB_KEY='operation-draft';
  let installedSave=false,installedSchedule=false,installedNew=false,installedDelete=false,installedComplete=false;
  let failureNoticeShown=false,recoveryPromptOpen=false;

  const q=id=>document.getElementById(id);
  const nowLabel=()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const safeJson=raw=>{try{return JSON.parse(raw)}catch{return null}};
  const localDraft=()=>safeJson(localStorage.getItem(DRAFT_KEY)||'null');
  const editorOpen=()=>{const el=q('operationEditor');return !!el&&!el.classList.contains('hidden')};
  const quotaError=e=>!!e&&(
    e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014||/quota|storage.*full|exceed/i.test(String(e.message||e))
  );

  function paint(text,tone='pending'){
    const el=q('operationDraftState');if(!el)return;
    el.textContent=text;
    el.dataset.draftState=tone;
    el.style.color=tone==='ok'?'var(--green)':tone==='warn'?'var(--orange)':tone==='error'?'var(--red)':'var(--muted)';
    el.style.fontWeight='800';
  }

  function cleanupStorage(){
    let reclaimed=0;
    for(const fn of ['pruneLocalApplicationCache','aggressiveSafeStorageCleanup']){
      try{
        const f=window[fn];if(typeof f!=='function')continue;
        const r=f(true)||{};reclaimed+=Number(r.reclaimedBytes||0)||0;
      }catch(e){console.warn(`[Build129] ${fn} skipped`,e)}
    }
    return reclaimed;
  }

  function writeLocal(payload){
    const encoded=JSON.stringify(payload);
    try{localStorage.setItem(DRAFT_KEY,encoded);return {ok:true,reclaimed:0}}
    catch(first){
      const reclaimed=quotaError(first)?cleanupStorage():0;
      try{localStorage.setItem(DRAFT_KEY,encoded);return {ok:true,reclaimed}}
      catch(error){return {ok:false,error,reclaimed}}
    }
  }

  function openDb(){
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('IndexedDB unavailable'));return}
      let req;try{req=window.indexedDB.open(IDB_NAME,1)}catch(e){reject(e);return}
      req.onupgradeneeded=()=>{try{const db=req.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE)}catch(e){reject(e)}};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
      req.onblocked=()=>reject(new Error('IndexedDB open blocked'));
    });
  }

  async function idbRequest(mode,action){
    const db=await openDb();
    try{
      return await new Promise((resolve,reject)=>{
        let tx,req;try{tx=db.transaction(IDB_STORE,mode);req=action(tx.objectStore(IDB_STORE))}catch(e){reject(e);return}
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error||new Error('IndexedDB request failed'));
        tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));
      });
    }finally{try{db.close()}catch{}}
  }

  function writeFallback(payload){return idbRequest('readwrite',store=>store.put({payload,savedAt:new Date().toISOString(),build:BUILD},IDB_KEY))}
  async function readFallback(){const row=await idbRequest('readonly',store=>store.get(IDB_KEY));return row&&row.payload?row:null}
  function deleteFallback(){return idbRequest('readwrite',store=>store.delete(IDB_KEY)).catch(()=>false)}

  async function persistCurrentDraft(){
    if(!editorOpen())return false;
    if(typeof window.operationDraftPayload!=='function')return false;
    let payload;try{payload=window.operationDraftPayload()}catch(e){console.error('[Build129] draft payload failed',e);paint('⚠ Draft could not be prepared','error');return false}
    try{operationDraftDirty=true}catch{}

    const local=writeLocal(payload);
    if(local.ok){
      failureNoticeShown=false;
      paint('✓ Draft saved automatically '+nowLabel(),'ok');
      // Keep an independent recovery copy. A failure here does not invalidate the successful localStorage save.
      writeFallback(payload).catch(e=>console.warn('[Build129] IndexedDB mirror unavailable',e));
      return true;
    }

    try{
      await writeFallback(payload);
      failureNoticeShown=false;
      paint('✓ Draft saved safely on this device '+nowLabel(),'ok');
      console.warn('[Build129] localStorage unavailable; operation draft is protected in IndexedDB.',local.error);
      return true;
    }catch(fallbackError){
      console.error('[Build129] both local draft stores failed',local.error,fallbackError);
      paint('⚠ Draft is still on screen — device cache could not save','error');
      if(!failureNoticeShown){
        failureNoticeShown=true;
        alert('This draft is still on the screen, but this device could not save its local caches. No cloud overwrite was attempted. Keep this page open until the draft can be completed or storage becomes available.');
      }
      return false;
    }
  }

  function wrapDraftSave(){
    const current=window.saveOperationDraftNow;
    if(typeof current!=='function'||current.__build129)return false;
    const wrapped=function(){return persistCurrentDraft()};
    wrapped.__build129=true;wrapped.__original=current;window.saveOperationDraftNow=wrapped;installedSave=true;return true;
  }

  function wrapDraftSchedule(){
    const current=window.scheduleOperationDraft;
    if(typeof current!=='function'||current.__build129)return false;
    const wrapped=function(){paint('Saving draft…','pending');return current.apply(this,arguments)};
    wrapped.__build129=true;wrapped.__original=current;window.scheduleOperationDraft=wrapped;installedSchedule=true;return true;
  }

  function wrapNewOperation(){
    const current=window.newOperation;
    if(typeof current!=='function'||current.__build129)return false;
    const wrapped=function(date='',skipDraftPrompt=false){
      let hadLocal=false;try{hadLocal=!!localStorage.getItem(DRAFT_KEY)}catch{}
      const out=current.apply(this,arguments);
      if(skipDraftPrompt)return out;
      if(hadLocal){
        // The legacy prompt removes localStorage only when the operator declines recovery.
        let stillLocal=false;try{stillLocal=!!localStorage.getItem(DRAFT_KEY)}catch{}
        if(!stillLocal)deleteFallback();
        return out;
      }
      setTimeout(async()=>{
        if(recoveryPromptOpen||!editorOpen())return;
        let row=null;try{row=await readFallback()}catch{return}
        if(!row?.payload||localDraft())return;
        recoveryPromptOpen=true;
        try{
          if(confirm('A safely recovered unfinished order draft was found on this device. Continue where you stopped?')){
            if(typeof window.restoreOperationDraft==='function')window.restoreOperationDraft(row.payload);
            try{operationDraftDirty=true}catch{}
            paint('✓ Recovered draft from safe device cache','ok');
          }else await deleteFallback();
        }finally{recoveryPromptOpen=false}
      },80);
      return out;
    };
    wrapped.__build129=true;wrapped.__original=current;window.newOperation=wrapped;installedNew=true;return true;
  }

  function wrapDeleteDraft(){
    const current=window.deleteOperationDraft;
    if(typeof current!=='function'||current.__build129)return false;
    const wrapped=function(){const out=current.apply(this,arguments);if(!editorOpen())deleteFallback();return out};
    wrapped.__build129=true;wrapped.__original=current;window.deleteOperationDraft=wrapped;installedDelete=true;return true;
  }

  function wrapCompleteOperation(){
    const current=window.saveOperation;
    if(typeof current!=='function'||current.__build129)return false;
    const wrapped=function(){
      const out=current.apply(this,arguments);
      const finish=()=>{if(!editorOpen())deleteFallback()};
      if(out&&typeof out.finally==='function')out.finally(finish);else queueMicrotask(finish);
      return out;
    };
    wrapped.__build129=true;wrapped.__original=current;window.saveOperation=wrapped;installedComplete=true;return true;
  }

  function install(){
    wrapDraftSave();wrapDraftSchedule();wrapNewOperation();wrapDeleteDraft();wrapCompleteOperation();
    if(installedSave)document.documentElement.setAttribute('data-runlu-operation-draft-resilience',BUILD);
    return installedSave&&installedSchedule&&installedNew&&installedDelete&&installedComplete;
  }

  function boot(){
    install();let tries=0;
    const timer=setInterval(()=>{if(install()||++tries>180)clearInterval(timer)},100);
    window.addEventListener('pageshow',()=>setTimeout(install,30));
    window.addEventListener('focus',()=>setTimeout(install,30));
  }

  window.RUNLUOperationDraftBuild129={version:BUILD,appVersion:VERSION,persistCurrentDraft,writeFallback,readFallback,deleteFallback,install};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
