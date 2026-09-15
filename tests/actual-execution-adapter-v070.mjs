import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const indexSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const patchSource=fs.readFileSync(new URL('../build129-general-internal-transfer-conservation.js',import.meta.url),'utf8');
const loaderSource=fs.readFileSync(new URL('../release-loader.js',import.meta.url),'utf8');
const version=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8'));
const cycles=Math.max(100,Number(process.env.RUNLU_EXECUTION_CYCLES||750));
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
    if(lc){if(c==='\n')lc=false;continue}if(bc){if(c==='*'&&n==='/'){bc=false;i++}continue}
    if(q){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===q)q='';continue}
    if(c==='/'&&n==='/'){lc=true;i++;continue}if(c==='/'&&n==='*'){bc=true;i++;continue}if(c==='"'||c==="'"||c==='`'){q=c;continue}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return indexSource.slice(start,i+1);
  }
  throw new Error(`Unclosed production function: ${name}`);
}

const functionNames=[
  'load','save','normalizeText','normKey','loadMasters','loadInventoryRecords','inventoryRecordIdentity','findInventoryRecordByIdentity',
  'ensureOperationProductLink','operationStockQuantity','operationStockUnit','carpetTransferParts','validateOperationForImpact','applyInventoryDelta',
  'applyInventoryTransfer','updateLinkedOrder','applySingleOperationImpact'
];
const exactSource=functionNames.map(extractFunction).join('\n\n');

const K={INVDB:'runlu_inventory_records_v21',ODB:'runlu_orders_v20',EVENTDB:'runlu_event_history_v52',PMDB:'runlu_product_master_v21',CARPETDB:'runlu_carpet_inventory_v52',CUTDB:'runlu_cutting_log_v52',RAMDB:'runlu_remnants_v55'};
function memoryStorage(){
  const m=new Map(),writes=[];
  return {getItem:k=>m.has(String(k))?m.get(String(k)):null,setItem(k,v){writes.push(String(k));m.set(String(k),String(v))},removeItem(k){writes.push(String(k));m.delete(String(k))},seed(k,v){m.set(String(k),JSON.stringify(v))},json:k=>JSON.parse(m.get(String(k))||'null'),raw:k=>m.get(String(k))??null,writes:()=>writes.slice(),clearWrites(){writes.length=0}};
}
function boot({patch=true}={}){
  const localStorage=memoryStorage(),alerts=[];let network=0;
  const blocked=n=>()=>{network++;throw new Error(`LAB blocked network: ${n}`)};
  const doc={documentElement:{setAttribute(){}},getElementById(){return null}};
  const box={console:{log(){},info(){},warn(){},error(){},debug(){}},localStorage,document:doc,Date,JSON,Math,Number,String,Array,Object,Boolean,RegExp,Error,TypeError,Promise,Map,Set,
    alert:m=>alerts.push(String(m)),queueCloudSave(){},isQuotaError(){return false},pruneLocalApplicationCache(){return{}},aggressiveSafeStorageCleanup(){return{}},renderBackupStatus(){},
    underlaymentSpec(){return null},normalizeInventoryLifecycleRecord:r=>r,finalizeCustomerOrderInventory(){return{records:0,quantity:0}},
    fetch:blocked('fetch'),XMLHttpRequest:class{constructor(){network++;throw new Error('LAB blocked XMLHttpRequest')}},WebSocket:class{constructor(){network++;throw new Error('LAB blocked WebSocket')}},
    ...K
  };
  box.window=box;box.window.addEventListener=()=>{};
  vm.createContext(box,{name:'RUNLU Warehouse Actual Execution V0.7'});
  vm.runInContext(exactSource,box,{filename:'index.html#exact-execution-functions',timeout:2000});
  if(patch)vm.runInContext(patchSource,box,{filename:'build129-general-internal-transfer-conservation.js',timeout:1000});
  return{box,localStorage,alerts,network:()=>network};
}
function seed(e,{a=20,b=5}={}){
  e.localStorage.seed(K.INVDB,[
    {id:'INV-A',inventoryId:'INV-A',masterId:'P1',location:'A1',quantity:a,unit:'Box',inventoryType:'GENERAL',lifecycleStatus:'ACTIVE',warehouseScope:'warehouse'},
    {id:'INV-B',inventoryId:'INV-B',masterId:'P1',location:'B1',quantity:b,unit:'Box',inventoryType:'GENERAL',lifecycleStatus:'ACTIVE',warehouseScope:'warehouse'}
  ]);
  e.localStorage.seed(K.PMDB,[{id:'P1',name:'LAB LVP',color:'GREY'}]);
  e.localStorage.seed(K.ODB,[{id:'ORDER-1',poNumber:'PO-LAB',status:'In Progress'}]);
  e.localStorage.seed(K.EVENTDB,[]);e.localStorage.seed(K.CARPETDB,[]);e.localStorage.seed(K.CUTDB,[]);e.localStorage.seed(K.RAMDB,[]);e.localStorage.clearWrites();
}
function op(id,type,qty,extra={}){return{id,status:'Completed',type,inventoryMode:'Stock',productId:'P1',inventoryRecordId:'INV-A',product:'LAB LVP',quantity:qty,unit:'Box',location:'A1',po:'PO-LAB',date:'2026-09-15',...extra}}
const total=e=>(e.localStorage.json(K.INVDB)||[]).reduce((s,x)=>s+Number(x.quantity||0),0);
const qtyAt=(e,id)=>Number((e.localStorage.json(K.INVDB)||[]).find(x=>x.inventoryId===id)?.quantity||0);
function runImpact(e,r){const ok=e.box.applySingleOperationImpact(r);must(ok===true,`${r.type} rejected: ${e.alerts.at(-1)||'unknown'}`);return r}
function check(name,fn){try{return{name,pass:true,...(fn()||{})}}catch(err){return{name,pass:false,error:err?.message||String(err)}}}

const scenarios=[];
scenarios.push(check('Current stable core gap is detected before Build129',()=>{
  const e=boot({patch:false});seed(e);const before=total(e);e.box.applyInventoryTransfer(op(1,'Inventory Transfer',4,{toLocation:'B1',transferRoute:'Warehouse → Warehouse'}));const after=total(e);
  return{detected:after!==before,before,after,source:qtyAt(e,'INV-A'),destination:qtyAt(e,'INV-B')};
}));
scenarios.push(check('Build129 internal Warehouse transfer conserves quantity',()=>{
  const e=boot();seed(e);const before=total(e);runImpact(e,op(2,'Inventory Transfer',4,{toLocation:'B1',transferRoute:'Warehouse → Warehouse'}));must(qtyAt(e,'INV-A')===16,'source not deducted');must(qtyAt(e,'INV-B')===9,'destination not increased');must(total(e)===before,'inventory total changed');must(e.network()===0,'network attempted');return{before,after:total(e),source:16,destination:9};
}));
scenarios.push(check('Receive → internal move → ship → customer return → supplier return balances exactly',()=>{
  const e=boot();seed(e);const opening=total(e);
  runImpact(e,op(10,'Supplier Pickup / Receiving / Put-away',10));
  runImpact(e,op(11,'Inventory Transfer',4,{toLocation:'B1',transferRoute:'Warehouse → Warehouse'}));
  runImpact(e,op(12,'Shipping',8));
  runImpact(e,op(13,'Customer Return',3));
  runImpact(e,op(14,'Return to Supplier',2));
  const expected=opening+10+3-8-2,actual=total(e);must(actual===expected,`balance ${actual} != ${expected}`);must(qtyAt(e,'INV-A')===19&&qtyAt(e,'INV-B')===9,'location balances wrong');must(e.localStorage.json(K.ODB)[0].status==='Shipped','linked order not Shipped');must(e.localStorage.json(K.EVENTDB).length===5,'audit event count wrong');must(e.network()===0,'network attempted');return{opening,expected,actual,A1:19,B1:9,events:5};
}));
scenarios.push(check('Same completed operation object is idempotent',()=>{
  const e=boot();seed(e);const r=op(20,'Shipping',3);runImpact(e,r);const afterOne=total(e),events=e.localStorage.json(K.EVENTDB).length;runImpact(e,r);must(total(e)===afterOne,'same object deducted twice');must(e.localStorage.json(K.EVENTDB).length===events,'same object duplicated event');return{afterOne,events};
}));
scenarios.push(check('Insufficient shipping safely rejects without mutation',()=>{
  const e=boot();seed(e,{a:2,b:5});const before=e.localStorage.raw(K.INVDB);const r=op(21,'Shipping',8);must(e.box.applySingleOperationImpact(r)===false,'overship accepted');must(e.localStorage.raw(K.INVDB)===before,'overship mutated inventory');must(!r.impactApplied,'rejected operation marked applied');return{safeReject:true};
}));
scenarios.push(check('Internal transfer to same location safely rejects',()=>{
  const e=boot();seed(e);const before=e.localStorage.raw(K.INVDB);const r=op(22,'Inventory Transfer',2,{toLocation:'A1',transferRoute:'Warehouse → Warehouse'});must(e.box.applySingleOperationImpact(r)===false,'same-location move accepted');must(e.localStorage.raw(K.INVDB)===before,'same-location move mutated inventory');return{safeReject:true};
}));
scenarios.push(check('External Warehouse → Store route keeps established outbound behavior',()=>{
  const e=boot();seed(e);runImpact(e,op(23,'Inventory Transfer',4,{toLocation:'Store 1',transferRoute:'Warehouse → Store'}));must(qtyAt(e,'INV-A')===16,'external source wrong');must(qtyAt(e,'INV-B')===5,'unrelated destination changed');must(total(e)===21,'outbound total wrong');return{warehouseTotal:21,outbound:4};
}));

function stress(n){
  let completed=0,failure=null;
  for(let i=0;i<n;i++){
    try{
      const e=boot();const a=30+(i%17),b=3+(i%7),receive=1+(i%5),move=1+(i%4),ship=1+(i%6),ret=i%3,supplier=i%2;seed(e,{a,b});const opening=total(e);
      runImpact(e,op(100000+i*10,'Supplier Pickup / Receiving / Put-away',receive));
      runImpact(e,op(100001+i*10,'Inventory Transfer',move,{toLocation:'B1',transferRoute:'Warehouse → Warehouse'}));
      runImpact(e,op(100002+i*10,'Shipping',ship));
      if(ret)runImpact(e,op(100003+i*10,'Customer Return',ret));
      if(supplier)runImpact(e,op(100004+i*10,'Return to Supplier',supplier));
      const expected=opening+receive+ret-ship-supplier;must(total(e)===expected,`cycle ${i}: conservation ${total(e)} != ${expected}`);must(e.network()===0,`cycle ${i}: network attempted`);completed++;
    }catch(err){failure={cycle:i,error:err?.message||String(err)};break}
  }
  return{pass:!failure,cyclesRequested:n,cyclesCompleted:completed,failure};
}
const stressResult=stress(cycles);
const pass=scenarios.every(x=>x.pass)&&stressResult.pass;
const evidence={gate:'RUNLU Warehouse Actual Execution Adapter V0.7',pass,runtime:`${version.version} Build${version.build}`,isolation:'VM memory only; network blocked; no production Supabase/localStorage',source:{indexSha256:sha(indexSource),exactFunctionsSha256:sha(exactSource),build129Sha256:sha(patchSource),releaseLoaderSha256:sha(loaderSource),functionNames},scenarios,stress:stressResult,boundary:'Executes exact current stable core inventory mutation functions plus active Build129 internal-transfer patch. This is isolated execution logic verification, not live Supabase or browser E2E.'};
fs.writeFileSync('warehouse-actual-execution-v070-report.json',JSON.stringify(evidence,null,2));
for(const s of scenarios)console.log(`${s.pass?'PASS':'FAIL'} · ${s.name}${s.error?' · '+s.error:''}`);
console.log(`${stressResult.pass?'PASS':'FAIL'} · actual execution lifecycle stress · ${stressResult.cyclesCompleted}/${stressResult.cyclesRequested}`);
console.log(`Isolation · ${evidence.isolation}`);
console.log(`WAREHOUSE ACTUAL EXECUTION V0.7: ${pass?'PASS':'FAIL'}`);
if(!pass)process.exit(1);
