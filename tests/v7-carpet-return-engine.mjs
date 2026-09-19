import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('v7/carpet-return-engine-1.0.sql','utf8');
for(const x of [
  'return_carpet_piece','CARPET_RETURN','CARPET_PIECE_RETURNED',
  'ORIGINAL_CARPET_OUT_NOT_FOUND','CARPET_RETURN_EXCEEDS_OUT',
  'RETURN_ROLL_ALREADY_EXISTS','original_out_command','source_roll',
  'measure_status','TM'
]) assert.ok(s.toLowerCase().includes(x.toLowerCase()),x);
assert.equal((s.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length,1);
assert.equal((s.match(/insert into warehouse_v7\.event/g)||[]).length,1);
assert.match(s,/p_return_sixteenths,p_return_sixteenths,'TM',1,'active'/);
assert.doesNotMatch(s,/update warehouse_v7\.carpet_roll[\s\S]*p_source_roll/);
assert.doesNotMatch(s,/localStorage|global_pause|cloud_master/i);
console.log('V7 Carpet Return Engine 1.0 contract: PASS');
