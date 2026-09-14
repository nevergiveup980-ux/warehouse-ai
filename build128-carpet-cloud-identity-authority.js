// RUNLU Warehouse OS V6.12.33 Build128 · Carpet cloud identity authority.
// Prevent ordinary carpet edits (including rack/location changes) from being written twice:
// legacy carpet cloud identity is the operational Roll #, not the numeric local row id.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD128_CARPET_CLOUD_IDENTITY__)return;
  window.__RUNLU_BUILD128_CARPET_CLOUD_IDENTITY__=true;

  const BUILD='128';
  const CARPET='runlu_carpet_inventory_v52';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const VERSIONS='runlu_cloud_master_record_versions_v680';
  const SHARED=new Set(['CHC022','CHC023']);
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ');
  const safe=v=>text(v).toUpperCase().replace(/[^A-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const same=(a,b)=>{try{return JSON.stringify(a)===JSON.stringify(b)}catch{return false}};

  function identity(r={}){
    const code=norm(r.roll);if(!code)return '';
    if(!SHARED.has(code))return code;
    const explicit=text(r.cloudRecordId||r._cloudRecordId);if(explicit)return explicit;
    const physical=safe(r.physicalRollId);return physical?`${code}__${physical}`:code;
  }
  function version(id){const m=read(VERSIONS)||{};return Number(m[`${CARPET}::${id}`]||0)||0}
  function qid(){return 'Q-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
  function enqueue(id,op,payload){
    if(!id)return;let q=read(QUEUE);if(!Array.isArray(q))q=[];
    const idx=q.findIndex(x=>x.datasetKey===CARPET&&x.recordId===id&&!x.blocked);
    if(idx>=0){const cur=q[idx];if(cur.baseVersion===0&&op==='delete'){q.splice(idx,1);write(QUEUE,q);return}q[idx]={...cur,op,payload:clone(payload),queuedAt:new Date().toISOString(),attempts:0};}
    else q.push({id:qid(),datasetKey:CARPET,recordId:id,op,payload:clone(payload),baseVersion:version(id),queuedAt:new Date().toISOString(),attempts:0,blocked:false});
    write(QUEUE,q);
  }
  function scrubNumericCarpetQueue(){
    let q=read(QUEUE);if(!Array.isArray(q)||!q.length)return 0;let removed=0;
    q=q.filter(m=>{
      if(m?.datasetKey!==CARPET)return true;
      const wanted=identity(m.payload||{});if(!wanted||String(m.recordId)===String(wanted))return true;
      const localId=text(m.payload?.id);
      if(localId&&String(m.recordId)===localId){removed++;return false}
      return true;
    });
    if(removed)write(QUEUE,q);return removed;
  }
  function install(){
    const current=window.save;if(typeof current!=='function'||current.__build128CarpetIdentityAuthority)return false;
    const delegate=current;
    const wrapped=function(k,v){
      if(k!==CARPET)return delegate.apply(this,arguments);
      const before=read(CARPET),after=Array.isArray(v)?v:[];
      try{localStorage.setItem(CARPET,JSON.stringify(after))}catch(e){alert('Carpet cache could not be saved. No cloud record was changed.');return false}
      const a=new Map(),b=new Map();(Array.isArray(before)?before:[]).forEach(r=>{const id=identity(r);if(id)a.set(id,r)});after.forEach(r=>{const id=identity(r);if(id)b.set(id,r)});
      for(const [id,row] of b){const old=a.get(id);if(!old||!same(old,row))enqueue(id,'upsert',row)}
      for(const [id,row] of a){if(!b.has(id))enqueue(id,'delete',row)}
      scrubNumericCarpetQueue();
      setTimeout(()=>window.runluCloudMasterSync?.({silent:true}),700);return true;
    };
    // These compatibility flags stop Build072's generic/cloud carpet installers from
    // wrapping this function again and reintroducing numeric local ids as cloud ids.
    wrapped.__build072=true;
    wrapped.__build072CarpetRoll=true;
    wrapped.__build124SharedRollIdentity=true;
    wrapped.__build128CarpetIdentityAuthority=true;
    wrapped.__original=delegate;
    window.save=wrapped;
    document.documentElement.setAttribute('data-runlu-carpet-cloud-identity-authority',BUILD);
    scrubNumericCarpetQueue();
    return true;
  }

  install();let tries=0;const timer=setInterval(()=>{if(install()||++tries>140)clearInterval(timer)},100);
  window.addEventListener('pageshow',()=>setTimeout(install,30));
  window.RUNLUCarpetCloudIdentityBuild128={version:BUILD,identity,scrubNumericCarpetQueue,install};
})();
