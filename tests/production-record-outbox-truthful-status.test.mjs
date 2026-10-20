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
