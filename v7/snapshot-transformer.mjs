import {deerfootFieldDecision} from './deerfoot-field-verification-2026-09-22.mjs';
// Warehouse OS V7 read-only snapshot transformer.
// Input: rows shaped like public.warehouse_records.
// Output: migration manifest only. Never writes production.

export function normalizeLegacyUnit(v=''){
  const k=String(v).trim().toLowerCase();
  return ({box:'BOX',carton:'BOX',piece:'EACH',each:'EACH',pail:'PAIL',bucket:'BUCKET',tube:'TUBE',roll:'ROLL',gal:'GAL',gallon:'GAL','1/16_in':'1/16_IN'})[k]||null;
}
export function productBaseUnit(v=''){
  const k=String(v).trim().toLowerCase();
  return ({'sf / box':'BOX',box:'BOX',roll:'ROLL',gallon:'GAL',pail:'PAIL'})[k]||null;
}
export function carpetSourceCode(p={}){
  const s=String(p.sourceRoll||'').trim();
  if(s) return s.toUpperCase();
  const r=String(p.roll||'').trim();
  if(!r) return '';
  return r.split('-')[0].trim().toUpperCase();
}
export function carpetPhysicalKey(p={}){
  const physical=String(p.physicalRollId||'').trim();
  if(physical) return 'physical:'+physical;
  const source=String(p.sourceRoll||'').trim().toUpperCase();
  const mfg=String(p.manufacturerRoll||'').trim().toUpperCase();
  const roll=String(p.roll||'').trim().toUpperCase();
  if(source&&mfg) return 'source_mfg:'+source+'|'+mfg;
  if(roll&&mfg) return 'roll_mfg:'+roll+'|'+mfg;
  return null;
}
export function feetToSixteenths(v){
  const n=Number(v);
  return Number.isFinite(n)&&n>=0 ? Math.round(n*12*16) : null;
}
export function locationKind(code=''){
  const k=String(code).trim().toLowerCase();
  if(k==='receiving') return 'receiving';
  if(k==='receiving / put-away pending') return 'receiving_staging';
  if(k==='store') return 'store';
  if(k==='store samples') return 'sample_store';
  if(k==='ram archive') return 'archive';
  return 'rack';
}

const key=(x)=>String(x??'').trim();
const lower=(x)=>key(x).toLowerCase();
const live=(rows,dataset)=>rows.filter(r=>r.dataset_key===dataset&&!r.deleted_at);
const counts=(items)=>items.reduce((a,x)=>{a[x.classification]=(a[x.classification]||0)+1;return a;},{});
const VOLATILE_CARPET_KEYS=new Set(['id','createdAt','updatedAt','reviewNote','legacyKey','migrationSource','sourceStatus']);

function stableValue(v){
  if(Array.isArray(v)) return v.map(stableValue);
  if(v&&typeof v==='object'){
    const out={};
    for(const k of Object.keys(v).sort()) if(!VOLATILE_CARPET_KEYS.has(k)) out[k]=stableValue(v[k]);
    return out;
  }
  return v;
}
function weakReplaySignature(p={}){
  return JSON.stringify(stableValue(p));
}
function carpetMeasureValidity(p={},measure=''){
  const original=feetToSixteenths(p.originalLength), remaining=feetToSixteenths(p.length);
  if(original===null||remaining===null||original<=0||remaining<=0||remaining>original) return {original,remaining,ok:false,reason:'CARPET_MEASURE_INVALID'};
  if(measure==='FULL'&&remaining!==original) return {original,remaining,ok:false,reason:'CARPET_FULL_MISMATCH'};
  return {original,remaining,ok:true,reason:null};
}
function sameNonblank(items,field){
  const vals=new Set(items.map(x=>key(x.p[field])).filter(Boolean));
  return vals.size===1?[...vals][0]:null;
}

export function classifySnapshot(rows){
  const products=live(rows,'runlu_product_master_v21');
  const inventory=live(rows,'runlu_inventory_records_v21');
  const carpets=live(rows,'runlu_carpet_inventory_v52');

  // Product.base_unit is the physical stock-counting unit, not the coverage/pricing unit.
  // Prefer unanimous positive live Inventory evidence. Coverage is only a tie-breaker/fallback,
  // and known rolled underlay categories stay ROLL when no live stock exists.
  const productUnitEvidence=new Map();
  for(const r of inventory){
    const p=r.payload||{}, mid=key(p.masterId), qty=Number(p.quantity), u=normalizeLegacyUnit(p.unit);
    if(!mid||!(qty>0)||!u) continue;
    const s=productUnitEvidence.get(mid)||new Set();s.add(u);productUnitEvidence.set(mid,s);
  }

  const productManifest=products.map(r=>{
    const p=r.payload||{}, observed=[...(productUnitEvidence.get(String(r.record_id))||new Set())].sort();
    const coverageMapped=productBaseUnit(p.coverageUnit), category=lower(p.category);
    let base_unit=null,unit_resolution=null;
    if(observed.length===1){base_unit=observed[0];unit_resolution='inventory_consensus';}
    else if(observed.length>1&&coverageMapped&&observed.includes(coverageMapped)){
      base_unit=coverageMapped;unit_resolution='coverage_tiebreak';
    } else if(observed.length===0&&['underlay','spill blocker'].includes(category)){
      base_unit='ROLL';unit_resolution='category_roll_rule';
    } else if(observed.length===0&&coverageMapped){
      base_unit=coverageMapped;unit_resolution='coverage_fallback';
    }
    const ok=!!key(p.name)&&!!base_unit;
    return {dataset:r.dataset_key,record_id:r.record_id,source_payload:p,classification:ok?'valid':'conflict',
      reason:ok?'PRODUCT_READY':'PRODUCT_STOCK_UNIT_UNRESOLVED',
      evidence:{observed_stock_units:observed,coverage_unit:key(p.coverageUnit)||null,unit_resolution},
      transformed:{name:key(p.name),sku:key(p.sku)||null,colour:key(p.color)||null,base_unit,
        coverage_unit:key(p.coverageUnit)||null,unit_resolution,lifecycle:'active'}};
  });
  const productById=new Map(productManifest.map(x=>[x.record_id,x]));

  const rawInv=inventory.map(r=>{
    const p=r.payload||{}, qty=Number(p.quantity), unit=normalizeLegacyUnit(p.unit), product=productById.get(key(p.masterId));
    const loc=key(p.location), lot=key(p.lotNumber), payloadId=key(p.id);
    const businessSig=JSON.stringify({
      masterId:key(p.masterId),poNumber:key(p.poNumber),location:loc,unit,
      quantity:Number.isFinite(qty)?qty:null,lotNumber:lot,notes:key(p.notes),
      locationType:key(p.locationType),pailSize:key(p.pailSize)
    });
    return {r,p,qty,unit,product,loc,lot,payloadId,businessSig};
  });

  // A repeated legacy payload id with different business state is identity divergence,
  // not evidence for two separate current stock items. Keep every such row quarantined.
  const inventoryIdStates=new Map();
  for(const x of rawInv){
    if(!x.payloadId) continue;
    const s=inventoryIdStates.get(x.payloadId)||new Set();
    s.add(x.businessSig);inventoryIdStates.set(x.payloadId,s);
  }

  // Duplicate grouping is deliberately conservative and includes lot number.
  // No source row is ever selected as the canonical winner.
  const inventoryDuplicateGroups=new Map();
  for(const x of rawInv){
    if(!(x.qty>0)||!x.product||x.product.classification!=='valid'||!x.unit||x.unit!==x.product.transformed.base_unit||!x.loc||x.loc==='PHYSICAL COUNT REQUIRED') continue;
    const k=[key(x.p.masterId),key(x.p.poNumber),x.loc,x.unit,String(x.qty),x.lot].join('|');
    const g=inventoryDuplicateGroups.get(k)||[];g.push(x);inventoryDuplicateGroups.set(k,g);
  }

  // Strict legacy alias recovery: one derived Stock Item may represent a duplicate
  // business group only when there is exactly one explicit non-self alias edge:
  // wrapper.payload.id -> peer record_id. The wrapper must be its own inventoryId,
  // ACTIVE, zero-transaction, byte-equivalent in normalized business state, and the
  // target legacy id must have no divergent business state anywhere else.
  const safeInventoryAliasByRecord=new Map();
  const derivedInventoryItems=[];
  for(const members of inventoryDuplicateGroups.values()){
    if(members.length<2) continue;
    const safeEdges=[];
    for(const src of members){
      if(!src.payloadId) continue;
      const target=members.find(x=>String(x.r.record_id)!==String(src.r.record_id)&&String(x.r.record_id)===src.payloadId);
      if(!target) continue;
      const wrapperIdentity=key(src.p.inventoryId)===String(src.r.record_id);
      const activeWrapper=key(src.p.lifecycleStatus).toUpperCase()==='ACTIVE';
      const zeroTx=Number(src.p.transactionCount??0)===0;
      const targetSelfId=target.payloadId===String(target.r.record_id);
      const targetStable=(inventoryIdStates.get(target.payloadId)?.size||0)===1;
      if(src.businessSig===target.businessSig&&wrapperIdentity&&activeWrapper&&zeroTx&&targetSelfId&&targetStable){
        safeEdges.push({src,target});
      }
    }
    if(safeEdges.length!==1) continue;

    const {src,target}=safeEdges[0];
    const aliasId=target.payloadId;
    const recordId='INVENTORY_ALIAS:'+aliasId;
    const memberIds=members.map(x=>String(x.r.record_id)).sort();
    derivedInventoryItems.push({
      dataset:'derived_inventory_item_v6',
      record_id:recordId,
      source_payload:{
        payload_id:aliasId,
        alias_source_record_id:String(src.r.record_id),
        alias_target_record_id:String(target.r.record_id),
        member_record_ids:memberIds,
        business_signature:target.businessSig
      },
      classification:'valid',
      reason:'INVENTORY_LEGACY_ALIAS_GROUP_READY',
      transformed:{
        product_legacy_record_id:key(target.p.masterId),location_code:target.loc,
        quantity:target.qty,unit:target.unit,po_number:key(target.p.poNumber)||null,
        lot_number:target.lot||null
      }
    });
    for(const x of members) safeInventoryAliasByRecord.set(String(x.r.record_id),recordId);
  }

  const inventoryManifest=rawInv.map(x=>{
    let classification='valid',reason='INVENTORY_READY';
    if(!(x.qty>0)){classification='deferred';reason='NONPOSITIVE_OPENING_QUANTITY';}
    else if(!x.product){classification='orphan';reason='PRODUCT_LINK_NOT_FOUND';}
    else if(x.product.classification!=='valid'){classification='conflict';reason='PRODUCT_NOT_CANONICAL';}
    else if(!x.unit){classification='conflict';reason='UNKNOWN_UNIT';}
    else if(x.unit!==x.product.transformed.base_unit){classification='conflict';reason='UNIT_MISMATCH_PRODUCT_BASE';}
    else if(!x.loc||x.loc==='PHYSICAL COUNT REQUIRED'){classification='deferred';reason='LOCATION_REQUIRES_REVIEW';}
    else if(x.payloadId&&(inventoryIdStates.get(x.payloadId)?.size||0)>1){classification='conflict';reason='INVENTORY_ID_STATE_DIVERGENCE';}
    else{
      const k=[key(x.p.masterId),key(x.p.poNumber),x.loc,x.unit,String(x.qty),x.lot].join('|');
      const g=inventoryDuplicateGroups.get(k)||[];
      if(g.length>1){
        classification='duplicate';
        reason=safeInventoryAliasByRecord.has(String(x.r.record_id))?'INVENTORY_LEGACY_ALIAS_REPLAY':'DUPLICATE_BUSINESS_TUPLE_REVIEW';
      }
    }
    return {dataset:x.r.dataset_key,record_id:x.r.record_id,source_payload:x.p,classification,reason,
      derived_group_id:safeInventoryAliasByRecord.get(String(x.r.record_id))||null,
      transformed:{product_legacy_record_id:key(x.p.masterId),location_code:x.loc||null,quantity:x.qty,unit:x.unit,
        po_number:key(x.p.poNumber)||null,lot_number:x.lot||null}};
  });

  const sourceGroups=new Map();
  for(const r of carpets){
    const p=r.payload||{}, source=carpetSourceCode(p); if(!source) continue;
    const label={name:key(p.collection),colour:key(p.colour)||null};
    const norm=lower(label.name)+'|'+lower(label.colour);
    const g=sourceGroups.get(source)||{source,labels:new Map()};
    if(!g.labels.has(norm)) g.labels.set(norm,label);
    sourceGroups.set(source,g);
  }
  const derivedProducts=[...sourceGroups.values()].map(g=>{
    const labels=[...g.labels.values()];
    const conflict=labels.length>1;
    const name=labels.find(x=>key(x.name))?.name||'';
    return {dataset:'derived_carpet_product_v6',record_id:'CARPET_SOURCE:'+g.source,
      source_payload:{source_code:g.source,observed_labels:labels},classification:conflict?'conflict':(name?'valid':'deferred'),
      reason:conflict?'CARPET_SOURCE_LABEL_VARIANT':(name?'DERIVED_PRODUCT_READY':'CARPET_SOURCE_NAME_MISSING'),
      evidence:labels,
      transformed:{source_code:g.source,name,colour:labels[0]?.colour||null,base_unit:'1/16_IN',lifecycle:'active'}};
  });
  const derivedBySource=new Map(derivedProducts.map(x=>[x.transformed.source_code,x]));

  const active=carpets.filter(r=>(r.payload||{}).status==='Active' && deerfootFieldDecision(r.payload||{})?.kind!=='used_up').map(r=>({
    r,p:r.payload||{},physical:carpetPhysicalKey(r.payload||{}),source:carpetSourceCode(r.payload||{})
  }));
  const physicalGroups=new Map();
  for(const x of active){
    if(!x.physical) continue;
    const sig=JSON.stringify({location:key(x.p.location),length:key(x.p.length),originalLength:key(x.p.originalLength),measure:key(x.p.measure),status:key(x.p.status),manufacturerRoll:key(x.p.manufacturerRoll),sourceRoll:key(x.p.sourceRoll)});
    const g=physicalGroups.get(x.physical)||{sigs:new Set(),n:0};g.n++;g.sigs.add(sig);physicalGroups.set(x.physical,g);
  }

  // Legacy replay alias detection is deliberately stricter than ordinary duplicate detection.
  // It creates a derived physical candidate only when two weak rows are byte-equivalent in
  // business state AND share the same nonblank legacy payload id, spreadsheet key and source.
  // A legacy payload id that appears with more than one business state is never auto-grouped.
  const weak=active.filter(x=>!x.physical);
  const weakBySig=new Map(), idSigs=new Map();
  for(const x of weak){
    const sig=weakReplaySignature(x.p);
    const g=weakBySig.get(sig)||[];g.push(x);weakBySig.set(sig,g);
    const pid=key(x.p.id);
    if(pid){const s=idSigs.get(pid)||new Set();s.add(sig);idSigs.set(pid,s);}
  }
  const safeReplayByRecord=new Map();
  const derivedCarpetRolls=[];
  for(const [sig,members] of weakBySig){
    if(members.length!==2) continue;
    const payloadId=sameNonblank(members,'id');
    const legacyKey=sameNonblank(members,'legacyKey');
    const migrationSource=sameNonblank(members,'migrationSource');
    if(!payloadId||!legacyKey||!migrationSource||(idSigs.get(payloadId)?.size||0)!==1) continue;

    const p=members[0].p, source=members[0].source, loc=key(p.location), measure=key(p.measure).toUpperCase();
    const sourceProduct=derivedBySource.get(source);
    const mv=carpetMeasureValidity(p,measure);
    let classification='valid',reason='CARPET_LEGACY_ALIAS_GROUP_READY';
    if(!sourceProduct||sourceProduct.classification!=='valid'){classification='conflict';reason='CARPET_PRODUCT_SOURCE_CONFLICT';}
    else if(!loc){classification='orphan';reason='CARPET_LOCATION_MISSING';}
    else if(!['FULL','CAL','TM'].includes(measure)){classification='deferred';reason='CARPET_MEASURE_REVIEW';}
    else if(!mv.ok){classification='conflict';reason=mv.reason;}

    const recordId='CARPET_ALIAS:'+payloadId;
    const memberIds=members.map(x=>String(x.r.record_id)).sort();
    const physical='legacy_alias:'+payloadId;
    derivedCarpetRolls.push({
      dataset:'derived_carpet_roll_v6',
      record_id:recordId,
      source_payload:{
        payload_id:payloadId,legacy_key:legacyKey,migration_source:migrationSource,
        member_record_ids:memberIds,replay_signature:sig
      },
      classification,reason,
      transformed:{
        product_legacy_record_id:'CARPET_SOURCE:'+source,location_code:loc||null,roll_number:key(effective.roll),
        physical_key:physical,manufacturer_roll:key(effective.manufacturerRoll)||null,source_roll:key(effective.sourceRoll)||source||null,
        original_sixteenths:mv.original,remaining_sixteenths:mv.remaining,measure_status:measure
      }
    });
    for(const x of members) safeReplayByRecord.set(String(x.r.record_id),recordId);
  }

  const carpetManifest=carpets.map(r=>{
    const p=r.payload||{}, field=deerfootFieldDecision(p);
    const effective={...p};
    if(field?.kind==='corrected_company_roll') effective.roll=field.to;
    if(field?.location) effective.location=field.location;
    if(field?.measure) effective.measure=field.measure;
    if(Number.isFinite(field?.remainingFeet)) effective.length=field.remainingFeet;
    const source=carpetSourceCode(effective), physical=carpetPhysicalKey(effective), status=key(effective.status), measure=key(effective.measure).toUpperCase(), loc=key(effective.location);
    const sourceProduct=derivedBySource.get(source), group=physical?physicalGroups.get(physical):null;
    const aliasGroup=safeReplayByRecord.get(String(r.record_id));
    let classification='valid',reason='CARPET_READY';
    if(field?.kind==='used_up'){classification='deferred';reason='FIELD_VERIFIED_USED_UP';}
    else if(field?.kind==='invalid_rc_format'){classification='conflict';reason='INVALID_DEERFOOT_RC_FORMAT';}
    else if(status!=='Active'){classification='deferred';reason='NON_ACTIVE_LEGACY_STATUS';}
    else if(aliasGroup){classification='duplicate';reason='CARPET_LEGACY_ALIAS_REPLAY';}
    else if(!sourceProduct||sourceProduct.classification!=='valid'){classification='conflict';reason='CARPET_PRODUCT_SOURCE_CONFLICT';}
    else if(!loc){classification='orphan';reason='CARPET_LOCATION_MISSING';}
    else if(!['FULL','CAL','TM'].includes(measure)){classification='deferred';reason='CARPET_MEASURE_REVIEW';}
    else if(!physical){classification='deferred';reason='CARPET_PHYSICAL_IDENTITY_WEAK';}
    else if(group&&group.sigs.size>1){classification='conflict';reason='CARPET_PHYSICAL_STATE_DIVERGENCE';}
    else if(group&&group.n>1){classification='duplicate';reason='CARPET_PHYSICAL_REPLAY';}
    const mv=carpetMeasureValidity(p,measure);
    if(classification==='valid'&&!mv.ok){classification='conflict';reason=mv.reason;}
    return {dataset:r.dataset_key,record_id:r.record_id,source_payload:p,classification,reason,
      derived_group_id:aliasGroup||null,
      transformed:{product_legacy_record_id:'CARPET_SOURCE:'+source,location_code:loc||null,roll_number:key(p.roll),
        physical_key:physical,manufacturer_roll:key(p.manufacturerRoll)||null,source_roll:key(p.sourceRoll)||source||null,
        original_sixteenths:mv.original,remaining_sixteenths:mv.remaining,measure_status:measure}};
  });

  const locationCodes=new Set();
  for(const x of inventoryManifest) if(x.transformed.location_code&&x.transformed.location_code!=='PHYSICAL COUNT REQUIRED') locationCodes.add(x.transformed.location_code);
  for(const x of carpetManifest) if(x.transformed.location_code) locationCodes.add(x.transformed.location_code);
  const locations=[...locationCodes].sort().map(code=>({
    dataset:'derived_location_v6',record_id:'LOC:'+code,source_payload:{observed_code:code},
    classification:'valid',reason:'LOCATION_REFERENCE_OBSERVED',
    transformed:{code,kind:locationKind(code),lifecycle:'active'}
  }));

  return {
    products:productManifest,
    derived_carpet_products:derivedProducts,
    locations,
    inventory:inventoryManifest,
    derived_inventory_items:derivedInventoryItems,
    carpet:carpetManifest,
    derived_carpet_rolls:derivedCarpetRolls,
    summary:{
      products:counts(productManifest),
      derived_carpet_products:counts(derivedProducts),
      locations:counts(locations),
      inventory:counts(inventoryManifest),
      derived_inventory_items:counts(derivedInventoryItems),
      carpet:counts(carpetManifest),
      derived_carpet_rolls:counts(derivedCarpetRolls)
    }
  };
}
