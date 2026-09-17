import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../build072-hotfix.js',import.meta.url),'utf8');
const must=[
  "function enqueue(dataset,id,op,payload,baseVersion)",
  "function diffAndQueue(dataset,before,after)",
  "function captureLocalDelta(rows)",
  "async function flushQueue(s,{allowShadow=false}={})",
  "const res=await applyMutation(s,m)"
];
for(const x of must)assert.ok(s.includes(x),'Build072 integration anchor missing: '+x);
assert.ok(s.includes("const QUEUE='runlu_cloud_master_offline_queue_v680'"),'queue identity changed');
assert.ok(s.includes("const PM='runlu_product_master_v21', INV='runlu_inventory_records_v21'"),'Inventory identity changed');
console.log('Build145 Build072 core integration anchors: PASS');
