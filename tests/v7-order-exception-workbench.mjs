import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('v7/order-exception-workbench.html','utf8');
const js=fs.readFileSync('v7/order-exception-workbench.js','utf8');
const sql=fs.readFileSync('v7/order-exception-workbench-1.0.sql','utf8');
const runtimeConfig=fs.readFileSync('v7/order-exception-engineering-config.js','utf8');

for (const x of [
  'Order Exception Workbench',
  'Resolve & create canonical order',
  'NOT CONNECTED',
  'Source evidence',
  'Resolution note'
]) assert.ok(html.includes(x),x);

assert.ok((html+js).includes('ENGINEERING DEMO'),'ENGINEERING DEMO');
assert.ok(js.includes('total: 12'),'demo total 12');
assert.ok(js.includes('status_missing: 9'),'demo missing-status 9');
assert.ok(js.includes('Array.from({length:9}'),'nine status cards');

for (const x of [
  'RUNLU_V7_ORDER_EXCEPTION_API',
  'structured_fields',
  'Inventory was not changed',
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
assert.ok(html.includes('order-exception-api-client.js'));
assert.ok(js.includes('RUNLU_V7_WORKBENCH_CONFIG'));
assert.ok(js.includes('pendingResolveCommandIds'));
assert.ok(js.includes('command_id: commandId'));

console.log('V7 order exception workbench UI/read contract: PASS');

assert.ok((html+js).includes("order-exception-engineering-auth.js"),"order-exception-engineering-auth.js");

assert.ok((html+js).includes("Administrator sign in"),"Administrator sign in");

assert.ok((html+js).includes("engineeringEmail"),"engineeringEmail");

assert.ok((html+js).includes("engineeringPassword"),"engineeringPassword");

assert.ok((html+js).includes("ENGINEERING SIGN-IN"),"ENGINEERING SIGN-IN");

assert.ok((html+js).includes("RUNLU_V7_ENGINEERING_AUTH_CONFIG"),"RUNLU_V7_ENGINEERING_AUTH_CONFIG");

assert.ok(js.includes("validateResolutionForm"),"validateResolutionForm");

assert.ok(js.includes("Quantity must be greater than zero."),"Quantity must be greater than zero.");

assert.ok(js.includes("Draft orders must use Unverified fulfillment."),"Draft orders must use Unverified fulfillment.");

assert.ok(js.includes("Completed or archived orders must use Completed fulfillment."),"Completed or archived orders must use Completed fulfillment.");

assert.ok(js.includes("Inventory quantities will not change."),"Inventory quantities will not change.");

assert.ok(html.includes('order-exception-engineering-config.js'),'safe runtime config loaded');

assert.ok(runtimeConfig.includes('RUNLU_V7_ENGINEERING_AUTH_CONFIG = null'));
assert.doesNotMatch(runtimeConfig,/sb_publishable_[A-Za-z0-9_-]+|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/);
