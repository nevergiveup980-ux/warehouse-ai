import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('v7/order-exception-workbench.html','utf8');
const js=fs.readFileSync('v7/order-exception-workbench.js','utf8');
const sql=fs.readFileSync('v7/order-exception-workbench-1.0.sql','utf8');

for (const x of [
  'Order Exception Workbench',
  'Resolve & create canonical order',
  'NOT CONNECTED',
  'Source evidence',
  'Resolution note'
]) assert.ok(html.includes(x),x);

assert.ok((html+js).includes('ENGINEERING DEMO'),'ENGINEERING DEMO');

for (const x of [
  'RUNLU_V7_ORDER_EXCEPTION_API',
  'structured_fields',
  'inventory was not changed',
  'Owner/Admin role is required',
  'demo records only'
]) assert.ok(js.includes(x),x);

for (const x of [
  'list_order_exception_workbench',
  'get_order_exception_workbench_case',
  'TENANT_MEMBERSHIP_REQUIRED',
  'INVALID_ORDER_EXCEPTION_STATUS',
  'security invoker',
  'structured_fields'
]) assert.ok(sql.includes(x),x);

// Public engineering shell must not embed credentials or a production write endpoint.
assert.doesNotMatch(html+js,/SUPABASE_(ANON|SERVICE)|service_role|eyJ[a-zA-Z0-9_-]{20,}/i);
assert.doesNotMatch(html+js,/functions\/v1\/|rest\/v1\//i);

// Demo must be opt-in and cannot resolve.
assert.ok(js.includes("params.get('demo') === '1'"));
assert.ok(js.includes("state.mode === 'connected' && c.can_resolve === true"));

console.log('V7 order exception workbench UI/read contract: PASS');
