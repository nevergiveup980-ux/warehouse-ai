import assert from 'node:assert/strict';
import {classifySnapshot,normalizeLegacyUnit,productBaseUnit,carpetPhysicalKey,feetToSixteenths} from '../v7/snapshot-transformer.mjs';

assert.equal(normalizeLegacyUnit('Carton'),'BOX');
assert.equal(normalizeLegacyUnit('Piece'),'EACH');
assert.equal(normalizeLegacyUnit('Bag'),null);
assert.equal(productBaseUnit('SF / Box'),'BOX');
assert.equal(feetToSixteenths('10'),1920);
assert.equal(carpetPhysicalKey({sourceRoll:'CHC1',manufacturerRoll:'100'}),'source_mfg:CHC1|100');

const R=(dataset_key,record_id,payload,deleted_at=null)=>({dataset_key,record_id,payload,deleted_at});
const rows=[
 R('runlu_product_master_v21','PRD1',{name:'Floor A',coverageUnit:'SF / Box'}),
 R('runlu_product_master_v21','PRD2',{name:'Pad Roll',coverageUnit:'Roll'}),

 R('runlu_inventory_records_v21','I1',{masterId:'PRD1',poNumber:'PO1',location:'A',quantity:'10',unit:'Box'}),
 R('runlu_inventory_records_v21','I2',{masterId:'PRD1',poNumber:'PO1',location:'A',quantity:'10',unit:'Carton'}),
 R('runlu_inventory_records_v21','I3',{masterId:'PRD1',poNumber:'PO2',location:'A',quantity:'1',unit:'Piece'}),
 R('runlu_inventory_records_v21','I4',{masterId:'PRD1',poNumber:'PO3',location:'A',quantity:'0',unit:'Box'}),
 R('runlu_inventory_records_v21','I5',{masterId:'MISSING',poNumber:'PO4',location:'A',quantity:'2',unit:'Box'}),
 R('runlu_inventory_records_v21','I6',{masterId:'PRD2',poNumber:'PO5',location:'B',quantity:'3',unit:'Roll'}),
 R('runlu_inventory_records_v21','I7',{masterId:'PRD1',poNumber:'PO6',location:'PHYSICAL COUNT REQUIRED',quantity:'2',unit:'Box'}),

 R('runlu_carpet_inventory_v52','C1',{status:'Active',sourceRoll:'CHC1',manufacturerRoll:'100',roll:'CHC1',collection:'Classic',colour:'Blue',location:'13C',length:'10',originalLength:'10',measure:'FULL'}),
 R('runlu_carpet_inventory_v52','C2',{status:'Active',sourceRoll:'CHC1',manufacturerRoll:'100',roll:'CHC1',collection:'Classic',colour:'Blue',location:'13C',length:'10',originalLength:'10',measure:'FULL'}),
 R('runlu_carpet_inventory_v52','C3',{status:'Active',sourceRoll:'CHC1',manufacturerRoll:'101',roll:'CHC1',collection:'Classic',colour:'Blue',location:'13C',length:'8',originalLength:'10',measure:'CAL'}),
 R('runlu_carpet_inventory_v52','C4',{status:'Active',sourceRoll:'CHC2',manufacturerRoll:'200',roll:'CHC2',collection:'Series A',colour:'Red',location:'13C',length:'10',originalLength:'10',measure:'FULL'}),
 R('runlu_carpet_inventory_v52','C5',{status:'Active',sourceRoll:'CHC2',manufacturerRoll:'201',roll:'CHC2',collection:'Series B',colour:'Red',location:'13C',length:'10',originalLength:'10',measure:'FULL'}),
 R('runlu_carpet_inventory_v52','C6',{status:'Active',sourceRoll:'CHC3',roll:'CHC3',collection:'Series C',colour:'Grey',location:'13C',length:'5',originalLength:'10',measure:'TM'}),
 R('runlu_carpet_inventory_v52','C7',{status:'Active',sourceRoll:'CHC4',manufacturerRoll:'400',roll:'CHC4',collection:'Series D',colour:'Tan',location:'',length:'5',originalLength:'10',measure:'CAL'}),
 R('runlu_carpet_inventory_v52','C8',{status:'Pending',sourceRoll:'CHC5',manufacturerRoll:'500',roll:'CHC5',collection:'Series E',colour:'Black',location:'13C',length:'0',originalLength:'0',measure:'TM'})
];

const m=classifySnapshot(rows);
assert.deepEqual(m.summary.products,{valid:2});
assert.deepEqual(m.summary.inventory,{duplicate:2,conflict:1,deferred:2,orphan:1,valid:1});
assert.deepEqual(m.summary.derived_carpet_products,{valid:4,conflict:1});
assert.deepEqual(m.summary.carpet,{duplicate:2,valid:1,conflict:2,deferred:2,orphan:1});
assert.deepEqual(m.summary.locations,{valid:3});
assert.equal(m.carpet.find(x=>x.record_id==='C3').transformed.remaining_sixteenths,1536);
assert.equal(m.carpet.find(x=>x.record_id==='C3').transformed.physical_key,'source_mfg:CHC1|101');
assert.equal(m.inventory.find(x=>x.record_id==='I2').transformed.unit,'BOX');
assert.equal(m.inventory.find(x=>x.record_id==='I7').reason,'LOCATION_REQUIRES_REVIEW');
assert.equal(m.derived_carpet_products.find(x=>x.record_id==='CARPET_SOURCE:CHC2').classification,'conflict');

console.log('V7 snapshot transformer classification contract: PASS');
