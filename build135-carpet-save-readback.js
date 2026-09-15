// RUNLU Warehouse OS V6.13.2 Build135 · Carpet Save Readback
// A successful CHC022/CHC023 edit must be read back from the Cloud Master and repainted on screen.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD135_CARPET_SAVE_READBACK__)return;
  window.__RUNLU_BUILD135_CARPET_SAVE_READBACK__=true;

  const VERSION='6.13.2',BUILD='135',CARPETDB='runlu_carpet_inventory_v52';
  const SHARED=new Set(['CHC022','CHC023']);
  let installed=false,busy=false;

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ');
  const sharedCode=v=>SHARED.has(norm(v));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const el=id=>document.getElementById(id);

  function cloudApi(){return window.RUNLUCloudFirstBuild133||null}
  function build134(){return window.RUNLUSharedCarpetEditBuild134||null}
  function cloudRows(){
    const api=cloudApi();
    const rows=api?.get?.(CARPETDB);
    if(Array.isArray(rows))return rows;
    return typeof window.carpetRecords==='function'?window.carpetRecords():[];
  }
  function matchingRow(rows,roll,mfr,id){
    const b=build134();
    if(mfr){
      const byMfr=rows.find(r=>norm(r?.manufacturerRoll)===norm(mfr)&&(!roll||b?.rowSharedCode?.(r)===roll||norm(r?.roll)===roll));
      if(byMfr)return byMfr;
    }
    if(id!=null){const byId=rows.find(r=>String(r?.id)===String(id));if(byId)return byId}
    return null;
  }
  async function waitUntilCloudIdle(timeout=10000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      const st=cloudApi()?.status?.()||{};
      if(!Number(st.pending||0))return true;
      await sleep(120);
    }
    return false;
  }
  async function readBackConfirmed(roll,mfr,id,timeout=12000){
    const started=Date.now();
    while(Date.now()-started<timeout){
      await waitUntilCloudIdle(2500);
      const api=cloudApi();
      if(api?.refresh)await api.refresh(false);
      const row=matchingRow(cloudRows(),roll,mfr,id);
      if(row&&(!mfr||norm(row.manufacturerRoll)===norm(mfr)))return row;
      await sleep(180);
    }
    throw new Error(`Cloud readback did not return ${roll}${mfr?' · Manufacturer Roll '+mfr:''}.`);
  }
  function repaintConfirmed(row){
    const mfr=el('ceMfr');if(mfr)mfr.value=text(row?.manufacturerRoll);
    if(typeof window.renderCarpetInventory==='function')window.renderCarpetInventory();
    if(row&&typeof window.openCarpetDetail==='function')window.openCarpetDetail(row.id);
    document.documentElement.setAttribute('data-runlu-carpet-readback','confirmed');
    return row;
  }
  async function saveSharedAndReadBack(){
    const b=build134();if(!b?.saveSharedEdit)return false;
    const roll=norm(el('ceRoll')?.value),mfr=text(el('ceMfr')?.value).toUpperCase();
    const handled=await b.saveSharedEdit();
    if(!handled)return handled;
    try{
      const row=await readBackConfirmed(roll,mfr,b.editId);
      repaintConfirmed(row);
    }catch(e){
      console.error('[Build135] carpet save readback',e);
      document.documentElement.setAttribute('data-runlu-carpet-readback','attention');
      alert('The change reached Warehouse Cloud, but this screen could not read the confirmed record back yet. Please reopen Carpet Inventory before editing this roll again.');
    }
    return handled;
  }
  function install(){
    const current=window.saveCarpetEdit;
    if(typeof current==='function'&&!current.__build135){
      const prior=current;
      const wrapped=function(){
        const roll=norm(el('ceRoll')?.value);
        if(!sharedCode(roll)||!build134()?.saveSharedEdit)return prior.apply(this,arguments);
        if(busy)return undefined;
        busy=true;
        return saveSharedAndReadBack().finally(()=>{busy=false});
      };
      wrapped.__build135=true;wrapped.__original=prior;window.saveCarpetEdit=wrapped;installed=true;
    }
    document.documentElement.setAttribute('data-runlu-build135',installed?'ready':'waiting');
  }

  install();let tries=0,t=setInterval(()=>{install();if(installed&&++tries>20||++tries>160)clearInterval(t)},100);
  window.addEventListener('pageshow',()=>setTimeout(install,40));
  window.RUNLUCarpetSaveReadbackBuild135={version:BUILD,appVersion:VERSION,sharedCode,matchingRow,readBackConfirmed,repaintConfirmed,saveSharedAndReadBack,get installed(){return installed}};
})();
