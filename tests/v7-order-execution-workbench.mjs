import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('v7/order-execution-workbench-1.0.sql','utf8');
const html=fs.readFileSync('v7/order-execution-workbench.html','utf8');
const js=fs.readFileSync('v7/order-execution-workbench.js','utf8');
const client=fs.readFileSync('v7/order-execution-local-api-client.js','utf8');
const server=fs.readFileSync('v7/order-exception-local-engineering-server.mjs','utf8');

for(const x of ['list_order_execution_workbench','get_order_execution_workbench_task','stock_version','remaining_quantity','can_execute'])assert.ok(sql.includes(x),x);
for(const x of ['Order Execution Workbench','Quantity to execute','order-execution-local-api-client.js'])assert.ok(html.includes(x),x);
for(const x of ['pendingCommands','pendingStockIds','expected_stock_version','Inventory movement and order fulfillment action are linked'])assert.ok(js.includes(x),x);
assert.ok(server.includes("/api/order-execution"));
assert.ok(server.includes("receive_bound_order_stock"));
assert.ok(server.includes("ship_bound_order_stock"));
assert.doesNotMatch(client,/localStorage|sessionStorage|service_role|sb_secret_/i);

const calls=[];
const fakeFetch=async(url,opts={})=>{calls.push({url,opts});return {ok:true,status:200,json:async()=>({ok:true,data:{status:'committed'}})}};
const ctx={window:{location:{href:'http://127.0.0.1:8787/order-execution-workbench.html',origin:'http://127.0.0.1:8787',hostname:'127.0.0.1'},fetch:fakeFetch},URL,crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}};
vm.createContext(ctx);vm.runInContext(client,ctx);
const api=ctx.window.createRunluV7LocalOrderExecutionApi({fetchImpl:fakeFetch});
await api.list('open');await api.get('22222222-2222-4222-8222-222222222222');await api.execute('22222222-2222-4222-8222-222222222222',{command_id:'33333333-3333-4333-8333-333333333333',stock_item_id:'44444444-4444-4444-8444-444444444444',expected_order_version:1,expected_stock_version:0,quantity:1});
assert.equal(calls.length,3);assert.match(calls[0].url,/action=list/);assert.match(calls[1].url,/action=get/);assert.equal(calls[2].opts.method,'POST');

const remote={window:{location:{href:'https://example.com/',origin:'https://example.com',hostname:'example.com'},fetch:fakeFetch},URL,crypto:ctx.crypto};
vm.createContext(remote);vm.runInContext(client,remote);
assert.throws(()=>remote.window.createRunluV7LocalOrderExecutionApi({fetchImpl:fakeFetch}),/V7_LOCAL_EXECUTION_REQUIRES_LOOPBACK_PAGE/);
console.log('V7 order execution workbench contract: PASS');
