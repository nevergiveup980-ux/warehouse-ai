import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/order-exception-api-edge.ts','utf8');

for (const x of [
  'PRODUCTION_PROJECT_REF = "ekrnknlawekeoszzkamd"',
  'PRODUCTION_PROJECT_FORBIDDEN',
  'supabase.auth.getUser(token)',
  "set_config('request.jwt.claim.sub'",
  'list_order_exception_workbench',
  'get_order_exception_workbench_case',
  'resolve_order_exception_create_order',
  'COMMAND_ID_REQUIRED',
  'EXPECTED_VERSION_REQUIRED',
  'ORDER_EXCEPTION_REVIEW_ROLE_REQUIRED',
  'PRODUCTION_DATABASE_FORBIDDEN',
  'PROJECT_DATABASE_MISMATCH',
  'projectRefFromDbUrl',
  'postgres.',
  'new Response(null',
  'V7_ORDER_EXCEPTION_WORKBENCH'
]) assert.ok(s.includes(x),x);

assert.doesNotMatch(s,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS|service_role/i);
assert.doesNotMatch(s,/insert\s+into\s+warehouse_v7\.|update\s+warehouse_v7\.|delete\s+from\s+warehouse_v7\./i);
assert.ok(s.includes('SUPABASE_PUBLISHABLE_KEYS'));
assert.ok(s.includes('SUPABASE_DB_URL'));

console.log('V7 order exception API edge contract: PASS');

assert.ok(s.includes('decodeURIComponent(parsed.username || "")'));
assert.ok(s.includes('if (status === 204)'));
