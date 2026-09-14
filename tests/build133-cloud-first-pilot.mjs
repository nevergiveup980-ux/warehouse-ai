import fs from 'node:fs';
import assert from 'node:assert/strict';

const src=fs.readFileSync('build133-cloud-first-pilot.js','utf8');
const loader=fs.readFileSync('release-loader.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const authority=fs.readFileSync('build082-version-authority.js','utf8');

assert.match(src,/V6\.13\.0 Build133/);
assert.match(src,/warehouse_records\?select=/,'Build133 must read the record-level Cloud Master');
assert.match(src,/warehouse_apply_mutation/,'Build133 must write through the Cloud Master RPC');
assert.match(src,/_runluDeleteIntent:'explicit-user-delete'/,'explicit deletes must retain Build122 safety intent');
assert.match(src,/function flushLegacyQueue\(/,'existing pending Cloud Master work must be flushed before cutover');
assert.match(src,/function verifyCloud\(/,'essential cloud datasets must be verified before local purge');
assert.match(src,/purgePhysicalCompanyData\(\)/,'verified cutover must remove persistent company datasets');
assert.match(src,/runlu_warehouse_resilient_cache_v129/,'old draft recovery cache must be retired after cloud migration');
assert.match(src,/runlu_local_archive_v131/,'old device business archive must be retired after cloud migration');
assert.match(src,/Offline company-data queue:<\/b> Disabled during pilot/,'pilot must explicitly disable offline company-data queueing');
assert.match(src,/Saving draft to Cloud/,'operation drafts must save to cloud');
assert.match(src,/Draft not saved · Retry/,'draft failure must not claim success');
assert.match(src,/Cloud Live ✓/,'header must expose live cloud authority');

const flushAt=src.indexOf('await flushLegacyQueue()');
const verifyAt=src.indexOf('await verifyCloud(rows)');
const purgeAt=src.indexOf('purgePhysicalCompanyData();');
assert.ok(flushAt>0 && verifyAt>flushAt && purgeAt>verifyAt,'cutover order must be flush -> verify -> purge');

const releaseMatch=loader.match(/const RELEASE='(\d+)'/);
assert.ok(releaseMatch,'release loader must expose a numeric release token');
assert.ok(Number(releaseMatch[1])>=133,'Build133 regression may run under Build133 or any later release');
const build133At=loader.indexOf("'build133-cloud-first-pilot.js'");
const authorityAt=loader.indexOf("'build082-version-authority.js'");
assert.ok(build133At>0 && authorityAt>build133At,'Build133 must remain loaded before version authority');

const currentBuild=Number(version.build||0);
assert.ok(currentBuild>=133,'stable manifest must remain Build133 or later');
assert.equal(version.channel,'stable');
const parts=String(version.version||'0').split('.').map(n=>Number(n)||0);
assert.ok(parts[0]>6 || (parts[0]===6 && (parts[1]>13 || (parts[1]===13 && parts[2]>=0))),'stable version must remain V6.13.0 or later');
assert.match(authority,new RegExp(`version:'${String(version.version).replace(/\./g,'\\.')}', build:'${String(version.build)}'`),'version authority must match the current stable manifest');

console.log('Build133 Cloud-First regression checks passed.');
