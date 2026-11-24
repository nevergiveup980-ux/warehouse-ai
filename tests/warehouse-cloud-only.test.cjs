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
