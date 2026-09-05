import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const repoRoot=resolve(here,'../../..');

class MemoryStorage{
  #map=new Map();
  get length(){return this.#map.size}
  key(i){return [...this.#map.keys()][i]??null}
  getItem(k){k=String(k);return this.#map.has(k)?this.#map.get(k):null}
  setItem(k,v){this.#map.set(String(k),String(v))}
  removeItem(k){this.#map.delete(String(k))}
  clear(){this.#map.clear()}
}

globalThis.localStorage=new MemoryStorage();
if(!globalThis.crypto)globalThis.crypto=webcrypto;

for(const file of ['workspace.js','local-auth.js','backup-manager.js']){
  const code=await readFile(resolve(repoRoot,'universal',file),'utf8');
  vm.runInThisContext(code,{filename:file});
}

const W=globalThis.RUNLUWorkspace,A=globalThis.RUNLULocalAuth,B=globalThis.RUNLUBackup;
assert.ok(W&&A&&B,'Local runtime modules must load');

const workspace={schemaVersion:2,mode:'local-first',organizationId:'org_test',warehouseId:'wh_test',createdAt:new Date().toISOString(),cloud:{provider:null,status:'not-configured',managedBy:'customer'},config:{company:{name:'Test Flooring'},warehouse:{name:'Main Warehouse',code:'MAIN',cutAllowance:{enabled:false,inches:0}},features:{inventory:true}}};
localStorage.setItem(W.WORKSPACE_KEY,JSON.stringify(workspace));

await A.createOwner({displayName:'Owner Test',username:'owner',email:'owner@example.test',pin:'2468'});
assert.equal(W.role(),'owner');
assert.equal(W.can('backupData'),true);
assert.equal(W.can('manageWarehouse'),true);

await A.createUser({displayName:'Staff Test',username:'staff',email:'',pin:'1357',role:'member'});
await A.createUser({displayName:'Manager Test',username:'manager',email:'',pin:'8642',role:'manager'});

// Verify the local credential store structurally rather than searching random
// ciphertext/base64 for a short four-digit sequence (which can occur by chance).
const rawUsers=JSON.parse(localStorage.getItem(A.usersKey())||'[]');
assert.equal(rawUsers.length,3);
for(const user of rawUsers){
  assert.equal(Object.prototype.hasOwnProperty.call(user,'pin'),false,'Plaintext PIN field must never be stored');
  assert.equal(typeof user.salt,'string');
  assert.equal(typeof user.pinHash,'string');
  assert.equal(user.salt.length>0,true);
  assert.equal(user.pinHash.length>=64,true);
}
assert.notEqual(rawUsers.find(u=>u.username==='owner')?.pinHash,'2468','Owner PIN must be one-way hashed');
assert.notEqual(rawUsers.find(u=>u.username==='staff')?.pinHash,'1357','Staff PIN must be one-way hashed');
assert.notEqual(rawUsers.find(u=>u.username==='manager')?.pinHash,'8642','Manager PIN must be one-way hashed');

const tenantKey='runlu-universal-v1::org_test::wh_test::inventory-test';
localStorage.setItem(tenantKey,JSON.stringify([{sku:'SKU-SECRET',quantity:12}]));
const encrypted=await B.exportEncrypted('backup-secret');
assert.ok(encrypted.includes('RUNLU-WAREHOUSE-BACKUP'));
assert.equal(encrypted.includes('SKU-SECRET'),false,'Encrypted backup must not expose warehouse records as plaintext');

A.signOut();
await A.authenticate('staff','1357');
assert.equal(W.role(),'member');
assert.equal(W.can('receive'),true);
assert.equal(W.can('manageProducts'),false);
assert.equal(W.can('backupData'),false);
await assert.rejects(()=>B.exportEncrypted('backup-secret'),/Owner role required/);

A.signOut();
await A.authenticate('manager','8642');
assert.equal(W.can('manageProducts'),true);
assert.equal(W.can('editInventory'),true);
assert.equal(W.can('manageWarehouse'),false);

localStorage.setItem(tenantKey,JSON.stringify([{sku:'CHANGED',quantity:0}]));
await B.restoreEncrypted(encrypted,'backup-secret');
assert.equal(W.session(),null,'Restore must require a fresh sign-in');
assert.deepEqual(JSON.parse(localStorage.getItem(tenantKey)),[{sku:'SKU-SECRET',quantity:12}]);
await A.authenticate('owner','2468');
assert.equal(A.currentUser().displayName,'Owner Test');
assert.equal(W.can('backupData'),true);
await assert.rejects(()=>B.decryptEnvelope(encrypted,'wrong-password'),/incorrect|damaged/i);

console.log('RUNLU local account, role and encrypted backup round-trip tests passed.');
