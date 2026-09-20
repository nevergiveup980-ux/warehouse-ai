import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/order-execution-bridge-1.0.sql','utf8');
const rel=fs.readFileSync('v7/RELATIONSHIP_CONTRACT_1_0.md','utf8');

for(const token of [
  'order_execution_binding',
  'order_fulfillment_action',
  'order_execution_queue',
  'bind_order_execution',
  'receive_bound_order_stock',
  'ship_bound_order_stock',
  'ORDER_EXECUTION_OVERFULFILLMENT',
  'ORDER_EXECUTION_COMMAND_ALREADY_USED',
  'ORDER_FULFILLMENT_ACTION_APPEND_ONLY',
  "flow in ('INBOUND','OUTBOUND')",
  "case when b.flow='INBOUND' then 'RECEIVE_ORDER' else 'SHIP_ORDER' end"
]) assert.ok(s.includes(token),token);

const bind=s.slice(s.indexOf('create or replace function warehouse_v7.bind_order_execution'),s.indexOf('create or replace function warehouse_v7.receive_bound_order_stock'));
assert.doesNotMatch(bind,/o\.product_label\s*=|o\.source_location\s*=/i);
assert.ok(bind.includes('p_product'));
assert.ok(bind.includes('p_location'));
assert.ok(rel.includes('order_execution_binding'));
assert.ok(rel.includes('No execution binding may be inferred from product_label'));
console.log('V7 order execution bridge contract: PASS');
