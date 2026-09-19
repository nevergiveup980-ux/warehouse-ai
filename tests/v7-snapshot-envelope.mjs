import fs from 'node:fs';
import assert from 'node:assert/strict';
import {liveDatasetDigest,verifySnapshotEnvelope,snapshotRows} from '../v7/snapshot-envelope.mjs';

const rows=JSON.parse(fs.readFileSync('tests/v7-db/fixtures/snapshot-small.json','utf8'));
const datasets=['runlu_product_master_v21','runlu_inventory_records_v21','runlu_carpet_inventory_v52'];
const envelope={
  meta:{
    mode:'READ_ONLY_V6_SNAPSHOT',
    snapshot_at:'2026-09-19T20:40:16Z',
    datasets:datasets.map(dataset_key=>({
      dataset_key,
      live_rows:rows.filter(r=>r.dataset_key===dataset_key&&!r.deleted_at).length,
      live_digest:liveDatasetDigest(rows,dataset_key)
    }))
  },
  rows
};
assert.deepEqual(verifySnapshotEnvelope(envelope),{ok:true,datasets:3,rows:rows.length});
assert.equal(snapshotRows(envelope),rows);

const changed=structuredClone(envelope);
changed.rows.find(r=>r.dataset_key==='runlu_inventory_records_v21').payload.quantity='999';
assert.throws(()=>verifySnapshotEnvelope(changed),/SNAPSHOT_DIGEST_MISMATCH:runlu_inventory_records_v21/);

const missing=structuredClone(envelope);
missing.rows=missing.rows.filter(r=>r.record_id!=='PRD1');
assert.throws(()=>verifySnapshotEnvelope(missing),/SNAPSHOT_LIVE_COUNT_MISMATCH:runlu_product_master_v21/);

const wrongMode=structuredClone(envelope);
wrongMode.meta.mode='PRODUCTION_WRITE';
assert.throws(()=>verifySnapshotEnvelope(wrongMode),/SNAPSHOT_MODE_INVALID/);

console.log('V7 snapshot envelope integrity contract: PASS');
