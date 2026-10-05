import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=fs.readFileSync('index.html','utf8');
const v7=fs.readFileSync('v7/warehouse-v7.html','utf8');
// V8 restored the operational shell as the production entry. The retired V7
// launch banner must not be reintroduced just to satisfy the old rollout test.
assert.match(root,/<title>RUNLU Warehouse Command Center V8 Pilot<\/title>/);
assert.match(root,/<script src="v8-compat\.js\?[^"]+"/);
assert.match(root,/function v8InstallCompatibility\(/);
assert.doesNotMatch(root,/id="v7ProductionLaunch"/);
assert.match(v7,/Production Command Center/);
assert.match(v7,/production-api-client\.js/);
console.log('V8 production entry and retained V7 command center contract: PASS');
