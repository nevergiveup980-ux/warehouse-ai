import fs from'node:fs';import assert from'node:assert/strict';
const files=['receiving','transfer','cut','shipping','return'].map(x=>fs.readFileSync('v7/'+x+'-engine-1.0.sql','utf8'));
const all=files.join('\n');
for(const s of files){assert.match(s,/begin_command/);assert.match(s,/commit_command/);assert.match(s,/status='committed'/);}
for(const banned of [/localStorage/i,/global_pause/i,/cloud_master/i,/delete from warehouse_v7\.event/i,/delete from warehouse_v7\.inventory_movement/i])assert.doesNotMatch(all,banned);
assert.ok((all.match(/for update/g)||[]).length>=4);
assert.ok((all.match(/insert into warehouse_v7\.event/g)||[]).length===7);
assert.ok((all.match(/insert into warehouse_v7\.inventory_movement/g)||[]).length===7);
const doc=fs.readFileSync('v7/CORE_LIFECYCLE_ATTACK_SUITE_1_0.md','utf8');
for(let i=1;i<=24;i++)assert.ok(doc.includes('A'+String(i).padStart(2,'0')));
console.log('V7 Core Lifecycle Attack Suite static gate: PASS');