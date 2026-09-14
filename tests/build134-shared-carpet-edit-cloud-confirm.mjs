import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build134-shared-carpet-edit-cloud-confirm.js',import.meta.url),'utf8');
assert.match(source,/warehouse_merge_shared_carpet_edit/,'shared edit must use atomic cloud merge RPC');
assert.match(source,/await waitForCloud\(\)/,'ordinary shared edits must wait for cloud confirmation');
assert.match(source,/await refreshCloud\(\)/,'shared edits must reload cloud-confirmed data');
assert.match(source,/sharedCode\(roll\)/,'CHC shared codes must bypass the legacy duplicate operational-roll blocker');
assert.match(source,/isPendingPlaceholder\(otherMfr\)/,'manufacturer match must adopt a pending placeholder instead of creating another duplicate');

const dom=new Map();
const document={
  readyState:'complete',
  getElementById(id){return dom.get(id)||null},
  querySelector(){return null},
  documentElement:{setAttribute(){}},
};
const context={
  console,JSON,Math,Date,Promise,structuredClone,
  document,
  localStorage:{getItem(){return null}},
  fetch:async()=>({ok:true,json:async()=>[]}),
  setInterval(){return 1},clearInterval(){},setTimeout(fn){fn();return 1},
  alert(){},
  addEventListener(){},
  carpetRecords(){return[]},
  editCarpetRecord(){},saveCarpetEdit(){},
  cleanManufacturerRoll(v){return String(v||'').trim()},
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build134-shared-carpet-edit-cloud-confirm.js'});
const api=context.RUNLUSharedCarpetEditBuild134;
assert.ok(api,'Build134 API must install');
assert.equal(api.version,'134');
assert.equal(api.sharedCode('chc022'),true);
assert.equal(api.sharedCode('CHC023'),true);
assert.equal(api.sharedCode('RC2354'),false);
assert.equal(api.rowSharedCode({roll:'CHC022-9692',sourceRoll:'CHC022'}),'CHC022');
assert.equal(api.isPendingPlaceholder({roll:'CHC022-9692',sourceRoll:'CHC022',manufacturerRoll:'9692',status:'Pending',length:0}),true);
assert.equal(api.isPendingPlaceholder({roll:'CHC022',manufacturerRoll:'9692',status:'Active',length:146}),false);
assert.equal(api.rowRecordId({roll:'CHC022-9692',sourceRoll:'CHC022',manufacturerRoll:'9692'}),'CHC022-9692');
assert.equal(context.saveCarpetEdit.__build134,true,'Save Changes must be wrapped');
assert.equal(context.editCarpetRecord.__build134,true,'edit open must capture exact physical record id');

console.log('Build134 shared carpet edit + cloud confirmation: PASS');
