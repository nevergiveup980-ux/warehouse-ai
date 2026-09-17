import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../build072-adoption.js',import.meta.url),'utf8');
assert.ok(code.includes("if(k===INV)"),'Inventory adoption guard missing');
assert.ok(code.includes('build146-held-legacy-inventory-snapshot'),'Inventory hold audit missing');

const store=new Map();
const put=(k,v)=>store.set(k,typeof v==='string'?v:JSON.stringify(v));
put('runlu_cloud_master_last_sync_v680','2026-09-18T00:00:00.000Z');
put('runlu_build072_precloud_device_snapshot_v680',{
  at:'2026-09-16T20:00:00.000Z',
  datasets:{
    runlu_inventory_records_v21:[
      {inventoryId:'STALE-1',masterId:'PRD-0010',quantity:20,location:'30A'},
      {inventoryId:'STALE-2',masterId:'PRD-0011',quantity:40,location:'30B'}
    ],
    runlu_operations_log_v52:[
      {id:'SEP16-OP-1',po:'181643',updatedAt:'2026-09-16T19:34:00.000Z'}
    ]
  }
});
put('runlu_inventory_records_v21',[{inventoryId:'CLOUD-1',masterId:'PRD-0010',quantity:20,location:'30A'}]);
put('runlu_operations_log_v52',[]);

const saves=[];
function save(k,v){saves.push([k,JSON.parse(JSON.stringify(v))]);put(k,v)}
save.__build072=true;
const localStorage={
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
};
const window={save,runluCloudMasterSync:async()=>true,addEventListener:()=>{}};
const context={window,localStorage,document:{readyState:'complete'},console,setInterval:fn=>{queueMicrotask(fn);return 1},clearInterval:()=>{},queueMicrotask,setTimeout};
vm.createContext(context);
vm.runInContext(code,context,{filename:'build072-adoption.js'});
await new Promise(r=>setTimeout(r,25));

assert.equal(saves.some(([k])=>k==='runlu_inventory_records_v21'),false,'legacy Inventory snapshot must never be re-saved');
assert.equal(saves.some(([k])=>k==='runlu_operations_log_v52'),true,'non-Inventory recovery evidence must continue through adoption');
const audit=JSON.parse(store.get('runlu_build072_device_adoption_audit_v680'));
assert.ok(audit.audit.some(x=>x.dataset==='runlu_inventory_records_v21'&&x.action==='build146-held-legacy-inventory-snapshot'),'Inventory hold must be audited');
assert.ok(store.get('runlu_build072_device_adoption_done_v680'),'adoption pass should finish without looping');
console.log('Build146 adoption replay guard: PASS');
