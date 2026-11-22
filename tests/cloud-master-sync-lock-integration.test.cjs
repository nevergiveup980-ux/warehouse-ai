const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('cross-tab gate script loads before main application script',()=>{
 const gate=html.indexOf('<script src="tools/cross-tab-recovery-gate-draft.js"></script>');
 const main=html.indexOf('<script>\n/* RUNLU Build044');
 assert.ok(gate>=0&&main>gate);
});
test('recordSyncNow requires gate and holds lock over push and pull',()=>{
 const from=html.indexOf('async function recordSyncNow(');
 const to=html.indexOf('\nfunction assertLegacyDatasetSyncSafe()',from);
 assert.ok(from>=0&&to>from);
 const body=html.slice(from,to);
 assert.match(body,/if\(!gate\)throw new Error/);
 assert.match(body,/gate\.withSyncLock\(async\(\)=>\{/);
 assert.ok(body.indexOf('gate.withSyncLock(')<body.indexOf('await recordSyncPush()'));
 assert.ok(body.indexOf('await recordSyncPull()')<body.indexOf('});if(lockResult?.status'));
});

test('blocked lock result is not treated as successful cloud synchronization',()=>{
 const from=html.indexOf('async function recordSyncNow(');
 const to=html.indexOf('\nfunction assertLegacyDatasetSyncSafe()',from);
 const body=html.slice(from,to);
 assert.match(body,/lockResult\?\.status==='blocked-by-another-tab'/);
 assert.match(body,/no cloud success recorded/);
 assert.ok(body.indexOf('CLOUD_LAST_OK_KEY')<body.indexOf("lockResult?.status==='blocked-by-another-tab'"));
});

test('record sync fails closed for recovery journal or lock both before and inside exclusive gate',()=>{
 const from=html.indexOf('async function recordSyncNow(');
 const to=html.indexOf('\nfunction assertLegacyDatasetSyncSafe()',from);
 const body=html.slice(from,to);
 const journal="localStorage.getItem('runlu_cloud_master_recovery_journal_v1')";
 const lock="localStorage.getItem('runlu_cloud_master_recovery_lock_v1')";
 assert.equal(body.split(journal).length-1,2);
 assert.equal(body.split(lock).length-1,2);
 assert.ok(body.indexOf(journal)<body.indexOf('gate.withSyncLock('));
 assert.ok(body.lastIndexOf(journal)>body.indexOf('gate.withSyncLock('));
 assert.ok(body.lastIndexOf(journal)<body.indexOf('await recordSyncPush()'));
});

test('normal cloud bootstrap refuses unverified snapshots before any local replacement',()=>{
 const from=html.indexOf('async function recordSyncBootstrap(');
 const to=html.indexOf('\nasync function recordSyncPull(',from);
 assert.ok(from>=0&&to>from);
 const body=html.slice(from,to);
 assert.match(body,/snap\?\.totalCount/);
 assert.match(body,/snap\?\.completenessVerified!==true/);
 assert.match(body,/snap\?\.totalCountSource!=='server'/);
 assert.ok(body.indexOf('snapshot completeness is not server-verified')<body.indexOf('cloudApplying=true'));
 assert.ok(body.indexOf('snapshot completeness is not server-verified')<body.indexOf('localStorage.setItem(k,JSON.stringify(v))'));
});
