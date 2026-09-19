import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync(new URL('../v7/schema.sql',import.meta.url),'utf8');
for(const x of ['warehouse_v7.command','warehouse_v7.event','warehouse_v7.inventory_movement','warehouse_v7.carpet_roll','migration_staging'])assert.ok(s.includes(x));
assert.match(s,/id uuid primary key/);assert.match(s,/unique\(tenant_id,roll_number\)/);
assert.match(s,/remaining_inches>=0 and remaining_inches<=original_inches/);
assert.match(s,/unique\(tenant_id,source_dataset,source_record_id\)/);
assert.doesNotMatch(s,/localStorage|runlu_cloud_master_offline_queue_v680/);
console.log('V7 foundation schema contract: PASS');