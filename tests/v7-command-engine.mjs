import fs from'node:fs';import assert from'node:assert/strict';
const s=fs.readFileSync('v7/command-engine-1.0.sql','utf8');
for(const x of ['canonical_fingerprint','begin_command','commit_command','reject_command','COMMAND_FINGERPRINT_MISMATCH','COMMAND_NOT_FOUND'])assert.ok(s.includes(x));
assert.match(s,/sha256/);assert.match(s,/c\.payload_fingerprint<>fp/);
assert.match(s,/status='committed'/);assert.match(s,/status='rejected'/);
assert.doesNotMatch(s,/localStorage|global_pause|cloud_master/i);
console.log('V7 Command Engine 1.0 contract: PASS');