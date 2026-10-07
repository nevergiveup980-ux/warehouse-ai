// RUNLU Warehouse OS V8 Build133 · Canonical Product Identity Recovery.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD133_PRODUCT_IDENTITY_RECOVERY__) return;
  window.__RUNLU_BUILD133_PRODUCT_IDENTITY_RECOVERY__ = true;

  const API='https://ekrnknlawekeoszzkamd.supabase.co';
  const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const PM='runlu_product_master_v21';
  const DEVICE='v8-build133-product-identity-recovery';
  const PRODUCTS=[
    {id:'2e121f61-d462-49ae-9f49-640078fbc411',name:'Cloud 9 Spill Blocker',sku:'48075-25-D',category:'Spill Blocker',coverageUnit:'Roll',lifecycleStatus:'ACTIVE'},
    {id:'028ddb01-52af-44d3-bd7a-9c8957f39665',name:'Heather Choice',sku:'HEATHER-CHOICE',color:'Green',category:'Underlay',coverageUnit:'Roll',lifecycleStatus:'ACTIVE'}
  ];
  let busy=false,done=false;

  function read(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}}
  async function session(){
    if(typeof window.cloudEnsureSession==='function') return await window.cloudEnsureSession();
    return read('runlu_cloud_session_v54');
  }
  async function getExisting(s,id){
    const q='/rest/v1/warehouse_records?select=record_id,deleted_at,version&dataset_key=eq.'+encodeURIComponent(PM)+'&record_id=eq.'+encodeURIComponent(id)+'&limit=1';
    const r=await fetch(API+q,{cache:'no-store',headers:{apikey:KEY,Authorization:'Bearer '+s.access_token}});
    if(!r.ok) throw new Error('Product identity preflight failed ('+r.status+')');
    const body=await r.json(); return Array.isArray(body)&&body.length?body[0]:null;
  }
  async function restore(s,p){
    const r=await fetch(API+'/rest/v1/rpc/warehouse_apply_mutation',{
      method:'POST',
      headers:{apikey:KEY,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({p_dataset_key:PM,p_record_id:p.id,p_payload:p,p_base_version:0,p_delete:false,p_device_id:DEVICE})
    });
    let body=null;try{body=await r.json()}catch{}
    if(!r.ok) throw new Error(body?.message||('Product identity restore failed ('+r.status+')'));
    if(body?.status!=='ok') throw new Error('Product identity restore returned '+String(body?.status||'unknown'));
    return body;
  }
  async function run(){
    if(busy||done)return; busy=true;
    try{
      const s=await session(); if(!s?.access_token)return;
      let changed=0;
      for(const p of PRODUCTS){
        const existing=await getExisting(s,p.id);
        if(existing&&!existing.deleted_at)continue;
        if(existing&&existing.deleted_at)throw new Error('Canonical Product Master exists as deleted; automatic resurrection blocked: '+p.id);
        await restore(s,p); changed++;
      }
      done=true;
      document.documentElement.setAttribute('data-runlu-build133','complete');
      try{if(window.runluBuild112ProductLinkRecovery?.recover)await window.runluBuild112ProductLinkRecovery.recover('v8-build133')}catch(e){console.warn('[Build133] Build112 follow-up isolated',e)}
      if(changed)console.info('[V8 Build133] canonical Product Master identities restored:',changed);
    }catch(e){
      document.documentElement.setAttribute('data-runlu-build133','paused');
      console.warn('[V8 Build133] Product identity recovery paused',e);
    }finally{busy=false}
  }
  window.runluBuild133ProductIdentityRecovery={run,products:PRODUCTS.map(x=>x.id)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(run,1600),{once:true});else setTimeout(run,1600);
  window.addEventListener('focus',()=>setTimeout(run,300));
  window.addEventListener('pageshow',()=>setTimeout(run,450));
})();