import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/supplier-return-engine-1.0.sql','utf8');

for (const x of [
  'return_stock_to_supplier',
  'RETURN_TO_SUPPLIER',
  'RETURNED_TO_SUPPLIER',
  'INVALID_SUPPLIER_RETURN_QUANTITY',
  'SUPPLIER_REFERENCE_REQUIRED',
  'INSUFFICIENT_STOCK',
  'STALE_VERSION',
  'supplier_ref',
  'returned_to_supplier'
]) assert.ok(s.includes(x), x);

assert.match(s,/new_qty:=s\.quantity-p_quantity/);
assert.match(s,/lifecycle=case when new_qty=0 then 'consumed'/);
assert.equal((s.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length,1);
assert.equal((s.match(/insert into warehouse_v7\.event/g)||[]).length,1);
assert.doesNotMatch(s,/localStorage|global_pause|cloud_master/i);

console.log('V7 Supplier Return Engine 1.0 contract: PASS');
