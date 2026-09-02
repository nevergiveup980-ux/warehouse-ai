// RUNLU Warehouse OS V6.12.19 Build112 · Product Link Recovery Guard.
// Restores missing Product Master rows from the authoritative record-level cloud
// without changing inventory quantities, locations, POs, lifecycle fields or history.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD112_PRODUCT_LINK_RECOVERY__) return;
  window.__RUNLU_BUILD112_PRODUCT_LINK_RECOVERY__ = true;

  const VERSION='6.12.19', BUILD='112';
  const API='https://ekrnknlawekeoszzkamd.supabase.co';
  const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const PM='runlu_product_master_v21';
  const INV='runlu_inventory_records_v21';
  const BACKUP='runlu_build112_pre_product_link_recovery';
  const AUDIT='runlu_build112_product_link_recovery_audit';
  const NOTICE='runlu_build112_recovery_notice_seen';
  let busy=false;
  let lastAttempt=0;

  const text=v=>String(v??'').trim();
  const clone=v=>JSON.parse(JSON.stringify(v));
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const rows=k=>{const value=read(k);return Array.isArray(value)?value:[]};
  const productId=p=>text(p?.id||p?.cloudRecordId);
  const inventoryProductId=r=>text(r?.masterId);

  function orphanInventory(products,inventory){
    const known=new Set(products.map(productId).filter(Boolean));
    return inventory.filter(r=>inventoryProductId(r)&&!known.has(inventoryProductId(r)));
  }

  function planRecovery(localProducts,localInventory,cloudRows){
    const active=(Array.isArray(cloudRows)?cloudRows:[]).filter(r=>!r?.deleted_at);
    const cloudProducts=active.filter(r=>r.dataset_key===PM).map(r=>{
      const payload=clone(r.payload||{}),id=text(r.record_id||payload.id);
      if(id&&!text(payload.id))payload.id=id;
      return payload;
    }).filter(p=>productId(p));
    const cloudInventory=active.filter(r=>r.dataset_key===INV).map(r=>clone(r.payload||{}));
    const cloudById=new Map(cloudProducts.map(p=>[productId(p),p]));
    const cloudKnown=new Set(cloudById.keys());
    const cloudOrphans=cloudInventory.filter(r=>inventoryProductId(r)&&!cloudKnown.has(inventoryProductId(r)));
    const localOrphans=orphanInventory(localProducts,localInventory);
    const missingIds=[...new Set(localOrphans.map(inventoryProductId).filter(Boolean))];
    const localIds=new Set(localProducts.map(productId).filter(Boolean));
    // Cloud Master is authoritative once both cloud datasets pass the link check.
    // Restore the complete missing catalog, including products that currently have
    // no stock row, so the device cannot remain on a partial Product Master.
    const recovered=cloudProducts.filter(product=>!localIds.has(productId(product)));
    const recoveredIds=new Set(recovered.map(productId));
    const unresolvedIds=missingIds.filter(id=>!cloudById.has(id));
    const merged=localProducts.map(clone);
    for(const product of recovered)if(!localIds.has(productId(product))){merged.push(clone(product));localIds.add(productId(product))}
    merged.sort((a,b)=>text(a.name).localeCompare(text(b.name))||text(a.color).localeCompare(text(b.color)));
    return {cloudProducts,cloudInventory,cloudOrphans,localOrphans,recovered,recoveredIds:[...recoveredIds],unresolvedIds,merged};
  }

  async function session(){
    if(typeof window.cloudEnsureSession==='function')return await window.cloudEnsureSession();
    return read('runlu_cloud_session_v54');
  }

  async function fetchCloudLinkRows(s){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const query='/rest/v1/warehouse_records?select=dataset_key,record_id,payload,version,deleted_at,updated_at&dataset_key=in.('+PM+','+INV+')&order=dataset_key.asc,record_id.asc';
    try{
      const response=await fetch(API+query,{method:'GET',cache:'no-store',signal:controller.signal,headers:{apikey:KEY,Authorization:'Bearer '+s.access_token,'Cache-Control':'no-cache','Pragma':'no-cache'}});
      let body=null;try{body=await response.json()}catch{}
      if(!response.ok)throw new Error(body?.message||body?.error||('Product Link cloud check failed ('+response.status+')'));
      if(!Array.isArray(body))throw new Error('Product Link cloud check returned an invalid record set.');
      return body;
    }finally{clearTimeout(timer)}
  }

  function saveRecoveryPoint(products,inventory,missingIds){
    try{if(typeof window.createLocalSnapshot==='function')window.createLocalSnapshot(false)}catch(e){console.warn('[Build112] standard snapshot unavailable',e)}
    try{localStorage.setItem(BACKUP,JSON.stringify({at:new Date().toISOString(),reason:'Before Product Link Recovery',missingProductIds:missingIds,productMaster:products,inventory}))}
    catch(e){console.warn('[Build112] compact recovery point unavailable',e)}
  }

  function rerender(){
    for(const name of ['renderProducts','renderInventory','renderDashboard','renderMap','refreshMemory']){
      try{if(typeof window[name]==='function')window[name]()}catch(e){console.warn('[Build112] render isolated',name,e)}
    }
    renderNotice();
  }

  function renderNotice(){
    const page=document.getElementById('inventory'),list=document.getElementById('inventoryList');
    if(!page||!list)return;
    let box=document.getElementById('build112ProductLinkNotice');
    const products=rows(PM),inventory=rows(INV),orphans=orphanInventory(products,inventory),audit=read(AUDIT)||{};
    if(!box){box=document.createElement('div');box.id='build112ProductLinkNotice';list.insertAdjacentElement('beforebegin',box)}
    if(orphans.length){
      box.style.cssText='margin:0 0 12px;padding:12px;border:1px solid #e6b85c;background:#fff8e8;border-radius:14px;color:#6b4700;line-height:1.45';
      box.innerHTML='<b>Product link protection active</b><br>'+orphans.length+' inventory record(s) still need an exact Product Master link. Quantities remain preserved while Cloud Master is checked.';
    }else if(audit.status==='recovered'){
      box.style.cssText='margin:0 0 12px;padding:12px;border:1px solid #9fd3b1;background:#f2fbf5;border-radius:14px;color:#176b40;line-height:1.45';
      box.innerHTML='<b>Product links recovered</b><br>'+Number(audit.recoveredProducts||0)+' missing product record(s) restored from Cloud Master. Inventory quantities, locations and history were unchanged.';
    }else box.remove();
  }

  async function recover(reason='automatic'){
    if(busy)return {status:'busy'};
    const localProducts=rows(PM),localInventory=rows(INV),beforeOrphans=orphanInventory(localProducts,localInventory);
    if(!beforeOrphans.length){renderNotice();return {status:'clean',orphans:0}}
    const now=Date.now();if(reason!=='manual'&&now-lastAttempt<5000)return {status:'cooldown',orphans:beforeOrphans.length};lastAttempt=now;
    busy=true;
    try{
      const s=await session();if(!s?.access_token)throw new Error('Cloud sign-in is required before Product Links can be recovered.');
      const cloudRows=await fetchCloudLinkRows(s),plan=planRecovery(localProducts,localInventory,cloudRows);
      if(!plan.cloudProducts.length)throw new Error('Cloud Product Master is empty. No local data was changed.');
      if(plan.cloudOrphans.length)throw new Error('Cloud integrity check found orphan inventory. No local data was changed.');
      if(plan.unresolvedIds.length)throw new Error('Cloud Master does not contain every missing Product ID. No local data was changed.');
      if(!plan.recovered.length)throw new Error('Cloud Master could not explain the missing Product IDs. No local data was changed.');

      const inventoryBefore=JSON.stringify(localInventory);
      saveRecoveryPoint(localProducts,localInventory,[...new Set(beforeOrphans.map(inventoryProductId))]);
      localStorage.setItem(PM,JSON.stringify(plan.merged));
      const inventoryAfter=JSON.stringify(rows(INV));
      if(inventoryAfter!==inventoryBefore){
        localStorage.setItem(PM,JSON.stringify(localProducts));
        throw new Error('Inventory immutability verification failed. Product Master recovery was rolled back.');
      }

      const remaining=orphanInventory(rows(PM),rows(INV));
      const recoveredAt=new Date().toISOString();
      localStorage.setItem(AUDIT,JSON.stringify({status:'recovered',at:recoveredAt,reason,recoveredProducts:plan.recovered.length,recoveredProductIds:plan.recoveredIds,orphansBefore:beforeOrphans.length,orphansAfter:remaining.length,unresolvedProductIds:plan.unresolvedIds,inventoryRecords:localInventory.length,inventoryVerifiedUnchanged:true}));
      document.documentElement.setAttribute('data-runlu-product-link-recovery',remaining.length?'partial':'complete');
      rerender();
      if(localStorage.getItem(NOTICE)!==recoveredAt){
        localStorage.setItem(NOTICE,recoveredAt);
        alert('Product links recovered from Cloud Master.\n\nRestored product records: '+plan.recovered.length+'\nInventory records checked: '+localInventory.length+'\nInventory quantities changed: 0\nRemaining unknown links: '+remaining.length);
      }
      return {status:remaining.length?'partial':'recovered',recovered:plan.recovered.length,remaining:remaining.length};
    }catch(e){
      localStorage.setItem(AUDIT,JSON.stringify({status:'paused',at:new Date().toISOString(),reason,error:e.message||String(e),orphansBefore:beforeOrphans.length}));
      document.documentElement.setAttribute('data-runlu-product-link-recovery','paused');
      renderNotice();
      console.warn('[Build112] Product Link Recovery paused',e);
      return {status:'paused',error:e.message||String(e),orphans:beforeOrphans.length};
    }finally{busy=false}
  }

  function install(){
    document.documentElement.setAttribute('data-runlu-build112','product-link-recovery');
    renderNotice();
  }
  function boot(){
    install();
    [1200,3500,9000].forEach(delay=>setTimeout(()=>recover('boot'),delay));
    setInterval(()=>{install();if(orphanInventory(rows(PM),rows(INV)).length)recover('integrity-watch')},5000);
    window.addEventListener('focus',()=>setTimeout(()=>recover('focus'),250));
    window.addEventListener('pageshow',()=>setTimeout(()=>recover('pageshow'),350));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>recover('visible'),250)});
  }

  window.runluBuild112ProductLinkRecovery={version:VERSION,build:BUILD,orphanInventory,planRecovery,recover};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
