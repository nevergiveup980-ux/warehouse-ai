import crypto from 'node:crypto';

const DATASETS=['runlu_product_master_v21','runlu_inventory_records_v21','runlu_carpet_inventory_v52'];
const md5=s=>crypto.createHash('md5').update(String(s)).digest('hex');
const key=x=>String(x??'');

function minimalPayload(dataset,p={}){
  if(dataset==='runlu_product_master_v21') return {
    name:p.name??null,coverageUnit:p.coverageUnit??null,sku:p.sku??null,color:p.color??null
  };
  if(dataset==='runlu_inventory_records_v21') return {
    masterId:p.masterId??null,poNumber:p.poNumber??null,location:p.location??null,
    quantity:p.quantity??null,unit:p.unit??null,lotNumber:p.lotNumber??null
  };
  if(dataset==='runlu_carpet_inventory_v52') return {
    status:p.status??null,sourceRoll:p.sourceRoll??null,manufacturerRoll:p.manufacturerRoll??null,
    roll:p.roll??null,collection:p.collection??null,colour:p.colour??null,
    location:p.location??null,length:p.length??null,originalLength:p.originalLength??null,
    measure:p.measure??null,physicalRollId:p.physicalRollId??null
  };
  throw new Error('SNAPSHOT_UNKNOWN_DATASET:'+dataset);
}
function stableJson(v){
  if(v===null||typeof v!=='object') return JSON.stringify(v);
  if(Array.isArray(v)) return '['+v.map(stableJson).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableJson(v[k])).join(',')+'}';
}
export function liveDatasetDigest(rows,dataset){
  const live=rows.filter(r=>r.dataset_key===dataset&&!r.deleted_at).sort((a,b)=>key(a.record_id).localeCompare(key(b.record_id)));
  const joined=live.map(r=>key(r.record_id)+':'+md5(stableJson(minimalPayload(dataset,r.payload||{})))).join('|');
  return md5(joined);
}
export function verifySnapshotEnvelope(envelope){
  if(!envelope||typeof envelope!=='object'||!Array.isArray(envelope.rows)||!envelope.meta) throw new Error('SNAPSHOT_ENVELOPE_REQUIRED');
  if(envelope.meta.mode!=='READ_ONLY_V6_SNAPSHOT') throw new Error('SNAPSHOT_MODE_INVALID');
  const declared=new Map((envelope.meta.datasets||[]).map(x=>[x.dataset_key,x]));
  for(const d of DATASETS){
    const m=declared.get(d); if(!m) throw new Error('SNAPSHOT_DATASET_META_MISSING:'+d);
    const live=envelope.rows.filter(r=>r.dataset_key===d&&!r.deleted_at);
    if(live.length!==Number(m.live_rows)) throw new Error('SNAPSHOT_LIVE_COUNT_MISMATCH:'+d);
    const digest=liveDatasetDigest(envelope.rows,d);
    if(digest!==m.live_digest) throw new Error('SNAPSHOT_DIGEST_MISMATCH:'+d);
  }
  const extra=envelope.rows.filter(r=>!DATASETS.includes(r.dataset_key));
  if(extra.length) throw new Error('SNAPSHOT_UNEXPECTED_DATASET');
  return {ok:true,datasets:DATASETS.length,rows:envelope.rows.length};
}
export function snapshotRows(input){
  if(Array.isArray(input)) return input;
  verifySnapshotEnvelope(input);
  return input.rows;
}
