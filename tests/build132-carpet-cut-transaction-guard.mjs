import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const indexSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const patchSource=fs.readFileSync(new URL('../build132-carpet-cut-transaction-guard.js',import.meta.url),'utf8');
const version=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8'));
const cycles=Math.max(100,Number(process.env.RUNLU_BUILD132_CYCLES||3000));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const must=(c,m)=>{if(!c)throw new Error(m)};

function extractFunction(name){
  const needle=`function ${name}`;
  const start=indexSource.indexOf(needle);if(start<0)throw new Error(`Production function not found: ${name}`);
  const open=indexSource.indexOf('(',start);let pd=0,q='',esc=false,lc=false,bc=false,close=-1;
  for(let i=open;i<indexSource.length;i++){
    const c=indexSource[i],n=indexSource[i+1];
    if(lc){if(c==='\n')lc=false;continue}if(bc){if(c==='*'&&n==='/'){bc=false;i++}continue}
    if(q){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===q)q='';continue}
    if(c==='/'&&n==='/'){lc=true;i++;continue}if(c==='/'&&n==='*'){bc=true;i++;continue}if(c==='"'||c==="'"||c==='`'){q=c;continue}
    if(c==='(')pd++;else if(c===')'&&--pd===0){close=i;break}
  }
  const brace=indexSource.indexOf('{',close+1);let depth=0;q='';esc=false;lc=false;bc=false;
  for(let i=brace;i<indexSource.length;i++){
    const c=indexSource[i],n=indexSource[i+1];
    if(lc){if(c==='\n')lc=false;continue}if(bc){if(c==='*'&&n==='/'){bc=false;i++;continue}
    if(q){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===q)q='';continue}
    if(c==='/'&&n==='/'){lc=true;i++;continue}if(c==='/'&&n==='*'){bc=true;i++;continue}if(c==='"'||c==="'"||c==='`'){q=c;continue}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return indexSource.slice(start,i+1);
  }
  throw new Error(`Unclosed production function: ${name}`);
}

const functionNames=[
  'load','save','normalizeText','normKey','carpetRollKey','cleanManufacturerRoll','findCarpetRoll','findCarpetRollForOperation',
  'carpetRecords','cuttingRecords','carpetActualCutLength','carpetCutConsumptionPlan','feetLabel','validateOperationForImpact',
  'updateLinkedOrder','applySingleOperationImpact'
];
const exactSource=functionNames.map(extractFunction).join('\n\n');

const K={INVDB:'runlu_inventory_records_v21',ODB:'runlu_orders_v20',RCVDB:'runlu_receiving_v50',LOGDB:'runlu_operations_log_v52',CARPETDB:'runlu_carpet_inventory_v52',CUTDB:'runlu_cutting_log_v52',EVENTDB:'runlu_event_history_v52',RAMDB:'runlu_remnants_v55'};
function memoryStorage(){
  const m=new Map(),writes=[];let failKey='';
  return {
    getItem:k=>m.has(String(k))?m.get(String(k)):null,
    setItem(k,v){k=String(k);writes.push(k);if(failKey===k){failKey='';throw new Error(`LAB injected write failure: ${k}`)}m.set(k,String(v))},
    removeItem(k){k=String(k);writes.push(k);m.delete(k)},
    seed(k,v){m.set(String(k),typeof v==='string'?v:JSON.stringify(v))},
    json:k=>JSON.parse(m.get(String(k))||'null'),raw:k=>m.get(String(k))??null,failOnce:k=>{failKey=String(k)},writes:()=>writes.slice(),clearWrites(){writes.length=0},
    snapshot:()=>Object.fromEntries([...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])))
  };
}
function boot(){
  const localStorage=memoryStorage(),alerts=[],cloud=[];let network=0;
  const blocked=n=>()=>{network++;throw new Error(`LAB blocked network: ${n}`)};
  const doc={documentElement:{setAttribute(){}},getElementById(){return null}};
  const box={console:{log(){},info(){},warn(){},error(){},debug(){}},localStorage,document:doc,Date,JSON,Math,Number,String,Array,Object,Boolean,RegExp,Error,TypeError,Promise,Map,Set,
    alert:m=>alerts.push(String(m)),queueCloudSave:(k,v)=>cloud.push([String(k),JSON.parse(JSON.stringify(v))]),isQuotaError(){return false},pruneLocalApplicationCache(){return{}},aggressiveSafeStorageCleanup(){return{}},renderBackupStatus(){},
    finalizeCustomerOrderInventory(){return{records:0,quantity:0}},fetch:blocked('fetch'),XMLHttpRequest:class{constructor(){network++;throw new Error('LAB blocked XHR')}},WebSocket:class{constructor(){network++;throw new Error('LAB blocked WebSocket')}},
    setTimeout(fn){fn();return 1},clearTimeout(){},...K
  };
  box.window=box;box.window.addEventListener=()=>{};
  vm.createContext(box,{name:'RUNLU Build132 Carpet Cut Transaction LAB'});
  vm.runInContext(exactSource,box,{filename:'index.html#exact-cut-functions',timeout:2000});
  vm.runInContext(patchSource,box,{filename:'build132-carpet-cut-transaction-guard.js',timeout:1500});
  must(box.applySingleOperationImpact?.__build132===true,'Build132 wrapper did not install');
  return{box,localStorage,alerts,cloud,network:()=>network};
}
function seed(e,{length=100,roll='RC9001',carpetId=9001,po='LAB-JOB-181626',orderStatus='In Progress'}={}){
  const s=e.localStorage;
  s.seed(K.CARPETDB,[{id:carpetId,roll,manufacturerRoll:'MFG-9001',collection:'LAB CARPET',colour:'TEST GREY',length,originalLength:length,width:'12',location:'14C',measure:'FULL',status:'Active',po}]);
  s.seed(K.CUTDB,[]);s.seed(K.EVENTDB,[]);s.seed(K.ODB,[{id:'JOB-181626',jobNumber:'181626',poNumber:po,status:orderStatus}]);s.seed(K.INVDB,[{id:'GEN-1',quantity:42}]);s.seed(K.RCVDB,[]);s.seed(K.RAMDB,[]);s.clearWrites();e.cloud.length=0;
  return{roll,carpetId,po};
}
function op(x,{id=501,qty=10,cuts=1,roll=x.roll,carpetRecordId=x.carpetId,po=x.po}={}){return{id,date:'2026-09-15',time:'10:15',status:'Completed',type:'Carpet Cutting',inventoryMode:'Stock',roll,carpetRecordId,quantity:qty,requestedQuantity:qty,numberOfCuts:cuts,allowanceInches:cuts*3,po,customer:'LAB CUSTOMER',operator:'LAB',collection:'LAB CARPET',colour:'TEST GREY',notes:'Build132 transaction test'}}
const rawWatched=e=>Object.fromEntries([K.CARPETDB,K.CUTDB,K.ODB,K.EVENTDB].map(k=>[k,e.localStorage.raw(k)]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function check(name,fn){try{return{name,pass:true,...(fn()||{})}}catch(err){return{name,pass:false,error:err?.message||String(err)}}}

const scenarios=[];
scenarios.push(check('Build132 installs over exact current stable carpet-cut path',()=>{const e=boot();return{runtime:`${version.version} Build${version.build}`,indexSha256:sha(indexSource),exactSha256:sha(exactSource),patchSha256:sha(patchSource)}}));
scenarios.push(check('Fresh cut commits roll + cut ledger + order + event as one verified unit',()=>{
  const e=boot(),x=seed(e),r=op(x,{id:600,qty:10,cuts:2});must(e.box.applySingleOperationImpact(r)===true,'cut rejected');
  const roll=e.localStorage.json(K.CARPETDB)[0],cut=e.localStorage.json(K.CUTDB)[0],order=e.localStorage.json(K.ODB)[0],events=e.localStorage.json(K.EVENTDB);
  must(Math.abs(roll.length-89.5)<1e-9,'roll balance wrong');must(cut.allowanceInches===6&&Math.abs(cut.actualCutLength-10.5)<1e-9,'allowance wrong');must(order.status==='Ready','order not Ready');must(events.length===1,'event count wrong');must(e.cloud.length===4,'cloud writes were not buffered/flushed as one verified set');must(e.network()===0,'network attempted');return{remaining:roll.length,cloudWrites:e.cloud.length};
}));
scenarios.push(check('Reconstructed retry with same operation ID is idempotent',()=>{
  const e=boot(),x=seed(e),first=op(x,{id:601,qty:7,cuts:1});must(e.box.applySingleOperationImpact(first),'first cut failed');const after=rawWatched(e),cloudAfter=e.cloud.length;
  const replay=op(x,{id:601,qty:7,cuts:1});must(e.box.applySingleOperationImpact(replay),'safe replay rejected');must(same(rawWatched(e),after),'replay changed persisted state');must(e.cloud.length===cloudAfter,'replay queued cloud mutation');must(replay.impactApplied===true,'replay not recovered as applied');must(e.localStorage.json(K.CUTDB).length===1&&e.localStorage.json(K.EVENTDB).length===1,'duplicate ledger/event created');return{idempotent:true};
}));
scenarios.push(check('Operation-ID collision with different cut details rejects without mutation',()=>{
  const e=boot(),x=seed(e),first=op(x,{id:602,qty:5});must(e.box.applySingleOperationImpact(first),'first cut failed');const before=rawWatched(e),cloud=e.cloud.length;
  const collision=op(x,{id:602,qty:6});must(e.box.applySingleOperationImpact(collision)===false,'collision accepted');must(same(rawWatched(e),before),'collision mutated state');must(e.cloud.length===cloud,'collision queued cloud write');return{safeReject:true};
}));
for(const [label,key] of [['Carpet Inventory',K.CARPETDB],['Cut History',K.CUTDB],['Linked Order',K.ODB],['Event History',K.EVENTDB]]){
  scenarios.push(check(`${label} write failure rolls back every cut dataset`,()=>{
    const e=boot(),x=seed(e),r=op(x,{id:700+scenarios.length,qty:8,cuts:2}),before=rawWatched(e);e.localStorage.failOnce(key);
    must(e.box.applySingleOperationImpact(r)===false,'faulted transaction reported success');must(same(rawWatched(e),before),`fault at ${key} left partial state`);must(e.cloud.length===0,'faulted transaction leaked cloud queue writes');must(!r.impactApplied,'faulted operation remained applied');return{rolledBack:true,failedDataset:key};
  }));
}
scenarios.push(check('Insufficient roll rejects with zero persisted or cloud mutation',()=>{
  const e=boot(),x=seed(e,{length:5}),r=op(x,{id:710,qty:6}),before=rawWatched(e);must(e.box.applySingleOperationImpact(r)===false,'insufficient cut accepted');must(same(rawWatched(e),before),'insufficient cut mutated state');must(e.cloud.length===0,'insufficient cut queued cloud write');return{safeReject:true};
}));
scenarios.push(check('Unknown RC rejects with zero persisted or cloud mutation',()=>{
  const e=boot(),x=seed(e),r=op(x,{id:711,roll:'RC-NOT-FOUND',carpetRecordId:'',qty:3}),before=rawWatched(e);must(e.box.applySingleOperationImpact(r)===false,'unknown RC accepted');must(same(rawWatched(e),before),'unknown RC mutated state');must(e.cloud.length===0,'unknown RC queued cloud write');return{safeReject:true};
}));
scenarios.push(check('Historical partial execution is blocked instead of deducting again',()=>{
  const e=boot(),x=seed(e),r=op(x,{id:712,qty:10});e.localStorage.seed(K.CUTDB,[{operationId:712,carpetRecordId:x.carpetId,roll:x.roll,po:x.po,requestedCutLength:10,cutLength:10,plannedCutLength:10.25,actualCutLength:10.25,numberOfCuts:1,allowanceInches:3,beforeLength:100,remainingLength:89.75}]);e.localStorage.seed(K.EVENTDB,[]);const before=rawWatched(e);
  must(e.box.applySingleOperationImpact(r)===false,'partial prior execution was replayed');must(same(rawWatched(e),before),'partial prior execution mutated state');return{manualReviewRequired:true};
}));
scenarios.push(check('Full-roll short-tail finish stays valid under transaction guard',()=>{
  const e=boot(),x=seed(e,{length:12}),r=op(x,{id:713,qty:9,cuts:1});must(e.box.applySingleOperationImpact(r),'full-roll finish rejected');const roll=e.localStorage.json(K.CARPETDB)[0],cut=e.localStorage.json(K.CUTDB)[0];must(roll.length===0&&roll.status==='Used Up','tail not consumed');must(cut.fullRollConsumed===true&&cut.actualCutLength===12,'full-roll audit wrong');return{remaining:0,actual:12};
}));

function stress(n){
  const e=boot();let completed=0,failure=null;
  for(let i=0;i<n;i++){
    try{
      const length=80+(i%41),qty=1+(i%20),cuts=1+(i%4),x=seed(e,{length,roll:`RC${930000+i}`,carpetId:930000+i,po:`LAB-${i}`}),r=op(x,{id:2000000+i,qty,cuts});
      must(e.box.applySingleOperationImpact(r)===true,`cycle ${i}: first cut failed`);const after=rawWatched(e),cloud=e.cloud.length,replay=op(x,{id:2000000+i,qty,cuts});
      must(e.box.applySingleOperationImpact(replay)===true,`cycle ${i}: replay failed`);must(same(rawWatched(e),after),`cycle ${i}: replay mutated state`);must(e.cloud.length===cloud,`cycle ${i}: replay queued cloud write`);
      const cut=e.localStorage.json(K.CUTDB)[0],roll=e.localStorage.json(K.CARPETDB)[0],planned=qty+cuts*0.25;must(Math.abs(cut.plannedCutLength-planned)<0.011,`cycle ${i}: allowance wrong`);must(Math.abs((length-roll.length)-cut.actualCutLength)<0.011,`cycle ${i}: conservation wrong`);must(e.network()===0,`cycle ${i}: network attempted`);completed++;
    }catch(err){failure={cycle:i,error:err?.message||String(err)};break}
  }
  return{pass:!failure,cyclesRequested:n,cyclesCompleted:completed,failure};
}
const stressResult=stress(cycles),pass=scenarios.every(s=>s.pass)&&stressResult.pass;
const evidence={gate:'RUNLU Warehouse Build132 Carpet Cut Transaction Guard',pass,runtime:`${version.version} Build${version.build}`,isolation:'exact current stable cut functions + Build132 wrapper in VM; memory storage; cloud queue captured; network blocked',source:{indexSha256:sha(indexSource),exactFunctionsSha256:sha(exactSource),patchSha256:sha(patchSource),functionNames},scenarios,stress:stressResult};
fs.writeFileSync('warehouse-build132-carpet-cut-transaction-report.json',JSON.stringify(evidence,null,2));
for(const s of scenarios)console.log(`${s.pass?'PASS':'FAIL'} · ${s.name}${s.error?' · '+s.error:''}`);
console.log(`${stressResult.pass?'PASS':'FAIL'} · Build132 fresh-cut + reconstructed-retry stress · ${stressResult.cyclesCompleted}/${stressResult.cyclesRequested}`);
console.log(`BUILD132 CARPET CUT TRANSACTION GUARD: ${pass?'PASS':'FAIL'}`);
if(!pass)process.exit(1);