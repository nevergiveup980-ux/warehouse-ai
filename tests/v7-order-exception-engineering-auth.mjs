import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src=fs.readFileSync('v7/order-exception-engineering-auth.js','utf8');

assert.doesNotMatch(src,/service_role|SUPABASE_SECRET|sb_secret_|localStorage|sessionStorage/i);
assert.ok(src.includes("PROD_REF = 'ekrnknlawekeoszzkamd'"));
assert.ok(src.includes('PRODUCTION_PROJECT_FORBIDDEN'));
assert.ok(src.includes('/auth/v1/token?grant_type=password'));
assert.ok(src.includes('/auth/v1/token?grant_type=refresh_token'));
assert.ok(src.includes('/auth/v1/logout'));

const calls=[];
const now=()=>1_800_000_000_000;
const fakeFetch=async(url,opts={})=>{
  calls.push({url:String(url),opts});
  if(String(url).includes('grant_type=password')){
    return {ok:true,status:200,json:async()=>({
      access_token:'token-1',
      refresh_token:'refresh-1',
      expires_at:Math.floor(now()/1000)+3600,
      user:{id:'11111111-1111-4111-8111-111111111111',email:'admin@example.test'}
    })};
  }
  if(String(url).includes('grant_type=refresh_token')){
    return {ok:true,status:200,json:async()=>({
      access_token:'token-2',
      refresh_token:'refresh-2',
      expires_at:Math.floor(now()/1000)+3600
    })};
  }
  if(String(url).includes('/auth/v1/logout')){
    return {ok:true,status:204,json:async()=>null};
  }
  throw new Error('unexpected fetch '+url);
};

const context={
  window:{
    fetch:fakeFetch,
    createRunluV7OrderExceptionApi:(cfg)=>cfg,
  },
  URL,
};
vm.createContext(context);
vm.runInContext(src,context);

const factory=context.window.createRunluV7EngineeringWorkbenchAuth;
assert.equal(typeof factory,'function');

assert.throws(()=>factory({
  projectUrl:'https://ekrnknlawekeoszzkamd.supabase.co',
  publishableKey:'sb_publishable_test',
  tenantId:'22222222-2222-4222-8222-222222222222',
  fetchImpl:fakeFetch,
}),/PRODUCTION_PROJECT_FORBIDDEN/);

const auth=factory({
  projectUrl:'https://devbranchref.supabase.co',
  publishableKey:'sb_publishable_test',
  tenantId:'22222222-2222-4222-8222-222222222222',
  fetchImpl:fakeFetch,
  now,
});
assert.equal(auth.projectRef,'devbranchref');
assert.equal(auth.isSignedIn(),false);

const signed=await auth.signIn('admin@example.test','password-123');
assert.equal(signed.user.email,'admin@example.test');
assert.equal(auth.isSignedIn(),true);
assert.equal(await auth.getAccessToken(),'token-1');

const api=auth.connectedApi();
assert.equal(api.endpoint,'https://devbranchref.supabase.co/functions/v1/warehouse-v7-order-exception-api');
assert.equal(api.tenantId,'22222222-2222-4222-8222-222222222222');
assert.equal(await api.getAccessToken(),'token-1');

await auth.signOut();
assert.equal(auth.isSignedIn(),false);
await assert.rejects(()=>auth.getAccessToken(),/ENGINEERING_SIGN_IN_REQUIRED/);

console.log('V7 engineering workbench auth contract: PASS');
