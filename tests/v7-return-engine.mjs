import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('v7/return-engine-1.0.sql','utf8');
for(const x of ['ORIGINAL_SHIPMENT_NOT_FOUND','RETURN_EXCEEDS_SHIPPED','UNIT_MISMATCH','STALE_VERSION',"'RETURN'","'RETURNED'",'original_ship_command','for update'])assert.ok(s.toLowerCase().includes(x.toLowerCase()));
assert.match(s,/returned\+p_quantity>shipped/);
assert.match(s,/quantity=quantity\+p_quantity/);
assert.doesNotMatch(s,/delete from|update warehouse_v7\.inventory_movement|update warehouse_v7\.event/i);
assert.equal((s.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length,1);
console.log('V7 Return Engine 1.0 compensation contract: PASS');