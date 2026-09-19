import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('v7/transfer-engine-1.0.sql','utf8');
for(const x of ['for update','INVALID_LOCATION','STOCK_NOT_FOUND','INVALID_STOCK_STATE','STALE_VERSION','SAME_LOCATION',"'TRANSFER'","'TRANSFERRED'"])assert.ok(s.toLowerCase().includes(x.toLowerCase()));
assert.match(s,/location_id=p_to_location,version=version\+1/);
assert.match(s,/s\.location_id,p_to_location/);
assert.equal((s.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length,1);
assert.equal((s.match(/insert into warehouse_v7\.event/g)||[]).length,1);
assert.doesNotMatch(s,/quantity=quantity[-+]|localStorage|global_pause|cloud_master/i);
console.log('V7 Transfer Engine 1.0 conservation contract: PASS');