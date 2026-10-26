/* RUNLU Cloud Master Recovery — DRAFT, NOT LOADED IN PRODUCTION.
 * Host integration must pass the existing cloud functions and DATA_KEYS.
 * No automatic execution. Requires explicit user confirmation.
 */
(function(global){
 'use strict';
 const OUTBOX='runlu_record_sync_outbox_v1';
 const CURSOR='runlu_record_sync_cursor_v1';
 const BOOTSTRAP='runlu_record_sync_bootstrapped_v1';
 const GENERATION='runlu_record_sync_generation_v1';
 const ERROR='runlu_cloud_last_error_v54';
 const LOCK='runlu_cloud_master_recovery_lock_v1';
 function readStorage(keys){
   const snapshot={};
   for(const key of keys)snapshot[key]=localStorage.getItem(key);
   return snapshot;
 }
 function restoreStorage(snapshot){
   for(const [key,value] of Object.entries(snapshot)){
     if(value===null)localStorage.removeItem(key);
     else localStorage.setItem(key,value);
   }
 }
 function downloadBackup(data){
   const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;
   a.download='RUNLU_CLOUD_MASTER_RECOVERY_BACKUP_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
   document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function prepareRecovery(host){
   if(!host||!Array.isArray(host.dataKeys)||!host.dataKeys.length)throw Error('Missing recovery host configuration');
   if(typeof host.fetchSnapshot!=='function'||typeof host.hydrate!=='function')throw Error('Missing cloud snapshot reader');
   if(host.syncBusy())throw Error('Cloud synchronization is running. Wait and retry.');
   if(!host.session())throw Error('Sign in before starting recovery.');
   if(host.protectedInputActive())throw Error('Close all editors before recovery.');
   if(navigator.onLine===false)throw Error('An online connection is required.');
   const raw=localStorage.getItem(OUTBOX);
   if(raw!==null&&!Array.isArray(JSON.parse(raw)))throw Error('Malformed queue: stop and preserve original data.');
   const keys=[...host.dataKeys,OUTBOX,CURSOR,BOOTSTRAP,GENERATION,ERROR];
   const original=readStorage(keys);
   const backup={format:'runlu-cloud-master-recovery-backup-v1',created_at:new Date().toISOString(),origin:location.origin,keys:original};
   // The download must be completed and confirmed by the user before any local changes.
   downloadBackup(backup);
   const cloud=await host.fetchSnapshot();
   if(!cloud||!Array.isArray(cloud.records)||!Number.isFinite(Number(cloud.cursor)))throw Error('Invalid cloud snapshot; local data untouched.');
   const grouped=new Map(host.dataKeys.map(k=>[k,[]]));
   for(const row of cloud.records){
     if(!grouped.has(row.dataset_key))continue;
     if(row.deleted_at)continue;
     const payload=await host.hydrate(row.payload);
     grouped.get(row.dataset_key).push({...payload,_cloudVersion:Number(row.version||0),_cloudChangeSeq:Number(row.change_seq||0),_cloudRecordId:String(row.record_id||'')});
   }
   const next={};
   for(const [key,value] of grouped)next[key]=JSON.stringify(value);
   next[OUTBOX]='[]';
   next[CURSOR]=String(Number(cloud.cursor));
   next[BOOTSTRAP]='1';
   next[GENERATION]=host.generation;
   next[ERROR]=null;
   return {original,next,backup,cloudCount:cloud.records.length,queueCount:raw?JSON.parse(raw).length:0};
 }
 async function recover(host){
   const plan=await prepareRecovery(host);
   const warning='A recovery backup download was started. VERIFY the file is saved and accessible before continuing.\n\nThis device will DISCARD '+plan.queueCount+' pending local operations and replace its synchronized datasets with '+plan.cloudCount+' cloud snapshot records. Other devices are NOT changed.\n\nType CLOUD MASTER to continue:';
   if(prompt(warning)!=='CLOUD MASTER')return {status:'cancelled'};
   if(host.syncBusy()||host.protectedInputActive())throw Error('Sync/editor became active; recovery cancelled.');
   // Prevent writes during the critical section; host must use this lock in sync entry points.
   localStorage.setItem(LOCK,new Date().toISOString());
   host.setSyncBusy(true);
   try{
     // Preflight storage quota before replacing any records.
     for(const [key,value] of Object.entries(plan.next))if(value!==null&&typeof value!=='string')throw Error('Invalid prepared storage value: '+key);
     try{
       for(const [key,value] of Object.entries(plan.next)){
         if(value===null)localStorage.removeItem(key);
         else localStorage.setItem(key,value);
       }
     }catch(e){
       try{restoreStorage(plan.original)}catch(rollbackError){
         throw Error('Recovery failed and rollback was incomplete. STOP editing. Preserve the downloaded backup. '+rollbackError.message);
       }
       throw Error('Recovery failed; previous local data restored: '+e.message);
     }
     return {status:'restored',cloudCount:plan.cloudCount,queueCount:plan.queueCount};
   }finally{host.setSyncBusy(false);localStorage.removeItem(LOCK);}
 }
 global.RUNLUCloudMasterRecovery={prepareRecovery,recover,lockKey:LOCK};
})(window);
