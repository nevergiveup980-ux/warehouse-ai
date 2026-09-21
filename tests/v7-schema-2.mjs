import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('v7/schema-2.0.sql','utf8');
for(const t of ['location','product','stock_item','carpet_roll','command','event','inventory_movement','migration_staging']) assert.ok(s.includes('warehouse_v7.'+t));
assert.match(s,/primary key\(tenant_id,id\)/); assert.match(s,/payload_fingerprint text not null/); assert.match(s,/coverage_unit text/);
assert.match(s,/original_sixteenths bigint/); assert.match(s,/remaining_sixteenths bigint/);
assert.match(s,/physical_key text not null/); assert.match(s,/unique\(tenant_id,physical_key\)/); assert.ok((s.match(/on delete restrict/g)||[]).length>=8);
assert.doesNotMatch(s,/on delete cascade/i); assert.doesNotMatch(s,/global_pause|cloud_master_state/i);
console.log('V7 Schema 2.0 structural invariants: PASS');