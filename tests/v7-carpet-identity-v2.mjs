import assert from 'node:assert/strict';
import {normalizeCompanyRollNumber,reconcileCarpetIdentity} from '../v7/carpet-identity-v2.mjs';

const R=(record_id,payload,updated_at='2026-09-20T00:00:00Z')=>({
  dataset_key:'runlu_carpet_inventory_v52',record_id,payload,updated_at,deleted_at:null
});

assert.equal(normalizeCompanyRollNumber(' rc2322 '),'RC2322');

const rows=[
  // Normal company roll duplicated by source replay -> one physical instance.
  R('RC100',{id:'A',roll:'rc100',status:'Active',collection:'Style',colour:'Blue',location:'2A',length:100,originalLength:100,measure:'FULL',manufacturerRoll:'M1',sourceRoll:'IGNORED'}),
  R('A',{id:'A',roll:'RC100',status:'Active',collection:'Style',colour:'Blue',location:'2A',length:100,originalLength:100,measure:'FULL',manufacturerRoll:'DIFFERENT',sourceRoll:'DIFFERENT'}),

  // Same legacy instance, newer state after a cut -> still one physical roll; newest state wins.
  R('RC200',{id:'B',roll:'RC200',status:'Active',collection:'Style',colour:'Tan',location:'3D',length:80,originalLength:120,measure:'CAL',updatedAt:'2026-09-01T00:00:00Z'}),
  R('B',{id:'B',roll:'RC200',status:'Active',collection:'Style',colour:'Tan',location:'3D',length:51,originalLength:120,measure:'CAL',updatedAt:'2026-09-15T00:00:00Z'}),

  // Historical shared company number: two physical instances are allowed.
  R('C1',{id:'C1',roll:'CHC022',status:'Active',collection:'Classic',colour:'Grey',location:'12C',length:170,originalLength:170,measure:'FULL'}),
  R('C1-copy',{id:'C1',roll:'CHC022',status:'Active',collection:'Classic',colour:'Grey',location:'12C',length:170,originalLength:170,measure:'FULL'}),
  R('C2',{id:'C2',roll:'CHC022',status:'Active',collection:'Classic',colour:'Grey',location:'14D',length:145,originalLength:145,measure:'FULL'}),

  // Normal roll reused by two physical instance aliases -> quarantine.
  R('D1',{id:'D1',roll:'RC300',status:'Active',collection:'A',colour:'B',location:'1A',length:10,originalLength:10,measure:'FULL'}),
  R('D2',{id:'D2',roll:'RC300',status:'Active',collection:'A',colour:'B',location:'1B',length:10,originalLength:10,measure:'FULL'}),

  // One legacy instance carrying two roll strings -> quarantine.
  R('E-old',{id:'E',roll:'RC400',status:'Active',collection:'A',colour:'C',location:'4A',length:20,originalLength:20,measure:'FULL'}),
  R('E-new',{id:'E',roll:'RC4000',status:'Active',collection:'A',colour:'C',location:'4A',length:20,originalLength:20,measure:'FULL'}),

  // Non-active history must not inflate current physical inventory.
  R('USED',{id:'F',roll:'RC500',status:'Used Up',collection:'A',colour:'D',location:'',length:0,originalLength:100,measure:'TM'})
];

const out=reconcileCarpetIdentity(rows);
assert.equal(out.production_writes,0);
assert.equal(out.identity_contract.manufacturer_roll_role,'reference_only');
assert.equal(out.identity_contract.source_roll_role,'lineage_reference_only');
assert.deepEqual(out.identity_contract.shared_legacy_roll_numbers,['CHC022','CHC023']);
assert.equal(out.counts.active_source_rows,12);
assert.equal(out.counts.legacy_instance_candidates,7);
assert.equal(out.counts.duplicate_source_rows_collapsed,5);
assert.equal(out.counts.accepted_physical_instances,4);
assert.equal(out.counts.conflict_groups,2);
assert.equal(out.counts.accepted_distinct_company_roll_numbers,3);
assert.equal(out.shared_roll_groups.find(x=>x.company_roll_number==='CHC022').physical_instance_count,2);
assert.equal(out.physical_instances.find(x=>x.company_roll_number==='RC200').current_state.length,51);
assert.ok(out.conflicts.some(x=>x.type==='COMPANY_ROLL_REUSED_ACROSS_PHYSICAL_INSTANCES'&&x.company_roll_number==='RC300'));
assert.ok(out.conflicts.some(x=>x.type==='LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE'&&x.legacy_instance_id==='E'));

console.log('V7 carpet company-roll identity V2 contract: PASS');
