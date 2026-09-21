import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('v7/transfer-engine-1.0.sql','utf8');
const marker='-- V7 quantity-aware stock transfer path.';
const parts=s.split(marker);
assert.equal(parts.length,2,'quantity-aware transfer marker must occur exactly once');
const legacy=parts[0], qty=parts[1];

for(const x of ['for update','INVALID_LOCATION','STOCK_NOT_FOUND','INVALID_STOCK_STATE','STALE_VERSION','SAME_LOCATION',"'TRANSFER'","'TRANSFERRED'"])
  assert.ok(legacy.toLowerCase().includes(x.toLowerCase()));
assert.match(legacy,/location_id=p_to_location,version=version\+1/);
assert.match(legacy,/s\.location_id,p_to_location/);
assert.equal((legacy.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length,1);
assert.equal((legacy.match(/insert into warehouse_v7\.event/g)||[]).length,1);
assert.doesNotMatch(legacy,/quantity=quantity[-+]|localStorage|global_pause|cloud_master/i);

for(const x of [
  'transfer_stock_quantity','INVALID_TRANSFER_QUANTITY','TRANSFER_SOURCE_DESTINATION_SAME_ENTITY',
  'DESTINATION_STOCK_IDENTITY_MISMATCH','DESTINATION_STOCK_NOT_FOUND','INSUFFICIENT_STOCK',
  "'TRANSFER_OUT'","'TRANSFER_IN'","'TRANSFERRED_OUT'","'TRANSFERRED_IN'",
  'source_after:=src.quantity-p_quantity','destination_after:=dst.quantity+p_quantity'
]) assert.ok(qty.toLowerCase().includes(x.toLowerCase()),x);
assert.equal((qty.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length,2);
assert.equal((qty.match(/insert into warehouse_v7\.event/g)||[]).length,2);
assert.match(qty,/source_after=0 then 'consumed'/);
assert.doesNotMatch(qty,/localStorage|global_pause|cloud_master/i);

console.log('V7 Transfer Engine 1.0 + quantity-aware conservation contract: PASS');
