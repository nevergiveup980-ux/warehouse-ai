import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/order-migration-rehearsal.py','utf8');

for (const x of [
  'ORDER_REHEARSAL_REFUSES_DATABASE',
  'ORDER_SHADOW_FINGERPRINT_MISMATCH',
  'WEAK_SOURCE_IDENTITY',
  'IDENTITY_CRITICAL_FIELDS_CONFLICT',
  'STRUCTURED_STATUS_MISSING',
  'STRUCTURED_STATUS_MOVED_BACKWARD',
  'V7_ORDER_MIGRATION_REHEARSAL',
  'production_writes":0',
  'inventory_writes":0',
  'on conflict(tenant_id,source_dataset,source_record_id,source_fingerprint)',
  'REHEARSAL_PASS'
]) assert.ok(s.includes(x),x);

assert.doesNotMatch(s,/insert into warehouse_v7\.stock_item|update warehouse_v7\.stock_item|insert into warehouse_v7\.inventory_movement/i);
assert.doesNotMatch(s,/localStorage|cloud_master|global_pause/i);

console.log('V7 order migration rehearsal contract: PASS');
