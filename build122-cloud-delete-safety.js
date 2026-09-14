// RUNLU Warehouse OS Build122 · explicit-delete safety shield.
// Prevents array-diff shrinkage from becoming cloud tombstones. Existing unmarked
// queued deletes are neutralized. Only an explicit user delete context may produce
// a cloud delete marker accepted by the server-side warehouse_apply_mutation guard.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD122_DELETE_SAFETY__) return;
  window.__RUNLU_BUILD122_DELETE_SAFETY__ = true;

  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const STRIP_TOTAL='runlu_build122_stripped_delete_total';
  const STRIP_LAST='runlu_build122_stripped_delete_last';
  const ARRAY_KEYS=new Set([
    'runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20','runlu_receiving_v50','runlu_tasks_v50',
    'runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52','runlu_cutting_log_v52',
    'runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55'
  ]);
  const PM='runlu_product_master_v21', INV='runlu_inventory_records_v21', LOG='runlu_operations_log_v52', CARPET='runlu_carpet_inventory_v52';
  const explicit=new Set();
  let installedSave=false;

  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const key=(dataset,id)=>dataset+'::'+text(id);

  function stableId(dataset,row){
    if(!row||typeof row!=='object')return '';
    if(dataset===INV)return text(row.inventoryId||row.id||row.cloudRecordId);
    return text(row.id||row.cloudRecordId||row.roll||row.operationId);
  }
  function mapRows(dataset,rows){
    const m=new Map();
    for(const row of Array.isArray(rows)?rows:[]){const id=stableId(dataset,row);if(id)m.set(id,row)}
    return m;
  }
  function queue(){const q=read(QUEUE);return Array.isArray(q)?q:[]}
  function writeQueue(q){localStorage.setItem(QUEUE,JSON.stringify(Array.isArray(q)?q:[]))}

  function recordStrip(n,reason){
    if(!n)return;
    const total=Number(localStorage.getItem(STRIP_TOTAL)||0)+n;
    localStorage.setItem(STRIP_TOTAL,String(total));
    localStorage.setItem(STRIP_LAST,JSON.stringify({at:new Date().toISOString(),count:n,reason,total}));
    console.warn(`[Build122] neutralized ${n} unsafe cloud delete${n===1?'':'s'} (${reason}).`);
    renderShield();
  }

  function sanitizeQueue(reason='guard-pass'){
    const q=queue();let removed=0;
    const safe=q.filter(m=>{
      if(m?.op!=='delete')return true;
      const intent=m?.deleteIntent||m?.payload?._runluDeleteIntent||'';
      if(intent==='explicit-user-delete')return true;
      removed++;return false;
    });
    if(removed){writeQueue(safe);recordStrip(removed,reason)}
    return removed;
  }

  function authorizeQueuedDelete(dataset,id,row){
    const q=queue();let changed=false;
    for(const m of q){
      if(m?.op!=='delete'||m.datasetKey!==dataset||text(m.recordId)!==text(id))continue;
      m.deleteIntent='explicit-user-delete';
      m.payload={...(m.payload&&typeof m.payload==='object'?m.payload:clone(row)||{}),_runluDeleteIntent:'explicit-user-delete'};
      changed=true;
    }
    if(changed)writeQueue(q);
    return changed;
  }

  function withExplicit(specs,fn){
    const ks=[];
    for(const s of specs||[]){if(!s?.dataset||!text(s?.id))continue;const k=key(s.dataset,s.id);explicit.add(k);ks.push(k)}
    const clear=()=>ks.forEach(k=>explicit.delete(k));
    try{
      const out=fn();
      if(out&&typeof out.finally==='function')return out.finally(clear);
      clear();return out;
    }catch(e){clear();throw e}
  }

  function protectSave(){
    const current=window.save;
    if(typeof current!=='function'||current.__build122)return false;
    const wrapped=function(dataset,value){
      if(!ARRAY_KEYS.has(dataset)||!Array.isArray(value))return current.apply(this,arguments);
      const before=read(dataset);
      if(!Array.isArray(before))return current.apply(this,arguments);

      const a=mapRows(dataset,before),b=mapRows(dataset,value),removed=[];
      for(const [id,row] of a)if(!b.has(id))removed.push({id,row,allowed:explicit.has(key(dataset,id))});

      let safeValue=value;
      const blocked=removed.filter(x=>!x.allowed);
      if(blocked.length){
        safeValue=value.slice();
        const have=mapRows(dataset,safeValue);
        for(const x of blocked)if(!have.has(x.id))safeValue.push(clone(x.row));
        console.warn(`[Build122] preserved ${blocked.length} omitted ${dataset} record${blocked.length===1?'':'s'}; omission is not delete intent.`);
      }

      const result=current.call(this,dataset,safeValue);
      for(const x of removed.filter(x=>x.allowed))authorizeQueuedDelete(dataset,x.id,x.row);
      sanitizeQueue('post-save');
      return result;
    };
    wrapped.__build122=true;wrapped.__original=current;window.save=wrapped;installedSave=true;return true;
  }

  function inventoryRow(identity){
    const rows=read(INV);if(!Array.isArray(rows))return null;
    return rows.find(r=>text(r.inventoryId)===text(identity)||text(r.id)===text(identity)||stableId(INV,r)===text(identity))||null;
  }
  function productDeleteSpecs(id){
    const specs=[{dataset:PM,id:text(id)}],rows=read(INV);
    if(Array.isArray(rows))for(const r of rows)if(text(r.masterId)===text(id)){const rid=stableId(INV,r);if(rid)specs.push({dataset:INV,id:rid})}
    return specs;
  }
  function carpetDeleteSpecs(){
    const rows=read(CARPET);if(!Array.isArray(rows))return [];
    const roll=text(document.getElementById('ceRoll')?.value).toUpperCase();
    const row=rows.find(r=>text(r.roll).toUpperCase()===roll)||null,id=row?stableId(CARPET,row):'';
    return id?[{dataset:CARPET,id}]:[];
  }

  function wrapExplicit(name,resolver){
    const current=window[name];if(typeof current!=='function'||current.__build122Explicit)return false;
    const wrapped=function(...args){return withExplicit(resolver(...args)||[],()=>current.apply(this,args))};
    wrapped.__build122Explicit=true;wrapped.__original=current;window[name]=wrapped;return true;
  }

  function installExplicitDeletePaths(){
    // Operations are replaced outright so Build119's direct REST tombstone path can no longer bypass the RPC guard.
    const op=window.deleteOperation;
    if(typeof op==='function'&&!op.__build122Safe){
      const safe=function(id){
        const rows=typeof window.operationRecords==='function'?window.operationRecords():[];
        const x=(rows||[]).find(r=>Number(r.id)===Number(id));if(!x)return;
        if(x.impactApplied){alert('This linked operation cannot be deleted because it already changed inventory. Use a correction or reversal record instead.');return}
        const label=[x.type,x.po?`PO ${x.po}`:'',x.roll?`Roll ${x.roll}`:'',x.collection||x.product||''].filter(Boolean).join(' · ');
        if(!confirm('Delete this Warehouse work-history record?\n\n'+label+'\n\nThis removes the record from Warehouse Cloud on every device.'))return;
        if(prompt('FINAL CONFIRMATION\n\nType DELETE to permanently remove this work-history record from Warehouse Cloud.')!=='DELETE'){alert('Delete cancelled. The work-history record was kept.');return}
        withExplicit([{dataset:LOG,id:text(x.id)}],()=>window.save(LOG,(read(LOG)||[]).filter(r=>Number(r.id)!==Number(x.id))));
        try{window.renderOperationsDay?.();window.renderOperationsDays?.();window.renderDashboard?.()}catch(_){}
      };
      safe.__build122Safe=true;safe.__original=op;window.deleteOperation=safe;
    }

    wrapExplicit('removeInventory',id=>{const r=inventoryRow(id),rid=r?stableId(INV,r):'';return rid?[{dataset:INV,id:rid}]:[]});
    wrapExplicit('deleteInventoryRecordSafely',identity=>{const r=inventoryRow(identity),rid=r?stableId(INV,r):'';return rid?[{dataset:INV,id:rid}]:[]});
    wrapExplicit('deleteUnusedInventoryRecord',identity=>{const r=inventoryRow(identity),rid=r?stableId(INV,r):'';return rid?[{dataset:INV,id:rid}]:[]});
    wrapExplicit('removeItem',id=>productDeleteSpecs(id));
    wrapExplicit('deleteCarpetRecord',()=>carpetDeleteSpecs());
  }

  function renderShield(){
    const host=document.getElementById('build072CloudMasterPanel')||document.getElementById('cloudStatus');if(!host)return;
    let el=document.getElementById('build122DeleteShield');
    if(!el){el=document.createElement('div');el.id='build122DeleteShield';host.insertAdjacentElement('afterend',el)}
    const total=Number(localStorage.getItem(STRIP_TOTAL)||0),pending=queue().filter(m=>m?.op==='delete'&&(m?.deleteIntent||m?.payload?._runluDeleteIntent)!=='explicit-user-delete').length;
    el.style.cssText='margin:8px 0 14px;padding:10px 12px;border:1px solid #9fd3b1;background:#f2fbf5;border-radius:12px;color:#176b40;font-size:12px;font-weight:800';
    el.textContent=`🛡 Delete Safety Shield ACTIVE · unsafe queued deletes: ${pending}${total?` · neutralized: ${total}`:''}`;
  }

  function install(){
    protectSave();installExplicitDeletePaths();sanitizeQueue('startup');renderShield();
  }
  function boot(){
    install();
    let n=0;const t=setInterval(()=>{install();sanitizeQueue('continuous-guard');if(++n>1200)clearInterval(t)},250);
    window.addEventListener('pageshow',install);window.addEventListener('focus',install);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')install()});
  }

  window.RUNLUDeleteSafetyBuild122={sanitizeQueue,stableId,version:'122',get neutralized(){return Number(localStorage.getItem(STRIP_TOTAL)||0)}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
