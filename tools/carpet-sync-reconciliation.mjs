// Read-only carpet inventory and outbox reconciliation classifier.
// Never mutates source rows, pending operations or cloud records.
export function analyzeCarpetSync({deviceRows=[],cloudRows=[],outbox=[]}={}){
 const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
 const roll=v=>norm(v).replace(/[^A-Z0-9]/g,'').replace(/^RC(?=\d)/,'').replace(/^0+(?=\d)/,'');
 const id=r=>String(r?.inventoryId??r?.id??r?.legacyKey??r?.roll??'');
 const physical=r=>norm(r?.physicalKey);
 const items=[...deviceRows.map(r=>({source:'device',row:r})),...cloudRows.map(r=>({source:'cloud',row:r}))];
 const groups=new Map();
 for(const item of items){const r=item.row||{};const key=physical(r)?'physical:'+physical(r):roll(r.roll)?'roll:'+roll(r.roll):'id:'+id(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
 const results=[];
 for(const [key,members] of groups){if(members.length<2)continue;
  const distinctIds=new Set(members.map(x=>id(x.row)));
  const comparable=r=>JSON.stringify({name:norm(r.name??r.product),color:norm(r.color??r.colour),dyelot:norm(r.dyelot??r.dyeLot),roll:roll(r.roll),manufacturerRoll:roll(r.manufacturerRoll),length:norm(r.length),width:norm(r.width),status:norm(r.status)});
  const identical=members.every(x=>comparable(x.row)===comparable(members[0].row));
  const referenced=outbox.filter(op=>members.some(x=>String(op.record_id)===id(x.row)));
  results.push({key,classification:identical?'candidate_duplicate':'conflicting_records',recordIds:[...distinctIds],sources:members.map(x=>x.source),pendingOperationCount:referenced.length,reviewRequired:true,deleteAllowed:false});
 }
 const missingVersion=outbox.filter(op=>op.base_version===null||op.base_version===undefined);
 return {deviceCount:deviceRows.length,cloudCount:cloudRows.length,pendingCount:outbox.length,missingBaseVersionCount:missingVersion.length,groups:results,readOnly:true};
}
