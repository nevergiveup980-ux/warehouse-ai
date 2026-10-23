import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function openInventoryDetail(identity){');
const end=html.indexOf('function inventorySearchKey(',start);
assert.ok(start>0&&end>start);
const alerts=[],opened=[];let rows=[],masters=[];
const ctx={console,alert:x=>alerts.push(x),loadInventoryRecords:()=>rows,inventoryProductForMasterId:id=>masters.find(m=>String(m.id)===String(id))||{},inventoryCanonicalProductId:id=>String(id),openInventoryManager:id=>opened.push(id)};
vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
ctx.openInventoryDetail('missing');assert.equal(opened.length,0);assert.match(alerts.at(-1),/not found/);
rows=[{id:1,inventoryId:'same',masterId:'M1'},{id:2,inventoryId:'same',masterId:'M2'}];
ctx.openInventoryDetail('same');assert.equal(opened.length,0);assert.match(alerts.at(-1),/duplicate identity/);
rows=[{id:3,inventoryId:'cider',masterId:'orphan',quantity:88}];
ctx.openInventoryDetail('cider');assert.equal(opened.length,0);assert.match(alerts.at(-1),/Product Master link/);
masters=[{id:'M1',name:'Cider Barrel'}];rows=[{id:4,inventoryId:'cider',masterId:'M1',quantity:88}];
ctx.openInventoryDetail('cider');assert.deepEqual(opened,['M1']);assert.equal(rows[0].quantity,88);
const refStart=html.indexOf('function inventoryRecordIdentity(r){');
const refEnd=html.indexOf('function findInventoryRecordByIdentity(',refStart);
assert.ok(refStart>0&&refEnd>refStart);
vm.runInContext(html.slice(refStart,refEnd),ctx);
const encoded=ctx.inventoryRecordJsRef({inventoryId:"O'Brien<&"});
assert.equal(encoded.includes("'"),false);
assert.equal(encoded.includes('<'),false);
assert.equal(encoded.includes('&'),false);
assert.equal(JSON.parse(encoded),"O'Brien<&");
// Cider Barrel production shape: active 88 Box legacy numeric id, no inventoryId.
masters=[{id:'8b75a52e-69ac-4567-9689-706f0b21c43a',name:'TRIO',color:'Cider Barrel'}];
rows=[{id:1792170022853,masterId:masters[0].id,location:'CR4',quantity:88,unit:'Box',lifecycleStatus:'ACTIVE'}];
ctx.openInventoryDetail('1792170022853');
assert.equal(opened.at(-1),masters[0].id);
assert.equal(rows[0].quantity,88);
// An archived zero-quantity record for the same product must not shadow the legacy id.
rows.push({id:'stock-archived',inventoryId:'stock-archived',masterId:masters[0].id,location:'CR4',quantity:0,lifecycleStatus:'ARCHIVED'});
ctx.openInventoryDetail('1792170022853');
assert.equal(opened.at(-1),masters[0].id);
assert.equal(rows[0].quantity,88);
// List rows navigate by the already-resolved Product Master, not a second
// inventory lookup (which can differ after cloud synchronization).
const directStart=html.indexOf('function openInventoryProductDetail(masterId){');
const directEnd=html.indexOf('function inventorySearchKey(',directStart);
assert.ok(directStart>0&&directEnd>directStart);
vm.runInContext(html.slice(directStart,directEnd),ctx);
assert.match(html,/onclick='openInventoryProductDetail\(\$\{inventoryRecordJsRef\(\{id:r\.masterId\}\)\}\)'/);
masters=[{id:'8b75a52e-69ac-4567-9689-706f0b21c43a',name:'TRIO',color:'Cider Barrel'}];
rows=[]; // Simulate an inventory reload where the legacy row id is no longer present.
const beforeDirect=opened.length;
ctx.openInventoryProductDetail(masters[0].id);
assert.equal(opened.length,beforeDirect+1);
assert.equal(opened.at(-1),masters[0].id);
ctx.openInventoryProductDetail('missing-product');
assert.equal(opened.length,beforeDirect+1);
assert.match(alerts.at(-1),/Product Master link/);
console.log('Inventory detail diagnostics: missing, duplicate, orphan and valid records PASS');
