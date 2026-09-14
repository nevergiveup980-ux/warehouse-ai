import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build129-operation-draft-resilience.js',import.meta.url),'utf8');
const DRAFT='runlu_operation_draft_v55';

function fakeIndexedDB(){
  const rows=new Map();
  return {
    rows,
    open(){
      const req={result:null,error:null};
      queueMicrotask(()=>{
        const db={
          objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},
          transaction(){return {error:null,objectStore(){return {
            put(value,key){const r={};queueMicrotask(()=>{rows.set(key,value);r.result=key;r.onsuccess?.()});return r},
            get(key){const r={};queueMicrotask(()=>{r.result=rows.get(key);r.onsuccess?.()});return r},
            delete(key){const r={};queueMicrotask(()=>{rows.delete(key);r.result=undefined;r.onsuccess?.()});return r}
          }}}}
        };
        req.result=db;req.onsuccess?.();
      });
      return req;
    }
  };
}

function makeContext({failMode='none'}={}){
  const store=new Map(),alerts=[],state={textContent:'',style:{},dataset:{}},editor={classList:{contains:()=>false}};
  let writes=0,cleanup=0;
  const idb=fakeIndexedDB();
  const context={
    console,Date,JSON,Math,Promise,queueMicrotask,indexedDB:idb,
    localStorage:{
      getItem:k=>store.get(k)??null,
      setItem(k,v){
        writes++;
        if(failMode==='always')throw Object.assign(new Error('quota full'),{name:'QuotaExceededError'});
        if(failMode==='once'&&writes===1)throw Object.assign(new Error('quota full'),{name:'QuotaExceededError'});
        store.set(k,String(v));
      },
      removeItem:k=>store.delete(k)
    },
    document:{readyState:'complete',getElementById:id=>id==='operationEditor'?editor:id==='operationDraftState'?state:null,documentElement:{setAttribute(){}}},
    addEventListener(){},setTimeout(fn){fn();return 1},setInterval(){return 1},clearInterval(){},
    alert:m=>alerts.push(m),confirm:()=>true,
    operationDraftPayload:()=>({po:'181999',current:{product:'LVP',colour:'Pewter Moon',quantity:40,unit:'Box'},items:[]}),
    saveOperationDraftNow(){throw new Error('legacy draft writer should be replaced')},
    scheduleOperationDraft(){},newOperation(){},deleteOperationDraft(){},saveOperation(){},restoreOperationDraft(){},
    pruneLocalApplicationCache(){cleanup++;return {reclaimedBytes:1024}},
    aggressiveSafeStorageCleanup(){return {reclaimedBytes:0}}
  };
  context.window=context;
  vm.runInNewContext(source,context,{filename:'build129-operation-draft-resilience.js'});
  return {context,store,alerts,state,idb,get cleanup(){return cleanup}};
}

{
  const t=makeContext();
  assert.equal(await t.context.RUNLUOperationDraftBuild129.persistCurrentDraft(),true);
  assert.equal(JSON.parse(t.store.get(DRAFT)).current.quantity,40);
  assert.match(t.state.textContent,/Draft saved automatically/);
  await new Promise(r=>setImmediate(r));
  assert.equal((await t.context.RUNLUOperationDraftBuild129.readFallback()).payload.current.product,'LVP');
  assert.equal(t.alerts.length,0);
}

{
  const t=makeContext({failMode:'once'});
  assert.equal(await t.context.RUNLUOperationDraftBuild129.persistCurrentDraft(),true);
  assert.equal(t.cleanup,1);
  assert.ok(t.store.has(DRAFT));
  assert.match(t.state.textContent,/Draft saved automatically/);
}

{
  const t=makeContext({failMode:'always'});
  assert.equal(await t.context.RUNLUOperationDraftBuild129.persistCurrentDraft(),true);
  assert.equal(t.store.has(DRAFT),false);
  assert.match(t.state.textContent,/saved safely on this device/);
  assert.equal((await t.context.RUNLUOperationDraftBuild129.readFallback()).payload.current.quantity,40);
  assert.equal(t.alerts.length,0);
}

console.log('Build129 operation draft resilience: PASS');
