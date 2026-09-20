import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const client=fs.readFileSync('v7/order-exception-local-api-client.js','utf8');
const config=fs.readFileSync('v7/order-exception-local-engineering-config.js','utf8');
const server=fs.readFileSync('v7/order-exception-local-engineering-server.mjs','utf8');
const page=fs.readFileSync('v7/order-exception-workbench.html','utf8');
const ui=fs.readFileSync('v7/order-exception-workbench.js','utf8');

assert.ok(server.includes("const HOST='127.0.0.1'"));
assert.ok(server.includes("DB!=='warehouse_v7_test'"));
assert.ok(server.includes('LOCAL_WORKBENCH_REFUSES_DATABASE'));
assert.ok(server.includes('requestIsLoopback'));
assert.ok(server.includes('production_reachable:false'));
assert.doesNotMatch(server,/0\.0\.0\.0|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i);
assert.ok(config.includes('RUNLU_V7_LOCAL_ENGINEERING_CONFIG = null'));
assert.ok(page.includes('order-exception-local-engineering-config.js'));
assert.ok(page.includes('order-exception-local-api-client.js'));
assert.ok(ui.includes('DISPOSABLE V7'));
assert.ok(ui.includes('RUNLU_V7_LOCAL_ENGINEERING_CONFIG'));
assert.doesNotMatch(client,/localStorage|sessionStorage|service_role|sb_secret_/i);

const calls=[];
const fakeFetch=async(url,opts={})=>{
  calls.push({url,opts});
  return {ok:true,status:200,json:async()=>({ok:true,data:{url,method:opts.method||'GET'}})};
};
const context={window:{location:{href:'http://127.0.0.1:8787/order-exception-workbench.html',origin:'http://127.0.0.1:8787',hostname:'127.0.0.1'},fetch:fakeFetch},URL,crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}};
vm.createContext(context); vm.runInContext(client,context);
const api=context.window.createRunluV7LocalOrderExceptionApi({endpoint:'/api/order-exception',fetchImpl:fakeFetch});
await api.list('open'); await api.get('22222222-2222-4222-8222-222222222222');
await api.resolve('22222222-2222-4222-8222-222222222222',{command_id:'33333333-3333-4333-8333-333333333333',expected_version:1,order_kind:'STANDARD',lifecycle:'in_progress',fulfillment_status:'pending',fields:{product_label:'Example',quantity:'1',unit:'BOX'},resolution_note:'Synthetic'});
assert.equal(calls.length,3); assert.match(calls[0].url,/action=list/); assert.match(calls[1].url,/action=get/); assert.equal(calls[2].opts.method,'POST');

const remote={window:{location:{href:'https://example.com/workbench',origin:'https://example.com',hostname:'example.com'},fetch:fakeFetch},URL,crypto:context.crypto};
vm.createContext(remote); vm.runInContext(client,remote);
assert.throws(()=>remote.window.createRunluV7LocalOrderExceptionApi({endpoint:'/api/order-exception',fetchImpl:fakeFetch}),/V7_LOCAL_ENGINEERING_REQUIRES_LOOPBACK_PAGE/);
console.log('V7 disposable local order-exception workbench: PASS');
