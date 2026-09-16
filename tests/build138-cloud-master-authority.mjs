import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build138-cloud-master-authority.js',import.meta.url),'utf8');
const store=new Map();
const localStorage={
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
};
const docListeners={};
const fakeNode=()=>({style:{},classList:{add(){},remove(){}},textContent:'',querySelectorAll:()=>[]});
const document={
  readyState:'loading',visibilityState:'visible',documentElement:{setAttribute(){}},
  addEventListener:(n,fn)=>{docListeners[n]=fn},
  getElementById:()=>null,
  querySelectorAll:()=>[]
};
const winListeners={};
const window={
  addEventListener:(n,fn)=>{winListeners[n]=fn},
  document,localStorage,
  RUNLUCloudStatusUXBuild123:{paint(){}},
};
const context=vm.createContext({window,document,localStorage,navigator:{onLine:true},console,setTimeout,clearTimeout,setInterval,clearInterval,alert(){}});
vm.runInContext(source,context,{filename:'build138-cloud-master-authority.js'});
const api=window.RUNLUCloudMasterAuthorityBuild138;
assert.ok(api,'Build138 API should be installed');

const managed='runlu_product_master_v21';
const carpet='runlu_carpet_inventory_v52';
const unrelated='legacy_custom_dataset';
const businessPayload='[{"id":"p1","name":"Do not change me"}]';
localStorage.setItem(managed,businessPayload);
localStorage.setItem(carpet,'[{"roll":"RC2246","length":"132.5833"}]');
localStorage.setItem('runlu_cloud_dirty_keys_v5544',JSON.stringify([managed,unrelated,carpet]));
localStorage.setItem('runlu_cloud_dataset_conflicts_v659_',JSON.stringify([managed,unrelated]));
localStorage.setItem('runlu_cloud_last_error_v5544','Legacy dataset conflict');
localStorage.setItem('runlu_cloud_master_offline_queue_v680',JSON.stringify([{id:'q1'}]));
localStorage.setItem('runlu_cloud_master_record_conflicts_v680',JSON.stringify([{queueId:'q1'}]));
localStorage.setItem('runlu_cloud_master_last_error_v680','Real master issue');

api.clearLegacyDatasetState();
assert.equal(localStorage.getItem(managed),businessPayload,'business data must never be edited when retiring legacy conflicts');
assert.deepEqual(JSON.parse(localStorage.getItem('runlu_cloud_dirty_keys_v5544')),[unrelated]);
assert.deepEqual(JSON.parse(localStorage.getItem('runlu_cloud_dataset_conflicts_v659_')),[unrelated]);
assert.equal(localStorage.getItem('runlu_cloud_last_error_v5544'),null);
assert.deepEqual(JSON.parse(localStorage.getItem('runlu_cloud_master_offline_queue_v680')),[{id:'q1'}],'real Cloud Master queue must remain untouched');
assert.deepEqual(JSON.parse(localStorage.getItem('runlu_cloud_master_record_conflicts_v680')),[{queueId:'q1'}],'real record conflicts must remain untouched');
assert.equal(localStorage.getItem('runlu_cloud_master_last_error_v680'),'Real master issue','real Cloud Master error must not be erased by legacy cleanup');

let syncCalls=0;
window.runluCloudMasterSync=async ({silent})=>{syncCalls++;assert.equal(silent,true);localStorage.removeItem('runlu_cloud_master_last_error_v680');return true};
const ok=await api.masterSync({silent:true});
assert.equal(ok,true);
assert.equal(syncCalls,1,'Sync Now authority should use record-level Cloud Master');
assert.equal(localStorage.getItem('runlu_cloud_master_last_error_v680'),null,'a successful Cloud Master sync may clear its own prior error');

window.protectedInputActive=()=>true;
syncCalls=0;
assert.equal(await api.masterAutoRefresh(false),false,'background refresh must not disturb active editing');
assert.equal(syncCalls,0);
window.protectedInputActive=()=>false;
assert.equal(await api.masterAutoRefresh(false),true);
assert.equal(syncCalls,1);

assert.match(source,/cloudSmartSync=async silent=>masterSync/,'legacy smart sync must be redirected');
assert.match(source,/cloudAutoRefresh=masterAutoRefresh/,'legacy polling callback must be redirected');
assert.match(source,/cloudSyncNow=fn/,'visible Sync Now must use Cloud Master authority');
assert.match(source,/cloudSyncDetails.*display='none'/s,'legacy whole-dataset detail panel must be retired');

console.log('PASS Build138 Cloud Master authority: stale dataset conflicts retired; business data and real record conflicts preserved; sync routes to Cloud Master.');
