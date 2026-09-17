// RUNLU Warehouse Build145 — Inventory Replay Guard policy (engineering only)
// Pure policy module: no production hooks, no localStorage mutation, no cloud mutation.
(() => {
  const INV='runlu_inventory_records_v21';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ');
  const idOf=r=>text(r?.inventoryId||r?.id||r?.cloudRecordId);
  const key=r=>[norm(r?.masterId),norm(r?.po||r?.poNumber),norm(r?.location),norm(r?.unit),Number(r?.quantity||0)].join('|');

  function remoteIndex(rows){
    const liveIds=new Set(),tombstoneIds=new Set(),liveKeys=new Set(),tombstoneKeys=new Set();
    for(const r of rows||[]){
      if(r?.dataset_key!==INV)continue;
      const id=text(r.record_id),k=key(r.payload||{});
      if(r.deleted_at){if(id)tombstoneIds.add(id);if(k)tombstoneKeys.add(k)}
      else {if(id)liveIds.add(id);if(k)liveKeys.add(k)}
    }
    return {liveIds,tombstoneIds,liveKeys,tombstoneKeys};
  }

  function replayVerdict(row,remoteRows){
    const idx=remoteIndex(remoteRows),id=idOf(row),k=key(row);
    if(!id)return {allow:false,reason:'missing-id'};
    if(idx.tombstoneIds.has(id))return {allow:false,reason:'cloud-tombstone-id'};
    if(idx.liveIds.has(id))return {allow:false,reason:'already-in-cloud'};
    if(idx.liveKeys.has(k)||idx.tombstoneKeys.has(k))return {allow:false,reason:'business-entity-already-known'};
    return {allow:false,reason:'unproven-local-only'};
  }

  // Bootstrap/adoption is old-cache reconciliation, not evidence of fresh business work.
  function allowBootstrapInventoryAdoption(row,remoteRows){return replayVerdict(row,remoteRows)}

  // Queue entries that already existed before Build145 are preserved but quarantined when
  // they are Inventory upserts. Never delete them: Sep16 recovery evidence may still exist.
  // Non-Inventory entries and Inventory deletes pass. Fresh post-guard saves are tagged
  // source='live-save' by the integration layer and may pass.
  function queueVerdict(mutation,remoteRows){
    if(!mutation||mutation.datasetKey!==INV)return {allow:true,reason:'non-inventory'};
    if(mutation.op==='delete')return {allow:true,reason:'inventory-delete'};
    if(mutation.op!=='upsert')return {allow:false,reason:'unknown-op'};
    if(mutation.source==='live-save')return {allow:true,reason:'tagged-live-save'};
    const v=replayVerdict(mutation.payload||{},remoteRows);
    return {allow:false,reason:'quarantine-'+v.reason};
  }

  function allowLiveSaveMutation(dataset,op,row){
    if(dataset!==INV)return {allow:true,reason:'non-inventory'};
    if(op!=='upsert'&&op!=='delete')return {allow:false,reason:'unknown-op'};
    if(!idOf(row))return {allow:false,reason:'missing-id'};
    return {allow:true,reason:'live-save-mutation'};
  }

  const api={INV,key,remoteIndex,replayVerdict,allowBootstrapInventoryAdoption,queueVerdict,allowLiveSaveMutation};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.RUNLUInventoryReplayGuardBuild145=api;
})();
