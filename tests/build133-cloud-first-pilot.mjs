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

assert.match(loader,/const RELEASE='133'/);
assert.match(loader,/build132-navigation-quota-guard\.js'[\s\S]*build133-cloud-first-pilot\.js'[\s\S]*build082-version-authority\.js'/,'Build133 must load after prior safety layers and before version authority');
assert.equal(version.version,'6.13.0');
assert.equal(version.build,'133');
assert.equal(version.channel,'stable');
assert.match(authority,/version:'6\.13\.0', build:'133'/);

console.log('Build133 Cloud-First regression checks passed.');
