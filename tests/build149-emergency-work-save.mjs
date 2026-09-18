import fs from'node:fs';import vm from'node:vm';import assert from'node:assert/strict';
const code=fs.readFileSync(new URL('../build149-emergency-work-save.js',import.meta.url),'utf8');
const D='runlu_cutting_log_v52',Q='runlu_cloud_master_offline_queue_v680';const m=new Map([[D,'[]'],[Q,'[]']]);
const ls={getItem:k=>m.get(k)||null,setItem:(k,v)=>{if(k===D)throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});m.set(k,String(v))}};
let sync=0;const w={save:(k,v)=>{try{ls.setItem(k,JSON.stringify(v));return true}catch{return false}},runluCloudMasterSync:()=>{sync++}};
const ctx={window:w,localStorage:ls,setInterval:()=>0,clearInterval(){},Date,Math,JSON,Set,Map,String,console};w.window=w;vm.createContext(ctx);vm.runInContext(code,ctx);
const cut={id:'CUT-RC2291-TEST',rollId:'RC2291',collection:'ELEVATED',requestedLength:10,location:'13C'};
assert.equal(w.save(D,[cut]),true);const q=JSON.parse(ls.getItem(Q));assert.equal(q.length,1);assert.equal(q[0].recordId,'CUT-RC2291-TEST');assert.equal(q[0].source,'build149-emergency-live-save');assert.equal(q[0].emergencyWorkSave,true);assert.equal(JSON.parse(ls.getItem(D)).length,0);assert.equal(sync,1);
assert.doesNotMatch(code,/warehouse_apply_mutation/);console.log('Build149 quota failure carpet cutting recovery: PASS');