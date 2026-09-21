import assert from 'node:assert/strict';
import {evaluateCloudCarpetMutationV2,auditLegacyCloudCarpetRowsV2} from '../v7/cloud-carpet-record-contract-v2.mjs';

const rec=(id,roll,extra={})=>({record_id:id,deleted_at:null,payload:{physicalInstanceId:id,roll,status:'Active',...extra}});

// Same physical instance: location/length changes are normal UPDATEs.
let existing=[rec('P1','RC2322',{location:'2A',length:100,manufacturerRoll:'M-OLD'})];
let r=evaluateCloudCarpetMutationV2({
  existingRecords:existing,recordId:'P1',
  payload:{physicalInstanceId:'P1',roll:'rc2322',status:'Active',location:'4B',length:71,manufacturerRoll:'M-NEW'}
});
assert.equal(r.status,'allowed');assert.equal(r.operation,'UPDATE');
assert.equal(r.identity_evidence.manufacturer_roll_used,false);

// Manufacturer/source duplicates do not define identity.
existing=[
  rec('P1','RC100',{manufacturerRoll:'M1',sourceRoll:'SRC'}),
  rec('P2','RC101',{manufacturerRoll:'M1',sourceRoll:'SRC'})
];
r=evaluateCloudCarpetMutationV2({existingRecords:existing,recordId:'P3',payload:{physicalInstanceId:'P3',roll:'RC102',status:'Active',manufacturerRoll:'M1',sourceRoll:'SRC'}});
assert.equal(r.status,'allowed');

// Ordinary company roll cannot be assigned to two active physical instances.
r=evaluateCloudCarpetMutationV2({existingRecords:[rec('P1','RC200')],recordId:'P2',payload:{physicalInstanceId:'P2',roll:'RC200',status:'Active'}});
assert.equal(r.status,'blocked');assert.equal(r.reason,'COMPANY_ROLL_ALREADY_ACTIVE');

// CHC022/CHC023 explicitly allow multiple physical instances.
r=evaluateCloudCarpetMutationV2({existingRecords:[rec('C1','CHC022')],recordId:'C2',payload:{physicalInstanceId:'C2',roll:'CHC022',status:'Active'}});
assert.equal(r.status,'allowed');assert.equal(r.shared_legacy_roll_number,true);

// Identity is immutable and record_id must equal it.
r=evaluateCloudCarpetMutationV2({existingRecords:[],recordId:'ROW-X',payload:{physicalInstanceId:'P9',roll:'RC900',status:'Active'}});
assert.equal(r.status,'blocked');assert.equal(r.reason,'RECORD_ID_MUST_EQUAL_PHYSICAL_INSTANCE_ID');
r=evaluateCloudCarpetMutationV2({existingRecords:[rec('P8','RC800')],recordId:'P8',payload:{physicalInstanceId:'P8',roll:'RC801',status:'Active'}});
assert.equal(r.status,'review');assert.equal(r.reason,'COMPANY_ROLL_CHANGE_REQUIRES_REVIEW');

// Legacy audit collapses duplicate source rows by payload.id and honors shared CHC.
const L=(record_id,payload,updated_at='2026-09-20T00:00:00Z')=>({dataset_key:'runlu_carpet_inventory_v52',record_id,payload,updated_at,deleted_at:null});
const rows=[
  L('A-wrap',{id:'A',roll:'RC100',status:'Active',location:'1A',length:100,measure:'FULL'}),
  L('A',{id:'A',roll:'RC100',status:'Active',location:'2A',length:80,measure:'CAL',updatedAt:'2026-09-19T00:00:00Z'}),
  L('C1-wrap',{id:'C1',roll:'CHC022',status:'Active',location:'12C',length:150,measure:'FULL'}),
  L('C1',{id:'C1',roll:'CHC022',status:'Active',location:'12C',length:150,measure:'FULL'}),
  L('C2-wrap',{id:'C2',roll:'CHC022',status:'Active',location:'14D',length:140,measure:'FULL'}),
  L('C2',{id:'C2',roll:'CHC022',status:'Active',location:'14D',length:140,measure:'FULL'}),
  L('BAD1',{id:'D',roll:'RC500',status:'Active'}),
  L('BAD2',{id:'D',roll:'RC5000',status:'Active'})
];
const a=auditLegacyCloudCarpetRowsV2(rows);
assert.equal(a.production_writes,0);
assert.equal(a.contract.manufacturer_roll_role,'reference_only');
assert.equal(a.contract.source_roll_role,'lineage_reference_only');
assert.equal(a.counts.active_source_rows,8);
assert.equal(a.counts.legacy_instance_aliases,4);
assert.equal(a.counts.duplicate_source_rows_collapsed,4);
assert.equal(a.counts.accepted_physical_instances,3);
assert.equal(a.counts.conflict_groups,1);
assert.equal(a.shared_groups.find(x=>x.company_roll_number==='CHC022').physical_instance_count,2);

console.log('V7 cloud carpet record contract V2: PASS');
