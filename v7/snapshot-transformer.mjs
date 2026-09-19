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
const key=(x)=>String(x??'').trim();
const lower=(x)=>key(x).toLowerCase();
const live=(rows,dataset)=>rows.filter(r=>r.dataset_key===dataset&&!r.deleted_at);
const counts=(items)=>items.reduce((a,x)=>{a[x.classification]=(a[x.classification]||0)+1;return a;},{});

export function classifySnapshot(rows){
  const products=live(rows,'runlu_product_master_v21');
  const inventory=live(rows,'runlu_inventory_records_v21');
  const carpets=live(rows,'runlu_carpet_inventory_v52');

  const productManifest=products.map(r=>{
    const p=r.payload||{}, base_unit=productBaseUnit(p.coverageUnit);
    const ok=!!key(p.name)&&!!base_unit;
    return {dataset:r.dataset_key,record_id:r.record_id,classification:ok?'valid':'conflict',
      reason:ok?'PRODUCT_READY':'PRODUCT_REQUIRED_FIELDS_OR_UNIT',
      transformed:{name:key(p.name),sku:key(p.sku)||null,colour:key(p.color)||null,base_unit,lifecycle:'active'}};
  });
  const productById=new Map(productManifest.map(x=>[x.record_id,x]));

  const rawInv=inventory.map(r=>{
    const p=r.payload||{}, qty=Number(p.quantity), unit=normalizeLegacyUnit(p.unit), product=productById.get(key(p.masterId));
    const loc=key(p.location);
    return {r,p,qty,unit,product,loc};
  });
  const dupCount=new Map();
  for(const x of rawInv){
    if(!(x.qty>0)||!x.product||x.product.classification!=='valid'||!x.unit||x.unit!==x.product.transformed.base_unit||!x.loc) continue;
    const k=[key(x.p.masterId),key(x.p.poNumber),x.loc,x.unit,String(x.qty)].join('|');
    dupCount.set(k,(dupCount.get(k)||0)+1);
  }
  const inventoryManifest=rawInv.map(x=>{
    let classification='valid',reason='INVENTORY_READY';
    if(!(x.qty>0)){classification='deferred';reason='NONPOSITIVE_OPENING_QUANTITY';}
    else if(!x.product){classification='orphan';reason='PRODUCT_LINK_NOT_FOUND';}
    else if(x.product.classification!=='valid'){classification='conflict';reason='PRODUCT_NOT_CANONICAL';}
    else if(!x.unit){classification='conflict';reason='UNKNOWN_UNIT';}
    else if(x.unit!==x.product.transformed.base_unit){classification='conflict';reason='UNIT_MISMATCH_PRODUCT_BASE';}
    else if(!x.loc||x.loc==='PHYSICAL COUNT REQUIRED'){classification='deferred';reason='LOCATION_REQUIRES_REVIEW';}
    else{
      const k=[key(x.p.masterId),key(x.p.poNumber),x.loc,x.unit,String(x.qty)].join('|');
      if((dupCount.get(k)||0)>1){classification='duplicate';reason='DUPLICATE_BUSINESS_TUPLE_REVIEW';}
    }
    return {dataset:x.r.dataset_key,record_id:x.r.record_id,classification,reason,
      transformed:{product_legacy_record_id:key(x.p.masterId),location_code:x.loc||null,quantity:x.qty,unit:x.unit,
        po_number:key(x.p.poNumber)||null,lot_number:key(x.p.lotNumber)||null}};
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
      classification:conflict?'conflict':(name?'valid':'deferred'),
      reason:conflict?'CARPET_SOURCE_LABEL_VARIANT':(name?'DERIVED_PRODUCT_READY':'CARPET_SOURCE_NAME_MISSING'),
      evidence:labels,
      transformed:{source_code:g.source,name,colour:labels[0]?.colour||null,base_unit:'1/16_IN',lifecycle:'active'}};
  });
  const derivedBySource=new Map(derivedProducts.map(x=>[x.transformed.source_code,x]));

  const activeStrong=carpets.filter(r=>(r.payload||{}).status==='Active').map(r=>({r,p:r.payload||{},physical:carpetPhysicalKey(r.payload||{}),source:carpetSourceCode(r.payload||{})}));
  const physicalGroups=new Map();
  for(const x of activeStrong){
    if(!x.physical) continue;
    const sig=JSON.stringify({location:key(x.p.location),length:key(x.p.length),originalLength:key(x.p.originalLength),measure:key(x.p.measure),status:key(x.p.status),manufacturerRoll:key(x.p.manufacturerRoll),sourceRoll:key(x.p.sourceRoll)});
    const g=physicalGroups.get(x.physical)||{sigs:new Set(),n:0};g.n++;g.sigs.add(sig);physicalGroups.set(x.physical,g);
  }
  const carpetManifest=carpets.map(r=>{
    const p=r.payload||{}, source=carpetSourceCode(p), physical=carpetPhysicalKey(p), status=key(p.status), measure=key(p.measure).toUpperCase(), loc=key(p.location);
    const sourceProduct=derivedBySource.get(source), group=physical?physicalGroups.get(physical):null;
    let classification='valid',reason='CARPET_READY';
    if(status!=='Active'){classification='deferred';reason='NON_ACTIVE_LEGACY_STATUS';}
    else if(!sourceProduct||sourceProduct.classification!=='valid'){classification='conflict';reason='CARPET_PRODUCT_SOURCE_CONFLICT';}
    else if(!loc){classification='orphan';reason='CARPET_LOCATION_MISSING';}
    else if(!['FULL','CAL','TM'].includes(measure)){classification='deferred';reason='CARPET_MEASURE_REVIEW';}
    else if(!physical){classification='deferred';reason='CARPET_PHYSICAL_IDENTITY_WEAK';}
    else if(group&&group.sigs.size>1){classification='conflict';reason='CARPET_PHYSICAL_STATE_DIVERGENCE';}
    else if(group&&group.n>1){classification='duplicate';reason='CARPET_PHYSICAL_REPLAY';}
    const original=feetToSixteenths(p.originalLength), remaining=feetToSixteenths(p.length);
    if(classification==='valid'&&(original===null||remaining===null||original<=0||remaining<=0||remaining>original)){
      classification='conflict';reason='CARPET_MEASURE_INVALID';
    }
    if(classification==='valid'&&measure==='FULL'&&remaining!==original){
      classification='conflict';reason='CARPET_FULL_MISMATCH';
    }
    return {dataset:r.dataset_key,record_id:r.record_id,classification,reason,
      transformed:{product_legacy_record_id:'CARPET_SOURCE:'+source,location_code:loc||null,roll_number:key(p.roll),
        physical_key:physical,manufacturer_roll:key(p.manufacturerRoll)||null,source_roll:key(p.sourceRoll)||source||null,
        original_sixteenths:original,remaining_sixteenths:remaining,measure_status:measure}};
  });

  const locationCodes=new Set();
  for(const x of inventoryManifest) if(x.transformed.location_code&&x.transformed.location_code!=='PHYSICAL COUNT REQUIRED') locationCodes.add(x.transformed.location_code);
  for(const x of carpetManifest) if(x.transformed.location_code) locationCodes.add(x.transformed.location_code);
  const locations=[...locationCodes].sort().map(code=>({dataset:'derived_location_v6',record_id:'LOC:'+code,classification:'valid',reason:'LOCATION_REFERENCE_OBSERVED',transformed:{code,kind:code==='Receiving'?'receiving':'rack',lifecycle:'active'}}));

  return {products:productManifest,derived_carpet_products:derivedProducts,locations,inventory:inventoryManifest,carpet:carpetManifest,
    summary:{products:counts(productManifest),derived_carpet_products:counts(derivedProducts),locations:counts(locations),inventory:counts(inventoryManifest),carpet:counts(carpetManifest)}};
}
