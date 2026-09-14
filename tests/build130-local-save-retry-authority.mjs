import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build130-local-save-retry-authority.js',import.meta.url),'utf8');
const storageAlert='This device could not save the local cache. No cloud overwrite was attempted.';

function make({recover=true,unrelated=false}={}){
  const alerts=[];let calls=0,cleanup=0,cloudQueued=0;
  function inner(){
    calls++;
    if(unrelated)return false;
    if(calls===1||!recover){this.alert(storageAlert);return false}
    cloudQueued++;return true;
  }
  inner.__build072=true;
  inner.__build122=true;
  inner.__build128CarpetIdentityAuthority=true;

  const context={
    console,Date,JSON,Math,Promise,queueMicrotask,save:inner,alert:m=>alerts.push(String(m)),
    pruneLocalApplicationCache(){cleanup++;return {reclaimedBytes:2048}},
    aggressiveSafeStorageCleanup(){return {reclaimedBytes:0}},
    document:{readyState:'complete',documentElement:{setAttribute(){}},addEventListener(){}},
    addEventListener(){},setTimeout(fn){fn();return 1},setInterval(){return 1},clearInterval(){}
  };
  context.window=context;
  vm.runInNewContext(source,context,{filename:'build130-local-save-retry-authority.js'});
  return {context,alerts,get calls(){return calls},get cleanup(){return cleanup},get cloudQueued(){return cloudQueued}};
}

{
  const t=make({recover:true});
  assert.equal(t.context.save('runlu_inventory_records_v21',[]),true);
  assert.equal(t.calls,2);
  assert.equal(t.cleanup,1);
  assert.equal(t.cloudQueued,1);
  assert.equal(t.alerts.length,0,'first storage alert must be suppressed when cleanup recovers');
}

{
  const t=make({recover:false});
  assert.equal(t.context.save('runlu_inventory_records_v21',[]),false);
  assert.equal(t.calls,2);
  assert.equal(t.cleanup,1);
  assert.equal(t.cloudQueued,0);
  assert.equal(t.alerts.length,1);
  assert.match(t.alerts[0],/No cloud overwrite was attempted/);
}

{
  const t=make({unrelated:true});
  assert.equal(t.context.save('x',[]),false);
  assert.equal(t.calls,1,'non-storage false result must not be retried');
  assert.equal(t.cleanup,0);
  assert.equal(t.alerts.length,0);
}

console.log('Build130 local save retry authority: PASS');
