import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/order-source-audit.py','utf8');
const p=fs.readFileSync('v7/ORDER_IDENTITY_POLICY_1_0.md','utf8');

for (const x of [
  'READ_ONLY_V6_ORDER_SHADOW',
  'identity_conflict',
  'lifecycle_regression',
  'deferred_weak_identity',
  'replay_duplicate',
  'lifecycle_evidence',
  'notes_are_not_status_evidence',
  'canonical_order_writes":0'
]) assert.ok(s.includes(x),x);

for (const x of [
  'recoveryKey',
  'Free-text notes',
  'Ready for Pickup -> Picked Up',
  'Orders describe business intent/allocation',
  'zero canonical V7 order rows'
]) assert.ok(p.includes(x),x);

console.log('V7 order source audit contract: PASS');
