/* RUNLU cross-tab recovery gate. Draft only; every sync writer must participate.
 * Web Locks are atomic across participating same-origin browser contexts.
 * Both recovery and sync are exclusive: multiple tabs may share one outbox.
 * Separate installed-PWA/browser storage partitions are not coordinated.
 * A localStorage flag alone is NOT an atomic lock.
 */
(function(global){
 'use strict';
 const NAME='runlu-warehouse-recovery-gate-v1';
 function locks(){
   if(!global.navigator?.locks?.request)throw Error('Web Locks unsupported; cross-tab recovery disabled');
   return global.navigator.locks;
 }
 async function withRecoveryLock(task){
   if(typeof task!=='function')throw Error('Recovery callback required');
   const result=await locks().request(NAME,{mode:'exclusive',ifAvailable:true},async lock=>{
     if(!lock)throw Error('Another warehouse tab is active; recovery blocked');
     return task();
   });
   return result;
 }
 async function withSyncLock(task){
   if(typeof task!=='function')throw Error('Sync callback required');
   return locks().request(NAME,{mode:'exclusive',ifAvailable:true},async lock=>{
     if(!lock)return {status:'blocked-by-another-tab'};
     return task();
   });
 }
 global.RUNLURecoveryGate={withRecoveryLock,withSyncLock,name:NAME};
})(window);
