import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/snapshot-bridge.ts','utf8');

for (const x of [
  'warehouse-v7-snapshot',
  'warehouse-v7-real-snapshot-dryrun.yml@refs/heads/warehouse-v7-foundation',
  'READ_ONLY_V6_OPERATION_SHADOW',
  "'supplier', payload->>'supplier'",
  "'po', payload->>'po'",
  'postgres_jsonb_text_verified',
  'READ_ONLY_V6_SNAPSHOT'
]) assert.ok(s.includes(x), x);

assert.doesNotMatch(s,/insert\s+into\s+public\.warehouse_records|update\s+public\.warehouse_records|delete\s+from\s+public\.warehouse_records/i);
assert.doesNotMatch(s,/localStorage|cloud_master_offline_queue/i);

console.log('V7 snapshot bridge contract: PASS');
