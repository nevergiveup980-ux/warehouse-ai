import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src=fs.readFileSync('v7/order-exception-workbench-adapter.js','utf8');

assert.doesNotMatch(src,/https?:\/\//i);
assert.doesNotMatch(src,/SUPABASE_|service_role|anon[_-]?key|localStorage|sessionStorage/i);
assert.ok(src.includes('crypto.randomUUID()'));
assert.ok(src.includes('resolve_order_exception_create_order'));
assert.ok(src.includes('list_order_exception_workbench'));
assert.ok(src.includes('get_order_exception_workbench_case'));

const calls=[];
const context={
  window:{},
  crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},
};
vm.createContext(context);
vm.runInContext(src,context);

const factory=context.window.RUNLU_V7_CREATE_ORDER_EXCEPTION_API;
assert.equal(typeof factory,'function');

const api=factory({
  tenantId:'22222222-2222-4222-8222-222222222222',
  actorId:'33333333-3333-4333-8333-333333333333',
  deviceId:'TEST_DEVICE',
  rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='list_order_exception_workbench') return {data:{cases:[],summary:{total:0}},error:null};
    if(name==='get_order_exception_workbench_case') return {data:{case_id:args.p_case},error:null};
    if(name==='resolve_order_exception_create_order') return {data:{status:'committed',case_id:args.p_case},error:null};
    throw new Error('unexpected rpc');
  }
});

const list=await api.list('open');
assert.equal(list.summary.total,0);
assert.deepEqual(calls[0],{
  name:'list_order_exception_workbench',
  args:{
    p_tenant:'22222222-2222-4222-8222-222222222222',
    p_status:'open'
  }
});

const detail=await api.get('case-1');
assert.equal(detail.case_id,'case-1');
assert.equal(calls[1].name,'get_order_exception_workbench_case');
assert.equal(calls[1].args.p_case,'case-1');

const resolved=await api.resolve('case-1',{
  expected_version:7,
  order_kind:'STANDARD',
  lifecycle:'in_progress',
  fulfillment_status:'pending',
  fields:{product_label:'Example',quantity:'2',unit:'BOX'},
  resolution_note:'Verified'
});
assert.equal(resolved.status,'committed');
assert.equal(calls[2].name,'resolve_order_exception_create_order');
assert.equal(calls[2].args.p_command,'11111111-1111-4111-8111-111111111111');
assert.equal(calls[2].args.p_expected_version,7);
assert.equal(calls[2].args.p_actor,'33333333-3333-4333-8333-333333333333');
assert.equal(calls[2].args.p_device,'TEST_DEVICE');

await assert.rejects(
  async()=>factory({tenantId:'t',actorId:'a',rpc:async()=>({error:{message:'denied'}})}).list('open'),
  /denied/
);

console.log('V7 order exception workbench adapter: PASS');
