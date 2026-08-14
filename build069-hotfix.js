// RUNLU Warehouse AI V6.6.8 Build069 — Safe Merge Both Sides
(() => {
  if (window.__RUNLU_BUILD069__) return;
  window.__RUNLU_BUILD069__ = true;

  const VERSION='6.6.8', BUILD='069';
  const AUDIT_KEY='runlu_build069_safe_merge_audit';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,'');
  const parseMs=v=>{const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0};
  const rowMs=r=>Math.max(
    parseMs(r?.lastUpdatedAt),parseMs(r?.updatedAt),parseMs(r?.updated),parseMs(r?.completedAt),
    parseMs(r?.receivedAt),parseMs(r?.pickedUpAt),parseMs(r?.transferredAt),parseMs(r?.createdAt),parseMs(r?.created)
  );
  const readLocal=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
  const isBlank=v=>v===''||v===null||v===undefined;

  function datasetKeyOf(dataset,row,index){
    if(!row||typeof row!=='object')return 'IDX:'+index;
    const PM='runlu_product_master_v21', INV='runlu_inventory_records_v21', CARPET='runlu_carpet_inventory_v52';
    if(dataset===PM)return 'PRODUCT:'+text(row.id||row.sku||`${row.name}|${row.color}|${index}`);
    if(dataset===INV)return 'INVENTORY:'+text(row.inventoryId||row.id||`${row.masterId}|${row.location}|${row.poNumber}|${index}`);
    if(dataset===CARPET)return 'ROLL:'+norm(row.roll||row.sourceRoll||row.id||index);
    if(text(row.id))return 'ID:'+text(row.id);
    if(text(row.operationId))return 'OP:'+text(row.operationId)+':'+text(row.roll||row.type||index);
    if(text(row.inventoryId))return 'INV:'+text(row.inventoryId);
    return 'FALLBACK:'+[
      row.poNumber||row.po,row.masterId,row.productId,row.roll,row.collection,row.colour||row.color,row.location,row.date,row.type,index
    ].map(x=>norm(x)).join('|');
  }

  function overlayRows(a,b){
    const am=rowMs(a), bm=rowMs(b), newer=bm>am?b:a, older=newer===a?b:a;
    const out={...(older||{})};
    for(const [k,v] of Object.entries(newer||{})){
      if(!isBlank(v))out[k]=v;
      else if(!(k in out))out[k]=v;
    }
    return out;
  }

  function mergeArrayDataset(dataset,localRows,cloudRows){
    const local=Array.isArray(localRows)?localRows:[], cloud=Array.isArray(cloudRows)?cloudRows:[];
    const map=new Map(), origin=new Map();
    let deviceOnly=0,cloudOnly=0,reconciled=0;
    local.forEach((r,i)=>{const k=datasetKeyOf(dataset,r,i);map.set(k,{...r});origin.set(k,'device')});
    cloud.forEach((r,i)=>{
      const k=datasetKeyOf(dataset,r,i);
      if(!map.has(k)){map.set(k,{...r});origin.set(k,'cloud');cloudOnly++;return}
      const cur=map.get(k), merged=overlayRows(cur,r);
      if(JSON.stringify(merged)!==JSON.stringify(cur))reconciled++;
      map.set(k,merged);origin.set(k,'both');
    });
    for(const o of origin.values())if(o==='device')deviceOnly++;
    return {merged:[...map.values()],deviceOnly,cloudOnly,reconciled,deviceCount:local.length,cloudCount:cloud.length};
  }

  function mergeableKeys(){
    return new Set([
      'runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20','runlu_receiving_v50','runlu_tasks_v50',
      'runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52','runlu_cutting_log_v52',
      'runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55'
    ]);
  }

  async function safeMergeBothSides(keys=null,{silent=false}={}){
    const ensure=window.cloudEnsureSession, fetchRows=window.cloudFetchRows, hydrate=window.cloudHydratePayload, put=window.cloudPutDatasetInitial;
    if(typeof ensure!=='function'||typeof fetchRows!=='function'||typeof put!=='function')throw new Error('Cloud merge functions are not ready yet.');
    const session=await ensure();if(!session)throw new Error('Cloud sign-in required.');
    const rows=await fetchRows();
    const byKey=new Map((rows||[]).map(r=>[r.dataset_key,r]));
    const conflicts=typeof window.cloudConflictKeys==='function'?window.cloudConflictKeys():[];
    const requested=(keys||conflicts).filter(k=>mergeableKeys().has(k));
    const repaired=[],skipped=[];

    for(const key of requested){
      const remoteRow=byKey.get(key);
      if(!remoteRow){skipped.push({key,reason:'No cloud copy'});continue}
      const local=readLocal(key);
      const remote=typeof hydrate==='function'?await hydrate(remoteRow.payload,session):remoteRow.payload;
      if(!Array.isArray(local)||!Array.isArray(remote)){skipped.push({key,reason:'Not an array dataset'});continue}
      const result=mergeArrayDataset(key,local,remote);

      const prior=window.cloudApplying;
      try{window.cloudApplying=true;localStorage.setItem(key,JSON.stringify(result.merged))}
      finally{window.cloudApplying=prior}
      await put(key,result.merged,session);

      try{
        if(typeof window.clearCloudDirty==='function')window.clearCloudDirty(key);
        if(typeof window.clearCloudConflict==='function')window.clearCloudConflict(key);
      }catch{}
      repaired.push({key,...result,mergedCount:result.merged.length});
    }

    try{
      const fresh=await fetchRows();
      if(typeof window.cloudRememberSummary==='function')window.cloudRememberSummary(fresh);
      if(typeof window.rememberCloudDatasetVersions==='function')window.rememberCloudDatasetVersions(fresh,false,repaired.map(x=>x.key));
      localStorage.setItem(AUDIT_KEY,JSON.stringify({at:new Date().toISOString(),repaired,skipped}));
    }catch{}

    try{
      window.renderProducts?.();window.renderInventory?.();window.renderOperations?.();window.renderCarpetInventory?.();window.renderDashboard?.();window.renderCloudStatus?.();
    }catch(e){console.warn('[Build069] post-merge render',e)}

    if(!silent){
      const lines=repaired.map(r=>`${label(r.key)}: device ${r.deviceCount} + cloud ${r.cloudCount} → merged ${r.mergedCount} (device-only ${r.deviceOnly}, cloud-only ${r.cloudOnly})`);
      alert(`Safe Merge Both Sides completed.\n\n${lines.join('\n')}\n\nRecords present on either side were preserved. No whole-dataset device-vs-cloud choice was used.`);
    }
    return {repaired,skipped};
  }
  window.runluSafeMergeBothSides=safeMergeBothSides;

  function label(k){try{return typeof window.cloudDatasetLabel==='function'?window.cloudDatasetLabel(k):k}catch{return k}}
  function injectButton(){
    const status=document.getElementById('cloudStatus');if(!status)return false;
    const row=status.closest('.settingRow'),actions=row?.querySelector('.actions');if(!actions)return false;
    if(document.getElementById('build069SafeMergeBtn'))return true;
    const b=document.createElement('button');b.id='build069SafeMergeBtn';b.type='button';b.className='green';
    b.textContent='🔀 Safe Merge Both Sides';b.title='Merge phone/device and cloud record-by-record. Records unique to either side are preserved.';
    b.onclick=async()=>{b.disabled=true;const old=b.textContent;b.textContent='Merging both sides…';try{await safeMergeBothSides(null,{silent:false})}catch(e){alert('Safe merge stopped: '+(e.message||e))}finally{b.disabled=false;b.textContent=old}};
    actions.insertBefore(b,actions.firstChild);
    return true;
  }

  function explainConflictUI(){
    const status=document.getElementById('cloudStatus');if(!status)return;
    let n=document.getElementById('build069MergeNotice');
    if(!n){n=document.createElement('div');n.id='build069MergeNotice';n.style.cssText='margin:12px 0;padding:12px 14px;border:1px solid #b9d6ff;background:#eef6ff;border-radius:12px;color:#173b68;font-weight:700;line-height:1.45';status.insertAdjacentElement('afterend',n)}
    n.innerHTML='🔀 <b>Build069 Safe Merge:</b> when phone/device and cloud both changed, use <b>Safe Merge Both Sides</b>. Unique records from both sides are kept; matching records are reconciled by record identity and latest timestamp. The old Keep Cloud / Keep This Device buttons remain only as emergency/manual overrides.';
  }

  function wrapSync(){
    if(typeof window.cloudSyncNow!=='function'||window.cloudSyncNow.__build069)return false;
    const original=window.cloudSyncNow;
    const wrapped=async function(...args){
      try{
        const conflicts=typeof window.cloudConflictKeys==='function'?window.cloudConflictKeys():[];
        const mergeTargets=conflicts.filter(k=>mergeableKeys().has(k));
        if(mergeTargets.length)await safeMergeBothSides(mergeTargets,{silent:true});
      }catch(e){console.warn('[Build069] safe pre-sync merge',e)}
      return original.apply(this,args);
    };
    wrapped.__build069=true;wrapped.__original=original;window.cloudSyncNow=wrapped;return true;
  }

  function showVersion(){const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;document.documentElement.setAttribute('data-runlu-build',BUILD)}
  function install(){showVersion();injectButton();explainConflictUI();wrapSync()}
  function boot(){install();let tries=0;const t=setInterval(()=>{tries++;install();if(tries>120)clearInterval(t)},100);}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
