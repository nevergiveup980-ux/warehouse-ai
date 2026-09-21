// RUNLU Warehouse OS V7 — Cloud Carpet Record Contract V2.
// Pure engineering contract. It does not call Supabase or write production.
//
// Future cloud invariant:
//   physicalInstanceId = immutable machine identity for one physical carpet roll.
//   record_id          = physicalInstanceId for V2 carpet records.
//   roll               = company-facing roll number (RC..., CHC...).
//   manufacturerRoll   = reference only; never identity/dedup evidence.
//   sourceRoll         = lineage reference only; never identity/dedup evidence.
// CHC022 / CHC023 are explicit legacy shared company-roll exceptions.

const trim=v=>String(v??'').trim();
const upper=v=>trim(v).toUpperCase();
const liveCarpetRows=rows=>rows.filter(r=>r.dataset_key==='runlu_carpet_inventory_v52'&&!r.deleted_at);
const SHARED_DEFAULT=['CHC022','CHC023'];

export function normalizeCloudCompanyRoll(v=''){ return upper(v); }

export function cloudCarpetIdentityKey(payload={}){
  return trim(payload.physicalInstanceId);
}

function activeV2(records=[]){
  return records.filter(r=>!r.deleted_at&&upper((r.payload||{}).status||'ACTIVE')==='ACTIVE');
}

export function evaluateCloudCarpetMutationV2({
  existingRecords=[],
  recordId,
  payload={},
  isDelete=false,
  sharedRollNumbers=SHARED_DEFAULT
}={}){
  const shared=new Set(sharedRollNumbers.map(upper));
  const id=trim(payload.physicalInstanceId);
  const rid=trim(recordId);
  const roll=upper(payload.roll);

  if(!rid) return {status:'blocked',reason:'RECORD_ID_REQUIRED'};
  if(!id) return {status:'blocked',reason:'PHYSICAL_INSTANCE_ID_REQUIRED'};
  if(rid!==id) return {status:'blocked',reason:'RECORD_ID_MUST_EQUAL_PHYSICAL_INSTANCE_ID'};
  if(!roll) return {status:'blocked',reason:'COMPANY_ROLL_NUMBER_REQUIRED'};

  const current=existingRecords.find(r=>trim(r.record_id)===rid&&!r.deleted_at);
  if(current){
    const old=current.payload||{};
    const oldId=trim(old.physicalInstanceId);
    const oldRoll=upper(old.roll);
    if(oldId&&oldId!==id) return {status:'blocked',reason:'PHYSICAL_INSTANCE_ID_IMMUTABLE'};
    if(oldRoll&&oldRoll!==roll) return {status:'review',reason:'COMPANY_ROLL_CHANGE_REQUIRES_REVIEW',from:oldRoll,to:roll};
    if(isDelete) return {status:'allowed',operation:'DELETE',identity:id,company_roll_number:roll};
    return {
      status:'allowed',operation:'UPDATE',identity:id,company_roll_number:roll,
      identity_evidence:{manufacturer_roll_used:false,source_roll_used:false}
    };
  }

  if(isDelete) return {status:'blocked',reason:'DELETE_TARGET_MISSING'};

  const peers=activeV2(existingRecords).filter(r=>{
    const p=r.payload||{};
    return trim(p.physicalInstanceId)!==id&&upper(p.roll)===roll;
  });
  if(peers.length&&!shared.has(roll)){
    return {
      status:'blocked',reason:'COMPANY_ROLL_ALREADY_ACTIVE',
      company_roll_number:roll,
      conflicting_physical_instance_ids:peers.map(r=>trim((r.payload||{}).physicalInstanceId)).filter(Boolean).sort()
    };
  }

  return {
    status:'allowed',operation:'INSERT',identity:id,company_roll_number:roll,
    shared_legacy_roll_number:shared.has(roll),
    identity_evidence:{manufacturer_roll_used:false,source_roll_used:false}
  };
}

function timeValue(v){
  if(v===null||v===undefined||v==='') return 0;
  const n=Date.parse(String(v));
  return Number.isFinite(n)?n:0;
}
function currentRow(rows){
  return [...rows].sort((a,b)=>{
    const ap=a.payload||{},bp=b.payload||{};
    const au=timeValue(ap.updatedAt)||timeValue(a.updated_at);
    const bu=timeValue(bp.updatedAt)||timeValue(b.updated_at);
    if(au!==bu) return bu-au;
    const ar=timeValue(a.updated_at),br=timeValue(b.updated_at);
    if(ar!==br) return br-ar;
    return String(b.record_id??'').localeCompare(String(a.record_id??''));
  })[0];
}

export function auditLegacyCloudCarpetRowsV2(rows,{sharedRollNumbers=SHARED_DEFAULT}={}){
  const shared=new Set(sharedRollNumbers.map(upper));
  const live=liveCarpetRows(rows);
  const active=live.filter(r=>upper((r.payload||{}).status)==='ACTIVE');
  const byAlias=new Map();
  const missingAlias=[];
  for(const r of active){
    const alias=trim((r.payload||{}).id);
    if(!alias){missingAlias.push(r);continue;}
    const g=byAlias.get(alias)||[];g.push(r);byAlias.set(alias,g);
  }

  const candidates=[];
  const conflicts=[];
  for(const [alias,members] of byAlias){
    const rolls=[...new Set(members.map(r=>upper((r.payload||{}).roll)).filter(Boolean))].sort();
    if(rolls.length!==1){
      conflicts.push({type:'LEGACY_ALIAS_ROLL_DIVERGENCE',legacy_alias:alias,roll_numbers:rolls,source_rows:members.length});
      continue;
    }
    const selected=currentRow(members),p=selected.payload||{};
    candidates.push({
      legacy_alias:alias,
      company_roll_number:rolls[0],
      source_rows:members.length,
      selected_record_id:String(selected.record_id),
      shared_legacy_roll_number:shared.has(rolls[0]),
      current_state:{location:trim(p.location)||null,length:p.length??null,measure:upper(p.measure)||null},
      references:{manufacturer_roll:trim(p.manufacturerRoll)||null,source_roll:trim(p.sourceRoll)||null}
    });
  }
  for(const r of missingAlias){
    conflicts.push({type:'LEGACY_ALIAS_MISSING',record_id:String(r.record_id),roll_numbers:[upper((r.payload||{}).roll)].filter(Boolean)});
  }

  const byRoll=new Map();
  for(const c of candidates){
    const g=byRoll.get(c.company_roll_number)||[];g.push(c);byRoll.set(c.company_roll_number,g);
  }
  const accepted=[];
  for(const [roll,members] of byRoll){
    if(members.length>1&&!shared.has(roll)){
      conflicts.push({
        type:'COMPANY_ROLL_REUSED_ACROSS_LEGACY_INSTANCES',
        company_roll_number:roll,
        legacy_aliases:members.map(x=>x.legacy_alias).sort()
      });
      continue;
    }
    accepted.push(...members);
  }

  return {
    mode:'V7_CLOUD_CARPET_RECORD_CONTRACT_V2_AUDIT',
    production_writes:0,
    contract:{
      future_record_id:'physicalInstanceId',
      physical_instance_id:'immutable',
      company_roll_field:'payload.roll',
      company_roll_normalization:'trim_uppercase',
      manufacturer_roll_role:'reference_only',
      source_roll_role:'lineage_reference_only',
      shared_legacy_roll_numbers:[...shared].sort(),
      ordinary_company_roll_cardinality:'one_active_physical_instance',
      shared_company_roll_cardinality:'multiple_active_physical_instances_allowed'
    },
    counts:{
      live_source_rows:live.length,
      active_source_rows:active.length,
      legacy_instance_aliases:byAlias.size+missingAlias.length,
      duplicate_source_rows_collapsed:active.length-(byAlias.size+missingAlias.length),
      accepted_physical_instances:accepted.length,
      conflict_groups:conflicts.length,
      accepted_distinct_company_roll_numbers:new Set(accepted.map(x=>x.company_roll_number)).size
    },
    shared_groups:[...byRoll.entries()]
      .filter(([roll])=>shared.has(roll))
      .map(([roll,members])=>({company_roll_number:roll,physical_instance_count:members.length}))
      .sort((a,b)=>a.company_roll_number.localeCompare(b.company_roll_number)),
    conflicts,
    accepted
  };
}
