import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/order-engine-1.0.sql','utf8');

for (const x of [
  'warehouse_v7.order_record',
  'warehouse_v7.order_source_evidence',
  'source_identity_key',
  'recovery_key',
  'fulfillment_status',
  'transition_order',
  'ORDER_TRANSITION',
  'ORDER_TRANSITIONED',
  'INVALID_ORDER_LIFECYCLE_TRANSITION',
  'INVALID_ORDER_FULFILLMENT_TRANSITION',
  'ORDER_NO_STATE_CHANGE',
  'ORDER_SOURCE_EVIDENCE_APPEND_ONLY',
  'ORDER_RECORD_DELETE_FORBIDDEN_USE_ARCHIVE',
  'STALE_VERSION'
]) assert.ok(s.includes(x),x);

for (const state of [
  "'draft'","'in_progress'","'completed'","'archived'",
  "'unverified'","'pending'","'received'","'backorder'",
  "'ready_for_pickup'","'picked_up'"
]) assert.ok(s.includes(state),state);

assert.match(s,/unique\(tenant_id,order_kind,source_identity_key\)/);
assert.match(s,/for update/);
assert.match(s,/order_source_evidence_append_only/);
assert.match(s,/order_record_no_delete/);
assert.equal((s.match(/insert into warehouse_v7\.event/g)||[]).length,1);
assert.doesNotMatch(s,/localStorage|cloud_master|global_pause/i);

console.log('V7 Order Engine 1.0 contract: PASS');
