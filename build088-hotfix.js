// RUNLU Warehouse AI V6.12.2 Build088 — Confirmed Operation Completion
(() => {
  if (window.__RUNLU_BUILD088__) return;
  window.__RUNLU_BUILD088__ = true;

  const VERSION='6.12.2', BUILD='088';
  const OPS='runlu_operations_log_v52';
  const VERIFY_KEYS=[
    OPS,'runlu_inventory_records_v21','runlu_carpet_inventory_v52',
    'runlu_cutting_log_v52','runlu_event_history_v52','runlu_remnants_v55'
  ];
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const LAST_SYNC='runlu_cloud_master_last_sync_v680';
  const LAST_ERROR='runlu_cloud_master_last_error_v680';
  const inFlight=new Set();

  const parse=(raw,fallback)=>{try{const value=JSON.parse(raw);return value??fallback}catch{return fallback}};
  const operations=()=>parse(localStorage.getItem(OPS)||'[]',[]);
  const find=id=>operations().find(row=>String(row?.id)===String(id));
  const pending=row=>row?.status==='Completed'&&row?.impactApplied===true&&row?.cloudConfirmation==='Pending';

  function ensureStyle(){
    if(document.getElementById('build088CloudConfirmationStyle'))return;
    const style=document.createElement('style');
    style.id='build088CloudConfirmationStyle';
    style.textContent=`
      .operationCloudPending{margin-top:10px;padding:11px 12px;border-radius:13px;background:#fff7df;border:1px solid #efd38a;color:#755000;font-weight:850;line-height:1.35}
      .operationCloudPending small{display:block;font-weight:650;margin-top:3px}.operationCloudPending button{margin-top:8px;background:#fff;color:#755000;border:1px solid #d9b85f}
    `;
    document.head.appendChild(style);
  }

  function pendingHtml(id,busy=false){
    return `<div class="operationCloudPending">⏳ Completed on this device · Cloud confirmation pending<small>${busy?'Uploading and checking Supabase…':'Inventory is protected. Retry the cloud confirmation when online.'}</small>${busy?'':`<button type="button" onclick="retryOperationCloudConfirmation('${String(id).replace(/['\\]/g,'')}')">Retry Cloud Confirmation</button>`}</div>`;
  }

  function persistConfirmation(id,state,extra={}){
    const rows=operations(),row=rows.find(item=>String(item?.id)===String(id));
    if(!row)return null;
    row.cloudConfirmation=state;
    Object.assign(row,extra);
    if(typeof window.save==='function')window.save(OPS,rows);
    else localStorage.setItem(OPS,JSON.stringify(rows));
    return row;
  }

  async function flushAndConfirm(id,{announce=true}={}){
    if(inFlight.has(String(id)))return false;
    inFlight.add(String(id));
    try{
      window.renderOperationsDay?.();window.renderDashboard?.();
      if(typeof window.flushAndVerifyDatasets!=='function')throw new Error('Cloud verification service is not ready.');
      await window.flushAndVerifyDatasets(VERIFY_KEYS);
      const verified=find(id);
      if(!verified||verified.status!=='Completed'||verified.impactApplied!==true){
        throw new Error('Supabase did not return the completed operation and its inventory link.');
      }
      persistConfirmation(id,'Confirmed',{cloudConfirmedAt:new Date().toISOString(),cloudConfirmationError:''});
      await window.flushAndVerifyDatasets([OPS]);
      const finalRow=find(id);
      if(!finalRow||finalRow.cloudConfirmation!=='Confirmed')throw new Error('The final cloud confirmation was not returned.');
      if(announce)alert('Completed and verified in the Warehouse Cloud. This record is now locked.');
      return true;
    }catch(error){
      persistConfirmation(id,'Pending',{cloudConfirmationError:String(error?.message||error),cloudConfirmationAttemptedAt:new Date().toISOString()});
      localStorage.setItem(LAST_ERROR,String(error?.message||error));
      if(announce)alert('The work is completed on this device, but cloud confirmation is still pending. Do not complete it again on another device.\n\n'+String(error?.message||error));
      return false;
    }finally{
      inFlight.delete(String(id));
      window.renderOperationsDay?.();window.renderDashboard?.();paintCloudPill();
    }
  }

  function installCompletionGuard(){
    const current=window.setOperationStatus;
    if(typeof current!=='function'||current.__build088)return false;
    const original=current;
    const wrapped=async function(id,status){
      if(status!=='Completed')return original.apply(this,arguments);
      const before=find(id);
      if(pending(before))return flushAndConfirm(id);
      const result=original.apply(this,arguments);
      const completed=find(id);
      if(!completed||completed.status!=='Completed'||completed.impactApplied!==true)return result;
      persistConfirmation(id,'Pending',{cloudConfirmationStartedAt:new Date().toISOString(),cloudConfirmationError:''});
      window.renderOperationsDay?.();window.renderDashboard?.();
      await flushAndConfirm(id);
      return result;
    };
    wrapped.__build088=true;wrapped.__original=original;
    window.setOperationStatus=wrapped;

    const mobile=window.operationMobileActions;
    if(typeof mobile==='function'&&!mobile.__build088){
      const guarded=function(row){
        if(pending(row))return pendingHtml(row.id,inFlight.has(String(row.id)));
        return mobile.apply(this,arguments);
      };
      guarded.__build088=true;guarded.__original=mobile;window.operationMobileActions=guarded;
    }
    return true;
  }

  window.retryOperationCloudConfirmation=id=>flushAndConfirm(id);

  function paintCloudPill(){
    const pill=document.getElementById('headerCloudPill');if(!pill)return;
    const queue=parse(localStorage.getItem(QUEUE)||'[]',[]),conflicts=parse(localStorage.getItem(CONFLICTS)||'[]',[]);
    const pendingOps=operations().filter(pending).length;
    if(conflicts.length){pill.className='cloudPill offline';pill.textContent=`${conflicts.length} conflict${conflicts.length===1?'':'s'}`;return}
    if(queue.length||pendingOps){const count=Math.max(queue.length,pendingOps);pill.className='cloudPill syncing';pill.textContent=`${count} pending`;return}
    const error=localStorage.getItem(LAST_ERROR)||'';
    const last=new Date(localStorage.getItem(LAST_SYNC)||0).getTime();
    if(error&&(!last||Date.now()-last>120000)){pill.className='cloudPill offline';pill.textContent='Cloud issue';return}
    if(last&&Date.now()-last<120000){pill.className='cloudPill online';pill.textContent='Cloud ✓'}
  }

  function boot(){
    ensureStyle();installCompletionGuard();paintCloudPill();
    let attempts=0;const installer=setInterval(()=>{installCompletionGuard();paintCloudPill();if(++attempts>240)clearInterval(installer)},250);
    setInterval(paintCloudPill,1000);
    window.addEventListener('online',()=>{paintCloudPill();operations().filter(pending).forEach(row=>flushAndConfirm(row.id,{announce:false}))});
    window.addEventListener('pageshow',paintCloudPill);
    document.documentElement.setAttribute('data-runlu-completion-confirmation',BUILD);
  }
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
