// Cloud Master queue merge regression simulation. Run with Node >=18.
// Pure logic harness: no live warehouse data or Supabase calls.
import assert from 'node:assert/strict';

function reconcile(initial, processed, latest, acknowledgedIds, acknowledgedVersions=new Map()){
  const initialFingerprints=new Map(initial.map(m=>[m.id,JSON.stringify(m)]));
  const pendingById=new Map(processed.filter(Boolean).map(m=>[m.id,m]));
  const acknowledged=new Set(acknowledgedIds);
  return latest.filter(m=>!(acknowledged.has(m.id)&&JSON.stringify(m)===initialFingerprints.get(m.id)))
    .map(m=>{
      if(JSON.stringify(m)!==initialFingerprints.get(m.id))
        return acknowledgedVersions.has(m.id)?{...m,baseVersion:acknowledgedVersions.get(m.id)}:m;
      return pendingById.get(m.id)||m;
    });
}
const op=(id,payload,extra={})=>({id,datasetKey:'runlu_inventory_records_v21',recordId:id,op:'upsert',payload,baseVersion:1,...extra});
const a=op('A',{qty:10}),b=op('B',{qty:5}),c=op('C',{qty:7});
assert.deepEqual(reconcile([a],[null],[a,c],['A']),[c],'new operation appended during flush must survive');
assert.deepEqual(reconcile([a],[null],[op('A',{qty:9})],['A']),[op('A',{qty:9})],'modified operation must survive old acknowledgement');
assert.deepEqual(reconcile([a,b],[null,b],[a,b],['A']),[b],'only acknowledged unchanged operation removed');
assert.deepEqual(reconcile([a],[{...a,blocked:true}],[a],[]),[{...a,blocked:true}],'blocked state preserved');
assert.deepEqual(reconcile([a],[null],[a],['A']),[],'acknowledged unchanged operation removed');
assert.deepEqual(reconcile([a],[a],[a,c],[]),[a,c],'pending operation and concurrent append preserved');
assert.deepEqual(reconcile([a],[null],[op('A',{qty:9})],['A'],new Map([['A',2]])),[op('A',{qty:9},{baseVersion:2})],'concurrent edit must use confirmed cloud version');
assert.deepEqual(reconcile([a],[null],[op('A',{qty:9})],[],new Map()),[op('A',{qty:9})],'failed upload must not rebase an unconfirmed edit');
console.log('PASS: eight isolated queue reconciliation cases.');
console.warn('This is a pure-logic simulation, not a browser, Supabase, or production inventory integration test.');
