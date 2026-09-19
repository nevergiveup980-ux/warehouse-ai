import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('v7/carpet-transfer-engine-1.0.sql','utf8');
for(const x of [
  'transfer_carpet_roll','transfer_carpet_piece','CARPET_TRANSFER',
  'CARPET_TRANSFERRED','CARPET_PIECE_OUT','CARPET_PIECE_IN',
  'CARPET_PIECE_TRANSFERRED_OUT','CARPET_PIECE_TRANSFERRED_IN',
  'PIECE_TRANSFER_REQUIRES_PARTIAL_LENGTH','CHILD_ROLL_ALREADY_EXISTS',
  'measure_status','TM','source_roll'
]) assert.ok(s.toLowerCase().includes(x.toLowerCase()),x);
assert.equal((s.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length,3);
assert.equal((s.match(/insert into warehouse_v7\.event/g)||[]).length,3);
assert.match(s,/remaining_sixteenths=source_after/);
assert.match(s,/p_transfer_sixteenths,p_transfer_sixteenths,'TM',1,'active'/);
assert.doesNotMatch(s,/localStorage|global_pause|cloud_master/i);
console.log('V7 Carpet Transfer Engine 1.0 contract: PASS');
