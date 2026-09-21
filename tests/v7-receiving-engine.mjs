import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('v7/receiving-engine-1.0.sql','utf8');
for(const x of ['INVALID_RECEIVE_QUANTITY','INVALID_UNIT','PRODUCT_NOT_ACTIVE','INVALID_LOCATION','STOCK_IDENTITY_MISMATCH','STALE_VERSION',"'RECEIVE'","'RECEIVED'",'for update'])assert.ok(s.toLowerCase().includes(x.toLowerCase()));
assert.match(s,/if c\.status='committed' then return c\.result/);
assert.equal((s.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length,1);
assert.equal((s.match(/insert into warehouse_v7\.event/g)||[]).length,1);
assert.doesNotMatch(s,/localStorage|global_pause|cloud_master/i);
console.log('V7 Receiving Engine 1.0 static attack contract: PASS');