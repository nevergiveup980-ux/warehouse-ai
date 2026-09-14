import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build131-storage-quota-recovery.js',import.meta.url),'utf8');
const store=new Map();
const archived=new Map();
const ls={
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
};

function fakeIndexedDB(){
  return {
    open(){
      const req={result:null,error:null,onupgradeneeded:null,onsuccess:null,onerror:null};
      queueMicrotask(()=>{
        const db={
          objectStoreNames:{contains:()=>true},
          createObjectStore(){},
          transaction(){
            const tx={oncomplete:null,onerror:null,onabort:null,error:null};
            tx.objectStore=()=>({put:value=>{archived.set(value.key,value);queueMicrotask(()=>tx.oncomplete?.())}});
            return tx;
          },
          close(){}
        };
        req.result=db;req.onsuccess?.();
      });
      return req;
    }
  };
}

store.set('runlu_v21_migrated','1');
store.set('runlu_v13_migrated','yes');
store.set('runlu_product_master_v21',JSON.stringify([{id:'P1',name:'Live'}]));
store.set('runlu_inventory_records_v21',JSON.stringify([{id:1,masterId:'P1',quantity:4}]));
store.set('runlu_orders_v20',JSON.stringify([]));
store.set('runlu_inventory_v20',JSON.stringify([{name:'Legacy duplicate',photo:'data:image/jpeg;base64,AAAA'}]));
store.set('runlu_inventory_v13',JSON.stringify([{name:'Very old inventory'}]));
store.set('runlu_orders_v13',JSON.stringify([{id:13,customer:'Old'}]));

const doc={
  readyState:'complete',
  documentElement:{setAttribute(){}},
  getElementById(){return null},
  addEventListener(){}
};
const context={
  console,JSON,Date,Math,Promise,Blob,queueMicrotask,
  localStorage:ls,indexedDB:fakeIndexedDB(),document:doc,
  addEventListener(){},setTimeout(){return 1},setInterval(){return 1},clearInterval(){},
  alert(){},navigator:{onLine:true}
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build131-storage-quota-recovery.js'});
assert.equal(context.RUNLUStorageQuotaRecoveryBuild131.version,'131');

const result=await context.RUNLUStorageQuotaRecoveryBuild131.retireLegacyDuplicates();
assert.equal(result.details.filter(x=>x.removed).length,3);
assert.equal(store.has('runlu_inventory_v20'),false);
assert.equal(store.has('runlu_inventory_v13'),false);
assert.equal(store.has('runlu_orders_v13'),false);
assert.equal(archived.has('runlu_inventory_v20'),true);
assert.equal(archived.has('runlu_inventory_v13'),true);
assert.equal(archived.has('runlu_orders_v13'),true);
assert.deepEqual(JSON.parse(store.get('runlu_product_master_v21')),[{id:'P1',name:'Live'}]);
assert.deepEqual(JSON.parse(store.get('runlu_inventory_records_v21')),[{id:1,masterId:'P1',quantity:4}]);

// Guard: without a completed V21 migration, the old V20 source must be kept.
store.set('runlu_inventory_v20',JSON.stringify([{name:'Keep me'}]));
store.set('runlu_v21_migrated','');
const guarded=await context.RUNLUStorageQuotaRecoveryBuild131.retireLegacyDuplicates();
assert.equal(guarded.details.find(x=>x.key==='runlu_inventory_v20').removed,false);
assert.equal(store.has('runlu_inventory_v20'),true);

console.log('Build131 storage quota recovery: PASS');
