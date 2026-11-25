const assert = require('node:assert/strict');
const { test } = require('node:test');
require('../warehouse-cloud-only.js');

const { createSnapshot, rollQuery, matchesRoll } = global.WarehouseCloudOnly;
const carpet = (id, roll) => ({ dataset_key: 'carpet', record_id: id, version: 1, payload: { id: 7, roll } });

test('numeric and prefixed roll queries ignore historical aliases', () => {
  assert.ok(rollQuery('rc-2358'));
  assert.ok(matchesRoll({ roll: 'RC2358' }, '2358'));
  assert.ok(!matchesRoll({ roll: 'RC2388', sourceRoll: 'RC2358' }, '2358'));
});

test('pagination preserves business duplicates and assigns distinct UI identities', async () => {
  const pages = [[carpet('a', 'RC2358')], [carpet('b', 'RC2358')], []];
  const reader = createSnapshot({ keys: ['carpet'], fetchPage: async (_, offset) => pages[offset] });
  assert.equal(await reader.refresh({}), true);
  const rows = reader.read('carpet');
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0]._cloudUiId, rows[1]._cloudUiId);
  rows[0].roll = 'edited';
  assert.equal(reader.read('carpet')[0].roll, 'RC2358');
});

test('a failed refresh publishes no stale or partial data', async () => {
  let failed = false;
  const reader = createSnapshot({ keys: ['carpet'], fetchPage: async (_, offset) => {
    if (!offset) return [carpet('a', 'RC2358')];
    if (failed) throw new Error('offline');
    return [];
  } });
  assert.equal(await reader.refresh({}), true);
  failed = true;
  assert.equal(await reader.refresh({}), false);
  assert.equal(reader.status, 'error');
  assert.deepEqual(reader.read('carpet'), []);
});

test('a repeated canonical identity fails closed', async () => {
  const reader = createSnapshot({ keys: ['carpet'], fetchPage: async () => [carpet('a', 'RC2358')] });
  assert.equal(await reader.refresh({}), false);
  assert.match(reader.issue, /Repeated cloud record identity/);
});

test('command diff updates canonical identity and only the fields the form changed', () => {
  const raw = {id: 'legacy', roll: 'RC1', locationId: 'cloud-location', _cloudRecordId: 'canonical', _cloudVersion: 3, _cloudUiId: 4};
  const view = {...raw, id: 4, location: '4B'};
  assert.deepEqual(global.WarehouseCloudOnly.commandChanges('carpet',[view],[{...view,location:'5A'}],[raw]), [
    {dataset:'carpet',recordId:'canonical',version:3,payload:{id:'legacy',roll:'RC1',locationId:'cloud-location',location:'5A'}}
  ]);
});

test('a canonical edit ignores other rows with identical legacy IDs', () => {
  const rows = ['target','other-1','other-2'].map((key,i)=>({
    id: 202611162359, _cloudRecordId:key, _cloudVersion:3, length:20+i,
  }));
  const next = rows.map(row=>row._cloudRecordId==='target'?{...row,length:5.75}:row);
  assert.deepEqual(global.WarehouseCloudOnly.commandChanges('carpet',rows,next,rows),[
    {dataset:'carpet',recordId:'target',version:3,payload:{id:202611162359,length:5.75}},
  ]);
});
