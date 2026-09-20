import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('v7/orders-command-center-1.0.sql','utf8');
const html=fs.readFileSync('v7/orders-command-center.html','utf8');
const js=fs.readFileSync('v7/orders-command-center.js','utf8');
const client=fs.readFileSync('v7/orders-command-center-local-api-client.js','utf8');
const server=fs.readFileSync('v7/order-exception-local-engineering-server.mjs','utf8');

for(const x of ['get_orders_command_center','attention_total','needs_binding','ready_receive','ready_ship','recent_actions'])assert.ok(sql.includes(x),x);
for(const x of ['Orders Command Center','Exceptions','Needs binding','Ready to Receive','Ready to Ship','Completed','Recent execution'])assert.ok(html.includes(x),x);
for(const x of ['attention_total','recent_actions','Command Center connected'])assert.ok(js.includes(x),x);
assert.ok(server.includes('/api/orders-command-center'));assert.ok(server.includes('get_orders_command_center'));
assert.doesNotMatch(client,/localStorage|sessionStorage|service_role|sb_secret_/i);

const calls=[];const fakeFetch=async(url,opts={})=>{calls.push({url,opts});return {ok:true,status:200,json:async()=>({ok:true,data:{summary:{attention_total:0},lanes:{},recent_actions:[]}})}};
const ctx={window:{location:{href:'http://127.0.0.1:8787/orders-command-center.html',origin:'http://127.0.0.1:8787',hostname:'127.0.0.1'},fetch:fakeFetch},URL};
vm.createContext(ctx);vm.runInContext(client,ctx);
const api=ctx.window.createRunluV7LocalOrdersCommandCenterApi({fetchImpl:fakeFetch});await api.get();
assert.equal(calls.length,1);assert.equal(calls[0].opts.method,'GET');
const remote={window:{location:{href:'https://example.com/',origin:'https://example.com',hostname:'example.com'},fetch:fakeFetch},URL};vm.createContext(remote);vm.runInContext(client,remote);
assert.throws(()=>remote.window.createRunluV7LocalOrdersCommandCenterApi({fetchImpl:fakeFetch}),/V7_LOCAL_COMMAND_CENTER_REQUIRES_LOOPBACK_PAGE/);
console.log('V7 orders command center contract: PASS');
