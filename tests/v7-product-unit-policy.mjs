import assert from 'node:assert/strict';
import {classifySnapshot} from '../v7/snapshot-transformer.mjs';

const R=(dataset_key,record_id,payload)=>({dataset_key,record_id,payload,deleted_at:null});
const rows=[
  // Coverage says GAL, but physical inventory is counted in PAILS.
  R('runlu_product_master_v21','ADH',{name:'Adhesive',category:'Adhesive',coverageUnit:'Gallon'}),
  R('runlu_inventory_records_v21','A1',{id:'A1',masterId:'ADH',location:'1A',quantity:10,unit:'Pail',poNumber:'P1',lotNumber:''}),

  // Mixed BOX/EACH flooring: coverage may break the tie, but EACH remains secondary/conflict stock.
  R('runlu_product_master_v21','FLOOR',{name:'Floor',category:'Vinyl Plank',coverageUnit:'SF / Box'}),
  R('runlu_inventory_records_v21','F1',{id:'F1',masterId:'FLOOR',location:'2A',quantity:20,unit:'Box',poNumber:'P2',lotNumber:''}),
  R('runlu_inventory_records_v21','F2',{id:'F2',masterId:'FLOOR',location:'2B',quantity:3,unit:'Piece',poNumber:'P3',lotNumber:''}),

  // Rolled underlay with no live Inventory must not become BOX because coverage text says SF / Box.
  R('runlu_product_master_v21','PAD',{name:'Commercial Pad',category:'Underlay',coverageUnit:'SF / Box'}),

  // Coverage-only fallback still works when there is no contradictory stock evidence.
  R('runlu_product_master_v21','NOINV',{name:'No Inventory Floor',category:'Vinyl Plank',coverageUnit:'SF / Box'})
];

const m=classifySnapshot(rows);
const byId=new Map(m.products.map(x=>[x.record_id,x]));

assert.equal(byId.get('ADH').transformed.base_unit,'PAIL');
assert.equal(byId.get('ADH').transformed.coverage_unit,'Gallon');
assert.equal(byId.get('ADH').transformed.unit_resolution,'inventory_consensus');

assert.equal(byId.get('FLOOR').transformed.base_unit,'BOX');
assert.equal(byId.get('FLOOR').transformed.unit_resolution,'coverage_tiebreak');
assert.equal(m.inventory.find(x=>x.record_id==='F2').classification,'conflict');
assert.equal(m.inventory.find(x=>x.record_id==='F2').reason,'UNIT_MISMATCH_PRODUCT_BASE');

assert.equal(byId.get('PAD').transformed.base_unit,'ROLL');
assert.equal(byId.get('PAD').transformed.unit_resolution,'category_roll_rule');

assert.equal(byId.get('NOINV').transformed.base_unit,'BOX');
assert.equal(byId.get('NOINV').transformed.unit_resolution,'coverage_fallback');

console.log('V7 Product stock-unit vs coverage-unit policy: PASS');
