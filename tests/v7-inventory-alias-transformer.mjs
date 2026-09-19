import assert from 'node:assert/strict';
import {classifySnapshot} from '../v7/snapshot-transformer.mjs';

const R=(dataset_key,record_id,payload,deleted_at=null)=>({dataset_key,record_id,payload,deleted_at});
const rows=[
  R('runlu_product_master_v21','PRD-A',{name:'Floor A',coverageUnit:'SF / Box'}),

  // Safe alias replay: one wrapper explicitly points to a peer record_id.
  R('runlu_inventory_records_v21','LEG-A',{
    id:'LEG-A',masterId:'PRD-A',poNumber:'PO-A',location:'A1',quantity:10,unit:'Carton',
    lotNumber:'LOT-A',notes:'same',locationType:'Rack'
  }),
  R('runlu_inventory_records_v21','INV-A',{
    id:'LEG-A',inventoryId:'INV-A',lifecycleStatus:'ACTIVE',transactionCount:0,
    masterId:'PRD-A',poNumber:'PO-A',location:'A1',quantity:10,unit:'Box',
    lotNumber:'LOT-A',notes:'same',locationType:'Rack'
  }),

  // Same legacy id with divergent business state: never auto-select a state.
  R('runlu_inventory_records_v21','INV-D-OLD',{
    id:'LEG-D',inventoryId:'INV-D-OLD',lifecycleStatus:'ACTIVE',transactionCount:0,
    masterId:'PRD-A',poNumber:'PO-D',location:'B1',quantity:4,unit:'Box',
    lotNumber:'LOT-D',notes:'state',locationType:'Rack'
  }),
  R('runlu_inventory_records_v21','LEG-D',{
    id:'LEG-D',masterId:'PRD-A',poNumber:'PO-D',location:'B2',quantity:5,unit:'Carton',
    lotNumber:'LOT-D',notes:'state',locationType:'Rack'
  }),
  R('runlu_inventory_records_v21','INV-D',{
    id:'LEG-D',inventoryId:'INV-D',lifecycleStatus:'ACTIVE',transactionCount:0,
    masterId:'PRD-A',poNumber:'PO-D',location:'B2',quantity:5,unit:'Box',
    lotNumber:'LOT-D',notes:'state',locationType:'Rack'
  }),

  // Duplicate business state without an explicit alias edge stays quarantined.
  R('runlu_inventory_records_v21','G1',{
    id:'G1',masterId:'PRD-A',poNumber:'PO-G',location:'C1',quantity:7,unit:'Box',
    lotNumber:'LOT-G',notes:'same',locationType:'Rack'
  }),
  R('runlu_inventory_records_v21','G2',{
    id:'G2',masterId:'PRD-A',poNumber:'PO-G',location:'C1',quantity:7,unit:'Carton',
    lotNumber:'LOT-G',notes:'same',locationType:'Rack'
  })
];

const m=classifySnapshot(rows);
assert.deepEqual(m.summary.products,{valid:1});
assert.deepEqual(m.summary.inventory,{duplicate:4,conflict:3});
assert.deepEqual(m.summary.derived_inventory_items,{valid:1});

const d=m.derived_inventory_items[0];
assert.equal(d.record_id,'INVENTORY_ALIAS:LEG-A');
assert.equal(d.transformed.product_legacy_record_id,'PRD-A');
assert.equal(d.transformed.location_code,'A1');
assert.equal(d.transformed.quantity,10);
assert.equal(d.transformed.unit,'BOX');
assert.deepEqual(d.source_payload.member_record_ids,['INV-A','LEG-A']);

for(const id of ['LEG-A','INV-A']){
  const x=m.inventory.find(v=>v.record_id===id);
  assert.equal(x.classification,'duplicate');
  assert.equal(x.reason,'INVENTORY_LEGACY_ALIAS_REPLAY');
  assert.equal(x.derived_group_id,'INVENTORY_ALIAS:LEG-A');
}
for(const id of ['INV-D-OLD','LEG-D','INV-D']){
  const x=m.inventory.find(v=>v.record_id===id);
  assert.equal(x.classification,'conflict');
  assert.equal(x.reason,'INVENTORY_ID_STATE_DIVERGENCE');
}
for(const id of ['G1','G2']){
  const x=m.inventory.find(v=>v.record_id===id);
  assert.equal(x.classification,'duplicate');
  assert.equal(x.reason,'DUPLICATE_BUSINESS_TUPLE_REVIEW');
}

console.log('V7 strict Inventory alias recovery contract: PASS');
