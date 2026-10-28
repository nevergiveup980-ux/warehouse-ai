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
 assert.ok(body.indexOf('await recordSyncPull()')<body.indexOf('});}catch(gateError)'));
});
