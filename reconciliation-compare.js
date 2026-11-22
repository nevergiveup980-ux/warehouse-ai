/* RUNLU Warehouse OS — read-only reconciliation comparison core.
   No storage, network, or database writes. */
(function(root){
'use strict';
const norm=x=>String(x??'').trim().toUpperCase().replace(/\s+/g,' ');
function unwrap(x){if(!x||typeof x!=='object')return null;if(x.deleted_at)return null;if(x.dataset_key&&x.dataset_key!=='runlu_carpet_inventory_v52')return null;const p=x.payload&&typeof x.payload==='object'?x.payload:x;return {...p,version:x.version??p._cloudVersion??p.version,id:x.record_id??p.id};}
function normalizeSnapshot(input){if(!Array.isArray(input))throw Error('Snapshot must be an array');return input.map(unwrap).filter(Boolean)}
const numeric=x=>x==null||String(x).trim()===''?null:Number(x);
const close=(a,b)=>a!==null&&b!==null&&Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1/1200;
function compare(observed,inventory){
 const roll=norm(observed.roll), matches=normalizeSnapshot(inventory||[]).filter(x=>norm(x.roll)===roll);
 if(!roll)return {result:'INVALID',differences:[{field:'roll',message:'Roll ID required'}],matches:[]};
 if(!matches.length)return {result:'NOT_FOUND',differences:[{field:'roll',message:'No matching operational roll ID'}],matches:[]};
 if(matches.length>1)return {result:'AMBIGUOUS',differences:[{field:'roll',message:'Multiple records share operational roll ID'}],matches:matches.map(x=>({roll:x.roll,id:x.id,version:x.version}))};
 const old=matches[0],differences=[];
 for(const field of ['collection','colour','location']){
   const val=observed[field];
   if(val!=null&&String(val).trim()&&norm(val)!==norm(old[field]))
      differences.push({field,before:old[field]??'',observed:val});
 }
 const len=numeric(observed.decimalFeet),previous=numeric(old.length);
 if(len!==null&&(!Number.isFinite(len)||len<0))differences.push({field:'length',message:'Invalid observed length'});
 else if(len!==null&&previous===null)differences.push({field:'length',before:null,observed:len,message:'Existing length missing'});
 else if(len!==null&&!close(len,previous))differences.push({field:'length',before:previous,observed:len});
 return {result:differences.length?'DIFFERENT':'MATCH',differences,matches:[{roll:old.roll,id:old.id,version:old.version,length:old.length,collection:old.collection,colour:old.colour,location:old.location}]};
}
root.RunluReconciliation={compare,normalizeSnapshot};
})(typeof window!=='undefined'?window:globalThis);
