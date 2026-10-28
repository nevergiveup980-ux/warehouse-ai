const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../tools/cloud-master-recovery-draft.js'),'utf8');
function setup(initial={}){
 const values=new Map(Object.entries(initial));
 const localStorage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const window={};
 const context={window,localStorage,navigator:{onLine:true},location:{origin:'https://warehouse.example'},Date,JSON,Map,Set,Number,String,Object,Array,Error};
 vm.runInNewContext(source,context);
 return {api:window.RUNLUCloudMasterRecovery,window,localStorage,values};
}
test('no journal means no interrupted recovery',()=>{
 const {api}=setup();
 assert.equal(api.inspectInterruptedRecovery().status,'none');
});
test('corrupt journal is reported without modifying storage',()=>{
 const {api,values}=setup({'runlu_cloud_master_recovery_journal_v1':'{bad'});
 assert.equal(api.inspectInterruptedRecovery().status,'corrupt');
 assert.equal(values.get(api.journalKey),'{bad');
});
test('valid journal reports whether original values still match',()=>{
 const journal={format:'runlu-recovery-journal-v1',created_at:'2026-10-27T00:00:00Z',original:{inventory:'old',queue:'[]'}};
 const {api,values}=setup({inventory:'old',queue:'[]','runlu_cloud_master_recovery_journal_v1':JSON.stringify(journal)});
 assert.equal(api.inspectInterruptedRecovery().matchesOriginal,true);
 values.set('inventory','new');
 const report=api.inspectInterruptedRecovery();
 assert.equal(report.status,'interrupted');
 assert.equal(report.matchesOriginal,false);
 assert.equal(values.get('inventory'),'new');
});
test('pending journal blocks recovery entry points',()=>{
 const {api}=setup({'runlu_cloud_master_recovery_journal_v1':'{bad'});
 assert.throws(()=>api.exportBackup({}),/interrupted recovery journal/);
});

function recoveryHost(storage){
 return {
  dataKeys:['inventory'],fetchSnapshot:async()=>({cursor:7,records:[{dataset_key:'inventory',record_id:'a',payload:{id:'a'},version:1,change_seq:7}]}),
  hydrate:async x=>x,syncBusy:()=>false,setSyncBusy:()=>{},protectedInputActive:()=>false,
  session:()=>({user:{id:'test'}}),generation:'test-generation',cursorKey:'cursor',
  bootstrapKey:'bootstrap',generationKey:'generation'
 };
}
test('commit fails closed when exclusive gate is absent',async()=>{
 const {api,values}=setup({inventory:'old'});
 const host=recoveryHost();
 await api.prepare(host);
 await assert.rejects(api.commit(host,'CLOUD MASTER',true),/Exclusive recovery gate unavailable/);
 assert.equal(values.get('inventory'),'old');
});

test('recovery commit holds exclusive gate while applying local data',async()=>{
 const {api,window,values}=setup({inventory:'old'});
 const host=recoveryHost();
 await api.prepare(host);
 api.verifyBackupImport(host,JSON.stringify({format:'runlu-cloud-master-recovery-backup-v2',origin:'https://warehouse.example',keys:{inventory:'old',runlu_record_sync_outbox_v1:null,cursor:null,bootstrap:null,generation:null}}));
 let lockHeld=false,lockCalls=0;
 window.RUNLURecoveryGate={withRecoveryLock:async task=>{
   lockHeld=true;lockCalls++;
   try{return await task();}finally{lockHeld=false;}
 }};
 const result=await api.commit(host,'CLOUD MASTER',true);
 assert.equal(result.status,'restored');
 assert.equal(lockCalls,1);
 assert.equal(lockHeld,false);
 assert.equal(JSON.parse(values.get('inventory'))[0].id,'a');
 assert.equal(values.has(api.journalKey),false);
});
test('denied recovery gate preserves original records',async()=>{
 const {api,window,values}=setup({inventory:'old'});
 const host=recoveryHost();
 await api.prepare(host);
 window.RUNLURecoveryGate={withRecoveryLock:async()=>{throw Error('Another warehouse tab is active; recovery blocked');}};
 await assert.rejects(api.commit(host,'CLOUD MASTER',true),/Another warehouse tab/);
 assert.equal(values.get('inventory'),'old');
 assert.equal(values.has(api.journalKey),false);
});

test('interrupted recovery rolls back original values under exclusive gate',async()=>{
 const original={inventory:'old',queue:'[{"id":1}]'};
 const journal={format:'runlu-recovery-journal-v1',created_at:'2026-10-28T00:00:00Z',original};
 const {api,window,values}=setup({inventory:'partial',queue:'[]',[ 'runlu_cloud_master_recovery_journal_v1' ]:JSON.stringify(journal),runlu_cloud_master_recovery_lock_v1:'interrupted'});
 let calls=0;
 window.RUNLURecoveryGate={withRecoveryLock:async task=>{calls++;return task();}};
 const result=await api.rollbackInterruptedRecovery();
 assert.equal(result.status,'rolled-back');
 assert.equal(result.restoredKeys,2);
 assert.equal(calls,1);
 assert.equal(values.get('inventory'),'old');
 assert.equal(values.get('queue'),original.queue);
 assert.equal(values.has(api.journalKey),false);
 assert.equal(values.has(api.lockKey),false);
});
test('invalid interrupted journal never overwrites inventory',async()=>{
 const {api,window,values}=setup({inventory:'keep',runlu_cloud_master_recovery_journal_v1:'{bad'});
 window.RUNLURecoveryGate={withRecoveryLock:async task=>task()};
 await assert.rejects(api.rollbackInterruptedRecovery(),/unreadable/);
 assert.equal(values.get('inventory'),'keep');
 assert.equal(values.has(api.journalKey),true);
});
test('rollback without exclusive lock is blocked',async()=>{
 const original={inventory:'old'};
 const {api,values}=setup({inventory:'partial',runlu_cloud_master_recovery_journal_v1:JSON.stringify({format:'runlu-recovery-journal-v1',original})});
 await assert.rejects(api.rollbackInterruptedRecovery(),/Exclusive recovery gate unavailable/);
 assert.equal(values.get('inventory'),'partial');
});

test('backup import rejects mismatched device values and leaves storage intact',()=>{
 const {api,values}=setup({inventory:'old'});
 const host=recoveryHost();
 assert.throws(()=>api.verifyBackupImport(host,JSON.stringify({format:'runlu-cloud-master-recovery-backup-v2',origin:'https://warehouse.example',keys:{inventory:'wrong',runlu_record_sync_outbox_v1:null,cursor:null,bootstrap:null,generation:null}})),/does not match/);
 assert.equal(values.get('inventory'),'old');
});
test('backup import rejects malformed JSON',()=>{
 const {api}=setup({inventory:'old'});
 assert.throws(()=>api.verifyBackupImport(recoveryHost(),'{bad'),/cannot be parsed/);
});
test('commit refuses a confirmation checkbox without imported backup',async()=>{
 const {api,window,values}=setup({inventory:'old'});
 const host=recoveryHost();
 await api.prepare(host);
 window.RUNLURecoveryGate={withRecoveryLock:async task=>task()};
 await assert.rejects(api.commit(host,'CLOUD MASTER',true),/Import and verify/);
 assert.equal(values.get('inventory'),'old');
});
