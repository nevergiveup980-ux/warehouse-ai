import fs from 'node:fs';
import assert from 'node:assert/strict';

const loader=fs.readFileSync(new URL('../release-loader.js',import.meta.url),'utf8');
const build072=fs.readFileSync(new URL('../build072-hotfix.js',import.meta.url),'utf8');

assert.ok(loader.includes("const RELEASE='127'"),'stable release badge/token must remain Build127');
assert.ok(loader.includes("const BUILD145_GUARD_TOKEN='127-build145-replay-guard'"),'Build145 cache-bust token missing');
assert.ok(loader.includes("src==='build072-hotfix.js'?BUILD145_GUARD_TOKEN"),'Build072 must receive the dedicated guard cache token');
assert.ok(loader.includes("data-runlu-loaded-build',RELEASE"),'visible loaded build must remain stable Build127');
assert.ok(build072.includes("source!=='live-save'"),'guarded Build072 source missing queue provenance gate');
assert.ok(build072.includes("replayHoldReason='build145-unproven-inventory-replay'"),'guarded Build072 source missing replay quarantine');
assert.ok(build072.includes("action:'replay-held-local-only'"),'guarded Build072 source missing bootstrap local-only hold');
assert.ok(build072.includes("action:'replay-held-newer-local'"),'guarded Build072 source missing bootstrap newer-local hold');

console.log('Build145 loader activation: PASS');
