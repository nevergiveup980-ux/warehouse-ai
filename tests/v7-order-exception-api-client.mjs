import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const calls=[];
globalThis.window={
  fetch: async (...args)=>globalThis.fetch(...args),
};
globalThis.fetch=async (url,opts={})=>{
  calls.push({url:String(url),opts});
  const u=String(url);
  if ((opts.method||'GET')==='POST') {
    return {
      ok:true,status:200,
      json:async()=>({ok:true,data:{status:'committed',order_id:'22222222-2222-4222-8222-222222222222'}}),
    };
  }
  if (u.includes('action=get')) {
    return {ok:true,status:200,json:async()=>({ok:true,data:{case_id:'33333333-3333-4333-8333-333333333333'}})};
  }
  return {ok:true,status:200,json:async()=>({ok:true,data:{summary:{total:1},cases:[]}})};
};

vm.runInThisContext(fs.readFileSync('v7/order-exception-api-client.js','utf8'));

const api=window.createRunluV7OrderExceptionApi({
  endpoint:'https://branch-ref.supabase.co/functions/v1/warehouse-v7-order-exception-api',
  tenantId:'44444444-4444-4444-8444-444444444444',
  getAccessToken:async()=> 'user-jwt-token',
  fetchImpl:globalThis.fetch,
});

const list=await api.list('open');
assert.equal(list.summary.total,1);
assert.match(calls[0].url,/action=list/);
assert.match(calls[0].url,/tenant_id=44444444-4444-4444-8444-444444444444/);
assert.equal(calls[0].opts.headers.Authorization,'Bearer user-jwt-token');

const detail=await api.get('33333333-3333-4333-8333-333333333333');
assert.equal(detail.case_id,'33333333-3333-4333-8333-333333333333');

const resolved=await api.resolve('33333333-3333-4333-8333-333333333333',{
  command_id:'55555555-5555-4555-8555-555555555555',
  expected_version:1,
  order_kind:'STANDARD',
  lifecycle:'in_progress',
  fulfillment_status:'pending',
  fields:{product_label:'Demo',quantity:'1',unit:'BOX',purchase_order_number:'PO-1'},
  resolution_note:'Verified.',
});
assert.equal(resolved.status,'committed');
const body=JSON.parse(calls.at(-1).opts.body);
assert.equal(body.command_id,'55555555-5555-4555-8555-555555555555');
assert.equal(body.action,'resolve');
assert.equal(body.tenant_id,'44444444-4444-4444-8444-444444444444');
assert.equal(body.case_id,'33333333-3333-4333-8333-333333333333');
assert.equal(body.expected_version,1);

const src=fs.readFileSync('v7/order-exception-api-client.js','utf8');
assert.doesNotMatch(src,/service_role|SUPABASE_SECRET|sb_secret_/i);
assert.ok(src.includes('Authorization'));
assert.ok(src.includes('crypto.randomUUID()'));

console.log('V7 order exception API client contract: PASS');
