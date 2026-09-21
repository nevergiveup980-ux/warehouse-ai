import fs from 'node:fs';
import assert from 'node:assert/strict';

const m=JSON.parse(fs.readFileSync('v7/order-exception-engineering-manifest.json','utf8'));
const d=fs.readFileSync('v7/ORDER_EXCEPTION_WORKBENCH_ENGINEERING.md','utf8');

assert.equal(m.production_project_ref_forbidden,'ekrnknlawekeoszzkamd');
assert.equal(m.edge_function.name,'warehouse-v7-order-exception-api');
assert.equal(m.edge_function.verify_jwt,false);
assert.equal(m.edge_function.authentication,'supabase_auth_getUser');
assert.equal(m.current_verified_rehearsal.source_evidence_rows,55);
assert.equal(m.current_verified_rehearsal.canonical_orders,3);
assert.equal(m.current_verified_rehearsal.exception_cases,12);
assert.ok(m.required_gates.includes('zero_inventory_movements'));
assert.ok(m.required_gates.includes('same_command_retry_identical'));
assert.ok(d.includes('PRODUCTION_PROJECT_FORBIDDEN'));
assert.ok(d.includes('Creating a new Supabase development branch can have a platform cost'));
assert.ok(d.includes('getAccessToken'));
assert.doesNotMatch(d,/sb_secret_|service_role/i);

console.log('V7 order exception engineering activation contract: PASS');
