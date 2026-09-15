import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build135-carpet-save-readback.js',import.meta.url),'utf8');
assert.match(source,/await waitUntilCloudIdle\(2500\)/,'readback must wait for earlier cloud writes to settle');
assert.match(source,/await api\.refresh\(false\)/,'readback must refresh from Warehouse Cloud');
assert.match(source,/api\?\.get\?\.\(CARPETDB\)/,'readback must inspect Cloud-First RAM after refresh');
assert.match(source,/renderCarpetInventory\(\)/,'confirmed readback must repaint carpet inventory');
assert.match(source,/openCarpetDetail\(row\.id\)/,'confirmed readback must reopen the canonical physical roll');

const dom=new Map([
  ['ceRoll',{value:'CHC022'}],
  ['ceMfr',{value:'9692'}],
]);
const document={
  getElementById(id){return dom.get(id)||null},
  documentElement:{setAttribute(){}},
};
const cloudRows=[{id:1721450000005,roll:'CHC022',sourceRoll:'CHC022',manufacturerRoll:'9692',status:'Active'}];
const context={
  console,JSON,Math,Date,Promise,
  document,
  setInterval(){return 1},clearInterval(){},setTimeout(fn){fn();return 1},
  alert(){},
  addEventListener(){},
  saveCarpetEdit(){return 'legacy'},
  carpetRecords(){return cloudRows},
  RUNLUCloudFirstBuild133:{status(){return{pending:0}},async refresh(){return true},get(){return cloudRows}},
  RUNLUSharedCarpetEditBuild134:{
    editId:1721450000005,
    rowSharedCode(r){return String(r.sourceRoll||r.roll||'').toUpperCase()},
    async saveSharedEdit(){return true},
  },
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build135-carpet-save-readback.js'});
const api=context.RUNLUCarpetSaveReadbackBuild135;
assert.ok(api,'Build135 API must install');
assert.equal(api.version,'135');
assert.equal(api.sharedCode('chc022'),true);
assert.equal(api.sharedCode('CHC023'),true);
assert.equal(api.sharedCode('RC2348'),false);
assert.equal(context.saveCarpetEdit.__build135,true,'Save Changes must be wrapped after Build134');
const row=api.matchingRow(cloudRows,'CHC022','9692',1721450000005);
assert.equal(row.manufacturerRoll,'9692','cloud-confirmed manufacturer roll must win');

console.log('Build135 carpet save cloud readback + repaint: PASS');
