import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('header reports actual pending record operations before Cloud checkmark',()=>{
 const start=html.indexOf("function updateHeaderCloudPill(");
 const end=html.indexOf("\nfunction cloudRememberSummary(",start);
 assert.ok(start>=0&&end>start);
 const fn=html.slice(start,end);
 assert.match(fn,/outboxCount=recordSyncOutbox\(\)\.length/);
 assert.match(fn,/if\(outboxCount\)\{el\.className='cloudPill syncing';el\.textContent=`\$\{outboxCount\} unsynced`/);
 assert.ok(fn.indexOf('if(outboxCount)')<fn.indexOf('if(recentOk)'), 'pending outbox must take priority over green check');
 assert.match(fn,/Queue issue/);
});

test('record sync does not mark completed while pending operations remain',()=>{
 const start=html.indexOf('async function recordSyncNow(');
 const end=html.indexOf('\nasync function cloudUploadAll(',start);
 assert.ok(start>=0&&end>start);
 const fn=html.slice(start,end);
 assert.match(fn,/const remainingOutbox=recordSyncOutbox\(\)\.length/);
 assert.match(fn,/if\(!remainingOutbox\)localStorage\.setItem\(CLOUD_LAST_OK_KEY/);
 assert.match(fn,/if\(!remainingOutbox&&!protectedInputActive\(\)\)await recordSyncPull\(\)/);
});

test('server non-acknowledgment retains queue and exposes a bounded diagnostic',()=>{
 const start=html.indexOf('async function recordSyncPush(');
 const end=html.indexOf('\nasync function recordSyncBootstrap(',start);
 assert.ok(start>=0&&end>start);
 const fn=html.slice(start,end);
 assert.ok(fn.includes("if(!['ok','duplicate'].includes(status))"));
 assert.ok(fn.includes("localStorage.setItem(CLOUD_LAST_ERROR_KEY,issue)"));
 assert.ok(fn.includes("operation(s) retained"));
 assert.ok(fn.indexOf("if(!['ok','duplicate'].includes(status))") < fn.indexOf('q.shift()'));
});

test('recorded sync errors take precedence over recent successful requests',()=>{
 const start=html.indexOf('function updateHeaderCloudPill(');
 const end=html.indexOf('\nfunction cloudRememberSummary(',start);
 const fn=html.slice(start,end);
 assert.ok(fn.indexOf("if(error){el.className='cloudPill offline'") < fn.indexOf("if(recentOk){el.className='cloudPill online'"));
});

test('successful generic cloud requests do not erase pending outbox diagnostics',()=>{
 const start=html.indexOf('async function cloudRequest(');
 const end=html.indexOf('\nfunction v8CanonicalRpcHeaders(',start);
 assert.ok(start>=0&&end>start);
 const fn=html.slice(start,end);
 assert.ok(fn.includes("recordSyncOutbox().length===0"));
 assert.ok(fn.includes("localStorage.removeItem(CLOUD_LAST_ERROR_KEY)"));
 assert.ok(!fn.includes("localStorage.setItem(CLOUD_LAST_OK_KEY,new Date().toISOString());localStorage.removeItem(CLOUD_LAST_ERROR_KEY)"));
});
