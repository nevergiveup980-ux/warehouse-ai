// V7 Carpet Identity V2 — read-only migration reconciliation.
// Warehouse-facing identity is the company roll number. Manufacturer roll is reference-only.
// Legacy payload.id is used only to collapse repeated source rows during migration.
// CHC022 / CHC023 are explicit legacy shared roll-number exceptions.

const key=(v)=>String(v??'').trim();
const upper=(v)=>key(v).toUpperCase();
const liveCarpets=(rows)=>rows.filter(r=>r.dataset_key==='runlu_carpet_inventory_v52'&&!r.deleted_at);

function timeValue(v){
  if(v===null||v===undefined||v==='') return 0;
  const n=Date.parse(String(v));
  return Number.isFinite(n)?n:0;
}

function currentRow(members){
  return [...members].sort((a,b)=>{
    const ap=a.payload||{}, bp=b.payload||{};
    const au=timeValue(ap.updatedAt)||timeValue(a.updated_at);
    const bu=timeValue(bp.updatedAt)||timeValue(b.updated_at);
    if(au!==bu) return bu-au;
    const ar=timeValue(a.updated_at), br=timeValue(b.updated_at);
    if(ar!==br) return br-ar;
    return String(b.record_id??'').localeCompare(String(a.record_id??''));
  })[0];
}

export function normalizeCompanyRollNumber(v=''){
  return upper(v);
}

export function reconcileCarpetIdentity(rows,{sharedRollNumbers=['CHC022','CHC023']}={}){
  const shared=new Set(sharedRollNumbers.map(upper));
  const carpets=liveCarpets(rows);
  const active=carpets.filter(r=>upper((r.payload||{}).status)==='ACTIVE');

  const byLegacyInstance=new Map();
  const weak=[];
  for(const r of active){
    const p=r.payload||{};
    const pid=key(p.id);
    if(!pid){ weak.push(r); continue; }
    const g=byLegacyInstance.get(pid)||[];g.push(r);byLegacyInstance.set(pid,g);
  }

  const candidates=[];
  const conflicts=[];

  for(const [legacyInstanceId,members] of byLegacyInstance){
    const rolls=[...new Set(members.map(r=>normalizeCompanyRollNumber((r.payload||{}).roll)).filter(Boolean))].sort();
    if(rolls.length!==1){
      const selected=currentRow(members);
      const p=selected.payload||{};
      conflicts.push({
        type:'LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE',
        legacy_instance_id:legacyInstanceId,
        roll_numbers:rolls,
        source_record_ids:members.map(r=>String(r.record_id)).sort(),
        selected_source_record_id:String(selected.record_id),
        source_row_count:members.length,
        current_state:{
          collection:key(p.collection)||null,
          colour:key(p.colour)||null,
          location:key(p.location)||null,
          length:p.length??null,
          original_length:p.originalLength??null,
          measure:upper(p.measure)||null,
          status:upper(p.status)||null,
          payload_updated_at:p.updatedAt??null,
          row_updated_at:selected.updated_at??null
        },
        references:{
          manufacturer_roll:key(p.manufacturerRoll)||null,
          source_roll:key(p.sourceRoll)||null,
          physical_roll_id:key(p.physicalRollId)||null
        }
      });
      continue;
    }
    const selected=currentRow(members);
    const p=selected.payload||{};
    candidates.push({
      legacy_instance_id:legacyInstanceId,
      company_roll_number:rolls[0],
      shared_legacy_roll_number:shared.has(rolls[0]),
      selected_source_record_id:String(selected.record_id),
      collapsed_source_record_ids:members.map(r=>String(r.record_id)).sort(),
      source_row_count:members.length,
      current_state:{
        collection:key(p.collection)||null,
        colour:key(p.colour)||null,
        location:key(p.location)||null,
        length:p.length??null,
        original_length:p.originalLength??null,
        measure:upper(p.measure)||null,
        status:upper(p.status)||null,
        payload_updated_at:p.updatedAt??null,
        row_updated_at:selected.updated_at??null
      },
      references:{
        manufacturer_roll:key(p.manufacturerRoll)||null,
        source_roll:key(p.sourceRoll)||null,
        physical_roll_id:key(p.physicalRollId)||null
      }
    });
  }

  for(const r of weak){
    conflicts.push({
      type:'LEGACY_INSTANCE_ID_MISSING',
      source_record_ids:[String(r.record_id)],
      roll_numbers:[normalizeCompanyRollNumber((r.payload||{}).roll)].filter(Boolean)
    });
  }

  const byRoll=new Map();
  for(const c of candidates){
    const g=byRoll.get(c.company_roll_number)||[];g.push(c);byRoll.set(c.company_roll_number,g);
  }

  const accepted=[];
  for(const [roll,members] of byRoll){
    if(members.length>1&&!shared.has(roll)){
      conflicts.push({
        type:'COMPANY_ROLL_REUSED_ACROSS_PHYSICAL_INSTANCES',
        company_roll_number:roll,
        legacy_instance_ids:members.map(x=>x.legacy_instance_id).sort(),
        source_record_ids:members.flatMap(x=>x.collapsed_source_record_ids).sort()
      });
      continue;
    }
    accepted.push(...members);
  }

  const sharedGroups=[...byRoll.entries()]
    .filter(([roll,members])=>shared.has(roll)&&members.length>0)
    .map(([roll,members])=>({
      company_roll_number:roll,
      physical_instance_count:members.length,
      legacy_instance_ids:members.map(x=>x.legacy_instance_id).sort()
    }))
    .sort((a,b)=>a.company_roll_number.localeCompare(b.company_roll_number));

  return {
    mode:'V7_CARPET_IDENTITY_V2_REHEARSAL',
    production_writes:0,
    identity_contract:{
      warehouse_identity:'company_roll_number',
      company_roll_source:'payload.roll',
      manufacturer_roll_role:'reference_only',
      source_roll_role:'lineage_reference_only',
      legacy_payload_id_role:'migration_alias_only',
      shared_legacy_roll_numbers:[...shared].sort()
    },
    counts:{
      live_source_rows:carpets.length,
      active_source_rows:active.length,
      legacy_instance_candidates:byLegacyInstance.size+weak.length,
      duplicate_source_rows_collapsed:active.length-(byLegacyInstance.size+weak.length),
      accepted_physical_instances:accepted.length,
      conflict_groups:conflicts.length,
      accepted_distinct_company_roll_numbers:new Set(accepted.map(x=>x.company_roll_number)).size
    },
    shared_roll_groups:sharedGroups,
    conflicts,
    physical_instances:accepted.sort((a,b)=>
      a.company_roll_number.localeCompare(b.company_roll_number)||
      a.legacy_instance_id.localeCompare(b.legacy_instance_id)
    )
  };
}
