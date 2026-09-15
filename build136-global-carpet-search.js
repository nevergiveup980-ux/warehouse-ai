// RUNLU Warehouse OS V6.13.3 Build136 · Global Carpet Search
// Text search is an inventory lookup, not a status/rack filter. A known roll must never look deleted
// just because Active, Used Up, measure, review, or rack filters are currently selected.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD136_GLOBAL_CARPET_SEARCH__)return;
  window.__RUNLU_BUILD136_GLOBAL_CARPET_SEARCH__=true;

  const VERSION='6.13.3',BUILD='136';
  let installed=false;
  const el=id=>document.getElementById(id);
  const text=v=>String(v??'').trim();

  function searchText(){return text(el('carpetFilter')?.value)}
  function readFilterState(){
    const out={quick:'',rack:'',available:false};
    try{out.quick=carpetQuickFilter;out.available=true}catch{}
    try{out.rack=carpetRackFilter;out.available=true}catch{}
    return out;
  }
  function writeFilterState(state){
    let touched=false;
    try{carpetQuickFilter=state.quick;touched=true}catch{}
    try{carpetRackFilter=state.rack;touched=true}catch{}
    return touched;
  }
  function annotateSearch(q,prior){
    const count=el('carpetCount');
    if(count&&q){
      const base=text(count.textContent);
      const suffix='Global search · all roll statuses and racks';
      if(!base.includes(suffix))count.textContent=(base?base+' · ':'')+suffix;
    }
    const input=el('carpetFilter');
    if(input)input.setAttribute('data-runlu-global-search',q?'active':'idle');
    document.documentElement.setAttribute('data-runlu-carpet-search',q?'global':'filtered');
    if(q&&prior&&(prior.quick||prior.rack))document.documentElement.setAttribute('data-runlu-carpet-search-bypassed','yes');
    else document.documentElement.removeAttribute('data-runlu-carpet-search-bypassed');
  }
  function renderWithGlobalSearch(prior,thisArg,args){
    const q=searchText();
    if(!q){const out=prior.apply(thisArg,args);annotateSearch('',null);return out}
    const state=readFilterState();
    if(state.available)writeFilterState({quick:'',rack:''});
    try{
      const out=prior.apply(thisArg,args);
      annotateSearch(q,state);
      return out;
    }finally{
      if(state.available)writeFilterState(state);
    }
  }
  function install(){
    const prior=window.renderCarpetInventory;
    if(typeof prior!=='function')return false;
    if(prior.__build136){installed=true;return true}
    const wrapped=function(){return renderWithGlobalSearch(prior,this,arguments)};
    wrapped.__build136=true;wrapped.__original=prior;
    window.renderCarpetInventory=wrapped;installed=true;
    document.documentElement.setAttribute('data-runlu-build136','ready');
    return true;
  }

  install();let tries=0,t=setInterval(()=>{if(install()||++tries>160)clearInterval(t)},100);
  window.addEventListener('pageshow',()=>setTimeout(install,40));
  window.RUNLUGlobalCarpetSearchBuild136={version:BUILD,appVersion:VERSION,searchText,readFilterState,writeFilterState,renderWithGlobalSearch,get installed(){return installed}};
})();
