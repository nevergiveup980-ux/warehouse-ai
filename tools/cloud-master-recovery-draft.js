/* RUNLU Cloud Master Recovery — REVIEW-ONLY DRAFT. Not linked by production.
 * Two-phase: exportBackup() -> user verifies file -> prepare() -> commit().
 * Host must pause every writer/poller while commit runs. No cloud writes.
 */
(function(global){
 'use strict';
 const OUTBOX='runlu_record_sync_outbox_v1',CURSOR='runlu_record_sync_cursor_v1';
 const BOOTSTRAP='runlu_record_sync_bootstrapped_v1',GENERATION='runlu_record_sync_generation_v1';
 const LOCK='runlu_cloud_master_recovery_lock_v1';
 const JOURNAL='runlu_cloud_master_recovery_journal_v1';
 let prepared=null;
 function assertHost(host){
   if(localStorage.getItem(JOURNAL))throw Error('An interrupted recovery journal exists. Stop and inspect it before retrying');
   if(!host||!Array.isArray(host.dataKeys)||!host.dataKeys.length||typeof host.fetchSnapshot!=='function'||typeof host.hydrate!=='function'||typeof host.syncBusy!=='function'||typeof host.setSyncBusy!=='function'||typeof host.protectedInputActive!=='function'||typeof host.session!=='function'||!host.generation||!host.cursorKey||!host.bootstrapKey||!host.generationKey)throw Error('Recovery host is incomplete');
   if(host.syncBusy()||localStorage.getItem(LOCK))throw Error('Synchronization or recovery already active');
   if(!host.session())throw Error('Sign in first');
   if(host.protectedInputActive())throw Error('Close all editors first');
   if(navigator.onLine===false)throw Error('Online connection required');
 }
 function keys(host){return [...new Set([...host.dataKeys,OUTBOX,host.cursorKey,host.bootstrapKey,host.generationKey])];}
 function capture(list){return Object.fromEntries(list.map(key=>[key,localStorage.getItem(key)]));}
 function same(a,b){return Object.keys(a).every(key=>a[key]===b[key]);}
 function restore(snapshot){for(const [key,v] of Object.entries(snapshot)){if(v===null)localStorage.removeItem(key);else localStorage.setItem(key,v);}}
 function getQueue(raw){
   if(raw===null)return [];
   let parsed;
   try{parsed=JSON.parse(raw)}catch{throw Error('Unreadable queue: recovery blocked to preserve data');}
   if(!Array.isArray(parsed))throw Error('Invalid queue: recovery blocked to preserve data');
   return parsed;
 }
 function exportBackup(host){
   assertHost(host);
   const original=capture(keys(host));
   const queue=getQueue(original[OUTBOX]);
   const backup={format:'runlu-cloud-master-recovery-backup-v2',created_at:new Date().toISOString(),origin:location.origin,keys:original};
   const filename='RUNLU_RECOVERY_BACKUP_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
   const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   // Browser download request is NOT evidence of file persistence.
   return {filename,queueCount:queue.length,bytes:blob.size};
 }
 async function prepare(host){
   assertHost(host);
   const original=capture(keys(host)),queue=getQueue(original[OUTBOX]);
   const snapshot=await host.fetchSnapshot();
   if(host.syncBusy()||host.protectedInputActive()||!same(original,capture(keys(host))))throw Error('Device changed while fetching cloud snapshot; recovery cancelled');
   if(!snapshot||!Array.isArray(snapshot.records)||!Number.isSafeInteger(Number(snapshot.cursor))||Number(snapshot.cursor)<0)throw Error('Cloud snapshot invalid');
   // A zero-row cloud snapshot must not erase local warehouse records.
   if(!snapshot.records.length)throw Error('Cloud snapshot empty; recovery blocked');
   const grouped=new Map(host.dataKeys.map(k=>[k,[]]));
   for(const row of snapshot.records){
     if(!grouped.has(row.dataset_key)||row.deleted_at)continue;
     const payload=await host.hydrate(row.payload);
     if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Cloud record invalid; recovery blocked');
     grouped.get(row.dataset_key).push({...payload,_cloudVersion:Number(row.version||0),_cloudChangeSeq:Number(row.change_seq||0),_cloudRecordId:String(row.record_id||'')});
   }
   const next={};
   for(const [key,rows] of grouped)next[key]=JSON.stringify(rows);
   next[OUTBOX]='[]';next[host.cursorKey]=String(Number(snapshot.cursor));
   next[host.bootstrapKey]='1';next[host.generationKey]=host.generation;
   prepared={original,next,queueCount:queue.length,cloudCount:snapshot.records.length,at:Date.now()};
   return {queueCount:queue.length,cloudCount:snapshot.records.length,requiresVerifiedBackup:true};
 }
 function inspectInterruptedRecovery(){
   const raw=localStorage.getItem(JOURNAL);
   if(!raw)return {status:'none'};
   let journal;
   try{journal=JSON.parse(raw)}catch{return {status:'corrupt',requiresManualReview:true};}
   if(journal?.format!=='runlu-recovery-journal-v1'||!journal.original||typeof journal.original!=='object')return {status:'invalid',requiresManualReview:true};
   const original=journal.original;
   const current=capture(Object.keys(original));
   return {status:'interrupted',createdAt:journal.created_at,keys:Object.keys(original),matchesOriginal:same(original,current),requiresManualReview:true};
 }
 function commit(host,confirmation,backupVerified){
   assertHost(host);
   if(confirmation!=='CLOUD MASTER'||backupVerified!==true)throw Error('Explicit CLOUD MASTER confirmation and verified backup required');
   if(!prepared||Date.now()-prepared.at>120000)throw Error('Recovery plan missing or expired; prepare again');
   const plan=prepared;prepared=null;
   if(!same(plan.original,capture(keys(host))))throw Error('Local data changed since review; prepare again');
   // The caller must separately ask the user to verify the exported file exists.
   // Guard existing sync entry points against LOCK before this function is integrated.
   // Persist the original values before any destructive write. This journal is intentionally
   // NOT removed on partial failure: a future manual recovery can inspect it.
   localStorage.setItem(JOURNAL,JSON.stringify({format:'runlu-recovery-journal-v1',created_at:new Date().toISOString(),original:plan.original}));
   localStorage.setItem(LOCK,new Date().toISOString());
   host.setSyncBusy(true);
   try{
     try{
       for(const [key,value] of Object.entries(plan.next))localStorage.setItem(key,value);
     }catch(e){
       try{restore(plan.original)}catch(rollback){
         throw Error('Rollback incomplete; stop editing and preserve backup: '+rollback.message);
       }
       throw Error('Recovery failed; local data restored: '+e.message);
     }
     localStorage.removeItem(JOURNAL);
     return {status:'restored',queueCount:plan.queueCount,cloudCount:plan.cloudCount};
   }finally{host.setSyncBusy(false);localStorage.removeItem(LOCK);}
 }
 global.RUNLUCloudMasterRecovery={exportBackup,prepare,commit,inspectInterruptedRecovery,lockKey:LOCK,journalKey:JOURNAL};
})(window);
