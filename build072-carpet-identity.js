// RUNLU Build072 carpet identity guard — Carpet Roll # is the cloud record identity.
// Build124 revision: CHC022 / CHC023 are shared display roll codes. New physical rolls
// under those codes use a hidden physicalRollId/cloudRecordId so cloud records do not overwrite.
(() => {
  if(window.__RUNLU_BUILD072_CARPET_ID__)return;
  window.__RUNLU_BUILD072_CARPET_ID__=true;
  const CARPET='runlu_carpet_inventory_v52';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const VERSIONS='runlu_cloud_master_record_versions_v680';
  const SHARED=new Set(['CHC022','CHC023']);
  const parse=s=>{try{return JSON.parse(s)}catch{return null}},read=k=>parse(localStorage.getItem(k)||'null'),write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const roll=r=>text(r?.roll).toUpperCase().replace(/\s+/g,' ');
  const safe=v=>text(v).toUpperCase().replace(/[^A-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  const shared=v=>SHARED.has(String(v??'').trim().toUpperCase().replace(/\s+/g,' '));
  const recordIdentity=r=>{
    const code=roll(r);if(!code)return '';
    if(!shared(code))return code;
    const explicit=text(r?.cloudRecordId);if(explicit)return explicit;
    const physical=safe(r?.physicalRollId);return physical?`${code}__${physical}`:code;
  };
  const vk=id=>CARPET+'::'+id;
  function baseVersion(id){const m=read(VERSIONS)||{},v=Number(m[vk(id)]||0);return Number.isFinite(v)?v:0}
  function qid(){return 'Q-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
  function enqueue(id,op,payload){
    if(!id)return;let q=read(QUEUE);if(!Array.isArray(q))q=[];
    let i=q.findIndex(x=>x.datasetKey===CARPET&&x.recordId===id&&!x.blocked);
    if(i>=0){const cur=q[i];if(cur.baseVersion===0&&op==='delete'){q.splice(i,1);write(QUEUE,q);return}q[i]={...cur,op,payload,queuedAt:new Date().toISOString(),attempts:0};}
    else q.push({id:qid(),datasetKey:CARPET,recordId:id,op,payload,baseVersion:baseVersion(id),queuedAt:new Date().toISOString(),attempts:0,blocked:false});
    write(QUEUE,q);
  }
  function install(){
    const prior=window.save;if(typeof prior!=='function'||!prior.__build072||prior.__build072CarpetRoll)return false;
    const wrapped=function(k,v){
      if(k!==CARPET)return prior.apply(this,arguments);
      const before=read(CARPET),after=Array.isArray(v)?v:[];
      try{localStorage.setItem(CARPET,JSON.stringify(v))}catch(e){alert('Carpet cache could not be saved. No cloud record was changed.');return false}
      const a=new Map(),b=new Map();(Array.isArray(before)?before:[]).forEach(r=>{const id=recordIdentity(r);if(id)a.set(id,r)});after.forEach(r=>{const id=recordIdentity(r);if(id)b.set(id,r)});
      for(const [id,r] of b){const old=a.get(id);if(!old||JSON.stringify(old)!==JSON.stringify(r))enqueue(id,'upsert',r)}
      for(const [id,r] of a)if(!b.has(id))enqueue(id,'delete',r);
      setTimeout(()=>window.runluCloudMasterSync?.({silent:true}),700);return true;
    };
    wrapped.__build072=true;wrapped.__build072CarpetRoll=true;wrapped.__build124SharedRollIdentity=true;wrapped.__original=prior;window.save=wrapped;return true;
  }
  function boot(){setTimeout(install,0);let n=0;const t=setInterval(()=>{if(install()||++n>120)clearInterval(t)},100)}
  window.RUNLUCarpetCloudIdentity={sharedRolls:[...SHARED],isSharedRoll:shared,recordIdentity};
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
