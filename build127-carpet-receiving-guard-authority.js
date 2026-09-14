// RUNLU Warehouse OS V6.12.32 Build127 · Carpet Receiving guard authority.
// Build125 recognizes Pending CHC placeholders correctly, but the persistent Build120
// MutationObserver can re-wrap save/completion handlers afterward and restore the old
// duplicate-manufacturer rejection. Claim the Build125 handlers as the final authority.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD127_CARPET_GUARD_AUTHORITY__)return;
  window.__RUNLU_BUILD127_CARPET_GUARD_AUTHORITY__=true;

  const BUILD='127';

  function findLayer(fn,marker){
    let cur=fn,depth=0;
    while(typeof cur==='function'&&depth++<24){
      if(cur[marker])return cur;
      cur=cur.__original;
    }
    return null;
  }
  function claimReceivingHandler(name){
    const current=window[name];if(typeof current!=='function')return false;
    const build125=findLayer(current,'__build125');if(!build125)return false;
    // Build120's persistent MutationObserver treats __build120 as ownership. Mark the
    // approved Build125 layer with that compatibility bit so it cannot be re-wrapped.
    build125.__build120=true;
    build125.__build124SharedRollPolicy=true;
    build125.__build127GuardAuthority=true;
    window[name]=build125;
    return window[name]===build125;
  }
  function claimImpact(){
    const current=window.applySingleOperationImpact;if(typeof current!=='function')return false;
    const build126=findLayer(current,'__build126');if(!build126)return false;
    // Stop older Build124/125 retry loops from becoming the outermost impact handler.
    build126.__build124SharedCarpet=true;
    build126.__build125=true;
    build126.__build127GuardAuthority=true;
    window.applySingleOperationImpact=build126;
    return window.applySingleOperationImpact===build126;
  }
  function claim(){
    const save=claimReceivingHandler('saveOperation');
    const add=claimReceivingHandler('addOperationItem');
    const status=claimReceivingHandler('setOperationStatus');
    const impact=claimImpact();
    document.documentElement.setAttribute('data-runlu-carpet-guard-authority',BUILD);
    return {save,add,status,impact};
  }

  claim();
  let tries=0;
  const timer=setInterval(()=>{
    claim();
    if(++tries>=100)clearInterval(timer);
  },200);
  window.addEventListener('pageshow',()=>setTimeout(claim,50));
  window.addEventListener('focus',()=>setTimeout(claim,50));

  window.RUNLUCarpetGuardAuthorityBuild127={version:BUILD,findLayer,claimReceivingHandler,claimImpact,claim};
})();
