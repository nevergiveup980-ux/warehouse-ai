const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function functionBody(name,nextName){
 const a=src.indexOf(name),b=src.indexOf(nextName,a+name.length);
 assert.ok(a>=0&&b>a,'Expected production functions to be present');
 return src.slice(a,b);
}
test('legacy sync guard rejects recovery, pending queue and active record master',()=>{
 const body=functionBody('function assertLegacyDatasetSyncSafe(){','async function cloudUploadAll(){');
 assert.match(body,/runlu_cloud_master_recovery_lock_v1/);
 assert.match(body,/runlu_cloud_master_recovery_journal_v1/);
 assert.match(body,/recordSyncOutbox\(\)\.length/);
 assert.match(body,/recordSyncReady\(\)/);
});
test('legacy full upload checks guard before session, confirmation and write',()=>{
 const body=functionBody('async function cloudUploadAll(){','async function cloudPutDatasetInitial(');
 assert.ok(body.indexOf('assertLegacyDatasetSyncSafe()')<body.indexOf('cloudEnsureSession()'));
});
test('legacy dataset RPC write is guarded at the write function',()=>{
 const body=functionBody('async function cloudPutDatasetInitial(','async function cloudFetchRows(');
 assert.match(body,/assertLegacyDatasetSyncSafe\(\)/);
});
test('legacy pull and smart sync are guarded',()=>{
 const pull=functionBody('async function cloudDownloadAll(','async function flushCloudDirty(');
 const smart=functionBody('async function cloudSmartSync(','async function cloudResolveConflictsFromCloud(');
 const apply=functionBody('async function applyCloudRows(','async function cloudDownloadAll(');
 assert.match(pull,/assertLegacyDatasetSyncSafe\(\)/);
 assert.match(smart,/assertLegacyDatasetSyncSafe\(\)/);
 assert.match(apply,/assertLegacyDatasetSyncSafe\(\)/);
});
