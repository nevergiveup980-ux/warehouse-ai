// RUNLU Build072 device-adoption safety net.
// Snapshot this device BEFORE the first Cloud Master pull, then after Cloud Master loads,
// re-submit only records that are missing in cloud or genuinely newer than the cloud copy.
(() => {
  if(window.__RUNLU_BUILD072_ADOPTION__)return;
  window.__RUNLU_BUILD072_ADOPTION__=true;
  const SNAP='runlu_build072_precloud_device_snapshot_v680';
  const DONE='runlu_build072_device_adoption_done_v680';
  const AUDIT='runlu_build072_device_adoption_audit_v680';
  const INV='runlu_inventory_records_v21',PM='runlu_product_master_v21',CARPET='runlu_carpet_inventory_v52';
  const KEYS=[
    'runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20','runlu_receiving_v50','runlu_tasks_v50',
    'runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52','runlu_cutting_log_v52',
    'runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55','runlu_settings_v20'
  ];
  const parse=s=>{try{return JSON.parse(s)}catch{return null}},read=k=>parse(localStorage.getItem(k)||'null'),write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const text=v=>String(v??'').trim(),norm=v=>text(v).toUpperCase().replace(/\s+/g,' ').trim();
  const parseMs=v=>{const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0};
  const rowMs=r=>Math.max(parseMs(r?.lastUpdatedAt),parseMs(r?.updatedAt),parseMs(r?.updated),parseMs(r?.completedAt),parseMs(r?.receivedAt),parseMs(r?.createdAt),parseMs(r?.created),parseMs(r?.date));
  const rid=(k,r)=>k===CARPET?norm(r?.roll):k===INV?text(r?.inventoryId||r?.id||r?.cloudRecordId):text(r?.id||r?.cloudRecordId||r?.operationId||r?.roll);
  const incompatible=(a,b)=>kval(a,'name')&&kval(b,'name')&&kval(a,'name')!==kval(b,'name')||kval(a,'sku')&&kval(b,'sku')&&kval(a,'sku')!==kval(b,'sku')||kval(a,'color')&&kval(b,'color')&&kval(a,'color')!==kval(b,'color');
  function kval(x,k){return norm(x?.[k])}
  function protectedRepair(r){return !!(r?.identityRestoredAt||r?.identityRepairedAt||r?.lifecycleCorrectedAt||r?.identityRepair)}

  if(!localStorage.getItem(DONE)&&!localStorage.getItem(SNAP)){
    const snap={at:new Date().toISOString(),datasets:{}};
    for(const k of KEYS){const v=read(k);if(v!==null)snap.datasets[k]=v}
    write(SNAP,snap);
  }

  async function adopt(){
    if(localStorage.getItem(DONE))return;
    const snap=read(SNAP);if(!snap?.datasets)return;
    if(typeof window.save!=='function'||!window.save.__build072||typeof window.runluCloudMasterSync!=='function')return;
    const audit=[];let changed=0;
    for(const k of KEYS){
      const old=snap.datasets[k],cur=read(k);if(old==null)continue;
      if(k==='runlu_settings_v20')continue;
      if(!Array.isArray(old)||!Array.isArray(cur))continue;
      const map=new Map();cur.forEach(r=>{const id=rid(k,r);if(id)map.set(id,r)});let touched=false;
      for(const r of old){
        const id=rid(k,r);if(!id)continue;const now=map.get(id);
        if(!now){map.set(id,r);touched=true;audit.push({dataset:k,id,action:'submitted-device-only'});continue}
        if(protectedRepair(now)){audit.push({dataset:k,id,action:'kept-cloud-repair'});continue}
        if(k===PM&&incompatible(r,now)){audit.push({dataset:k,id,action:'kept-cloud-product-identity',device:[r.name,r.color,r.sku].filter(Boolean).join(' · '),cloud:[now.name,now.color,now.sku].filter(Boolean).join(' · ')});continue}
        if(rowMs(r)>rowMs(now)+1000&&JSON.stringify(r)!==JSON.stringify(now)){
          map.set(id,r);touched=true;audit.push({dataset:k,id,action:'submitted-newer-device-record'});
        }
      }
      if(touched){changed++;window.save(k,[...map.values()])}
    }
    write(AUDIT,{at:new Date().toISOString(),changedDatasets:changed,audit});
    localStorage.setItem(DONE,new Date().toISOString());
    try{await window.runluCloudMasterSync({silent:true})}catch{}
  }

  function boot(){let n=0;const t=setInterval(async()=>{n++;const last=localStorage.getItem('runlu_cloud_master_last_sync_v680');if(last){clearInterval(t);await adopt()}else if(n>80)clearInterval(t)},250)}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
