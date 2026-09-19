import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync('v7/incremental-shadow-bridge.ts','utf8');

for (const x of [
  'warehouse-v7-incremental-shadow.yml',
  'warehouse-v7-incremental-shadow',
  'refs/heads/warehouse-v7-foundation',
  'refs/heads/main',
  'ALLOWED_WORKFLOW_REFS',
  'warehouse_v7_shadow.watermark',
  'production_business_writes: 0',
  'updated_at::text as updated_at_text',
  'cross join warehouse_v7_shadow.watermark w',
  '(r.updated_at,r.dataset_key,r.record_id) >',
  'string_agg(x,chr(10) order by ord)',
  'WATERMARK_CAS_MISMATCH',
  'BATCH_REVALIDATION_FINGERPRINT_MISMATCH',
  'supplier: p.supplier ?? null',
  'po: p.po ?? null',
  'INCREMENTAL_SHADOW_WATERMARK_COMMIT'
]) assert.ok(s.includes(x), x);

assert.doesNotMatch(s,/committed_updated_at=\$\{last\.updated_at\}/);
assert.doesNotMatch(s,/toISOString\(\).*watermark|updated_at:.*toISOString\(\)/i);
assert.doesNotMatch(s,/insert\s+into\s+public\.warehouse_records|update\s+public\.warehouse_records|delete\s+from\s+public\.warehouse_records/i);

console.log('V7 incremental shadow bridge contract: PASS');
