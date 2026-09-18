import fs from'node:fs';import assert from'node:assert/strict';
const a=fs.readFileSync('v7/TRANSACTION_CONTRACT_1_0.md','utf8');
const b=fs.readFileSync('v7/RELATIONSHIP_CONTRACT_1_0.md','utf8');
for(const x of ['same fingerprint','different fingerprint','lock only affected','commit atomically','lost response']) assert.ok(a.toLowerCase().includes(x));
for(const x of ['tenant_id','RESTRICT','quarantine','rebuildable projections']) assert.ok(b.includes(x));
assert.ok(!/global pause/i.test(a+b));
console.log('V7 transaction + relationship contracts: PASS');