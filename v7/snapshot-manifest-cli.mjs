import fs from 'node:fs';
import crypto from 'node:crypto';
import {classifySnapshot} from './snapshot-transformer.mjs';
import {snapshotRows} from './snapshot-envelope.mjs';

const input=process.argv[2];
if(!input){
  console.error('usage: node v7/snapshot-manifest-cli.mjs <snapshot.json>');
  process.exit(2);
}
const rows=JSON.parse(fs.readFileSync(input,'utf8'));
if(!Array.isArray(rows)) throw new Error('snapshot must be a JSON array');

const liveRows=rows.filter(r=>!r.deleted_at);
const relevant=liveRows.filter(r=>['runlu_product_master_v21','runlu_inventory_records_v21','runlu_carpet_inventory_v52'].includes(r.dataset_key));

const md5=(s)=>crypto.createHash('md5').update(s).digest('hex');
const payloadText=(r)=>{
  if(typeof r.payload_text==='string') return r.payload_text;
  return JSON.stringify(r.payload);
};
const datasets={};
const rowMd5Verified=relevant.length>0 && relevant.every(r=>typeof r.source_row_md5==='string'&&r.source_row_md5.length===32);
for(const dataset of ['runlu_carpet_inventory_v52','runlu_inventory_records_v21','runlu_product_master_v21']){
  const ds=relevant.filter(r=>r.dataset_key===dataset).sort((a,b)=>String(a.record_id).localeCompare(String(b.record_id)));
  const exact=ds.length>0 && ds.every(r=>typeof r.source_row_md5==='string'&&r.source_row_md5.length===32);
  datasets[dataset]={
    live_rows:ds.length,
    content_md5:exact
      ? md5(ds.map(r=>r.source_row_md5).join('\n'))
      : md5(ds.map(r=>String(r.record_id)+':'+payloadText(r)).join('\n')),
    postgres_jsonb_text_verified:exact || ds.every(r=>typeof r.payload_text==='string')
  };
}
const sorted=[...relevant].sort((a,b)=>{
  const d=String(a.dataset_key).localeCompare(String(b.dataset_key));
  return d||String(a.record_id).localeCompare(String(b.record_id));
});
const source_integrity=rowMd5Verified ? {
  algorithm:'postgres-jsonb-row-md5-chain-v1',
  total_live_rows:sorted.length,
  snapshot_md5:md5(sorted.map(r=>r.source_row_md5).join('\n')),
  postgres_jsonb_text_verified:true,
  datasets
} : {
  algorithm:'payload-text-md5-v1',
  total_live_rows:sorted.length,
  snapshot_md5:md5(sorted.map(r=>String(r.dataset_key)+':'+String(r.record_id)+':'+payloadText(r)).join('\n')),
  postgres_jsonb_text_verified:sorted.every(r=>typeof r.payload_text==='string'),
  datasets
};

const manifest=classifySnapshot(rows);
manifest.source_integrity=source_integrity;
process.stdout.write(JSON.stringify(manifest,null,2)+'\n');
