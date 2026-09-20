import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sql=fs.readFileSync('v7/inventory-command-center-1.0.sql','utf8');
const html=fs.readFileSync('v7/inventory-command-center.html','utf8');
const js=fs.readFileSync('v7/inventory-command-center.js','utf8');
const client=fs.readFileSync('v7/inventory-command-center-local-api-client.js','utf8');
const server=fs.readFileSync('v7/inventory-command-center-local-server.mjs','utf8');
const stage=fs.readFileSync('v7/carpet-identity-v2-stage.py','utf8');

assert.match(sql,/V7_INVENTORY_COMMAND_CENTER/);
assert.match(sql,/derived_carpet_identity_v7/);
assert.match(sql,/shared_legacy_roll_number/);
assert.match(sql,/manufacturer_roll_role','reference_only'/);
assert.match(sql,/carpet_operational_cutover',false/);
assert.match(sql,/position\(lower\(qtext\)/);
assert.doesNotMatch(sql,/insert into warehouse_v7\.carpet_roll/i);
assert.doesNotMatch(sql,/update warehouse_v7\.carpet_roll/i);

assert.match(html,/Inventory Command Center/);
assert.match(html,/Company roll-number identity first/);
assert.match(html,/Shared CHC/);
assert.match(html,/READ ONLY/);
assert.doesNotMatch(html,/manufacturerRoll/);

assert.match(js,/state=\{api:null,overview:null,list:null,kind:'ALL'/);
assert.match(js,/shared_legacy_roll_number/);
assert.match(js,/carpet_operational_cutover/);
assert.doesNotMatch(js,/localStorage|sessionStorage/);

assert.match(server,/INVENTORY_COMMAND_CENTER_READ_ONLY/);
assert.match(server,/warehouse_v7_test/);
assert.match(server,/127\.0\.0\.1/);
assert.doesNotMatch(server,/service_role|SUPABASE_SERVICE/i);
assert.match(stage,/CARPET_IDENTITY_STAGE_REFUSES_DATABASE/);
assert.match(stage,/operational_inventory_writes/);
assert.match(stage,/derived_carpet_identity_v7/);

const calls=[];
const window={
  location:{href:'http://127.0.0.1:8788/inventory-command-center.html'},
  fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({ok:true,data:{items:[]}})};}
};
vm.runInNewContext(client,{window,URL,Set,Error,Object,String});
const api=window.createRunluV7LocalInventoryCommandCenterApi({fetchImpl:window.fetch});
await api.get();
await api.list({kind:'SHARED',query:'CHC022',location:'12C',limit:25});
assert.equal(calls.length,2);
const u0=new URL(calls[0].url),u1=new URL(calls[1].url);
assert.equal(u0.searchParams.get('action'),'overview');
assert.equal(u1.searchParams.get('action'),'list');
assert.equal(u1.searchParams.get('kind'),'SHARED');
assert.equal(u1.searchParams.get('q'),'CHC022');
assert.equal(u1.searchParams.get('location'),'12C');
assert.equal(u1.searchParams.get('limit'),'25');
assert.equal(calls[0].options.method,'GET');

console.log('V7 Inventory Command Center static + local client contract: PASS');
