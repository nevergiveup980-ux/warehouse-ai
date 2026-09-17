import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../build072-hotfix.js',import.meta.url),'utf8');

const must=[
  "function enqueue(dataset,id,op,payload,baseVersion,source='')",
  "function diffAndQueue(dataset,before,after)",
  "function captureLocalDelta(rows)",
  "async function flushQueue(s,{allowShadow=false}={})",
  "dataset===INV?'live-save':''",
  "action:'replay-held-local-only'",
  "action:'replay-held-newer-local'",
  "m.datasetKey===INV&&m.op==='upsert'&&m.source!=='live-save'",
  "m.replayHeld=true",
  "m.replayHoldReason='build145-unproven-inventory-replay'",
  "const res=await applyMutation(s,m)"
];
for(const x of must)assert.ok(s.includes(x),'Build072 integrated guard missing: '+x);

assert.ok(s.includes("const QUEUE='runlu_cloud_master_offline_queue_v680'"),'queue identity changed');
assert.ok(s.includes("const PM='runlu_product_master_v21', INV='runlu_inventory_records_v21'"),'Inventory identity changed');
assert.ok(s.includes('if(m.blocked||m.replayHeld)continue;'),'held queue must be preserved and skipped');
assert.ok(!s.includes("m.replayHeld=true;m.blocked=true"),'replay hold must not become a user conflict');

const holdPos=s.indexOf("m.datasetKey===INV&&m.op==='upsert'&&m.source!=='live-save'");
const rpcPos=s.indexOf('const res=await applyMutation(s,m)');
assert.ok(holdPos>=0&&rpcPos>holdPos,'replay hold must run before Cloud mutation RPC');

console.log('Build145 materialized Build072 core integration: PASS');
