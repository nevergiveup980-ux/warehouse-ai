import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/order-exception-real-evidence-rehearsal.py','utf8');

for(const x of [
  'WORKBENCH_REAL_EVIDENCE_REHEARSAL_REFUSES_DATABASE',
  'STRUCTURED_STATUS_MISSING',
  'synthetic decision on real sanitized evidence',
  'historical_status_asserted":False',
  'same_command_retry_identical',
  'zero_command_inventory_movements',
  'global_inventory_state_unchanged',
  'V7 ORDER EXCEPTION REAL-EVIDENCE WORKBENCH REHEARSAL: PASS'
]) assert.ok(s.includes(x),x);

assert.doesNotMatch(s,/insert into warehouse_v7\.stock_item|update warehouse_v7\.stock_item|insert into warehouse_v7\.inventory_movement/i);
assert.doesNotMatch(s,/production.*write.*1/i);

console.log('V7 order exception real-evidence rehearsal contract: PASS');
