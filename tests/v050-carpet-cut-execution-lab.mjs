import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const version=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8'));
const sourceSha256=crypto.createHash('sha256').update(source).digest('hex');
const cycles=Math.max(100,Number(process.env.RUNLU_CUT_CYCLES||3000));
const must=(c,m)=>{if(!c)throw new Error(m)};

function extractFunction(name){
  const needle=`function ${name}`;
  const start=source.indexOf(needle);if(start<0)throw new Error(`Production function not found: ${name}`);
  const brace=source.indexOf('{',start);if(brace<0)throw new Error(`Opening brace not found: ${name}`);
  let depth=0,quote='',escape=false,lineComment=false,blockComment=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++}continue}
    if(quote){if(escape){escape=false;continue}if(c==='\\'){escape=true;continue}if(c===quote){quote='';continue}continue}
    if(c==='/'&&n==='/'){lineComment=true;i++;continue}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue}
    if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)return source.slice(start,i+1)}
  }
  throw new Error(`Unclosed production function: ${name}`);
}

const functionNames=[
  'load','save','normalizeText','normKey','carpetRollKey','cleanManufacturerRoll','findCarpetRoll','findCarpetRollForOperation',
  'carpetRecords','cuttingRecords','carpetActualCutLength','carpetCutConsumptionPlan','feetLabel','validateOperationForImpact',
  'updateLinkedOrder','applySingleOperationImpact'
];
const exactSource=functionNames.map(extractFunction).join('\n\n');
const exactSha256=crypto.createHash('sha256').update(exactSource).digest('hex');

const KEYS={
  INVDB:'runlu_inventory_records_v21',ODB:'runlu_orders_v20',RCVDB:'runlu_receiving_v50',LOGDB:'runlu_operations_log_v52',
  CARPETDB:'runlu_carpet_inventory_v52',CUTDB:'runlu_cutting_log_v52',EVENTDB:'runlu_event_history_v52',RAMDB:'runlu_remnants_v55',
  REGISTRY:'runlu_carpet_rc_registry_v1',TRANSFER:'lab_transfer_history',SHIPPING:'lab_shipping_history'
};

function memoryStorage(){
  const map=new Map(),writes=[];let failKey='';
  return {
    getItem:k=>map.has(String(k))?map.get(String(k)):null,
    setItem(k,v){k=String(k);writes.push(k);if(failKey===k){failKey='';throw new Error(`LAB injected write failure: ${k}`)}map.set(k,String(v))},
    removeItem:k=>{k=String(k);writes.push(k);map.delete(k)},
    seed(k,v){map.set(String(k),typeof v==='string'?v:JSON.stringify(v))},
    json:k=>JSON.parse(map.get(String(k))||'null'),raw:k=>map.get(String(k))??null,
    failOnce:k=>{failKey=String(k)},clearWrites:()=>{writes.length=0},writes:()=>writes.slice(),
    snapshot:()=>Object.fromEntries([...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])))
  };
}

function boot(){
  const localStorage=memoryStorage(),alerts=[];let network=0;
  const blocked=n=>()=>{network++;throw new Error(`LAB blocked network API: ${n}`)};
  const box={
    console:{log(){},info(){},warn(){},error(){},debug(){}},localStorage,Date,JSON,Math,Number,String,Array,Object,Boolean,RegExp,Error,TypeError,Promise,Map,Set,
    alert:m=>alerts.push(String(m)),queueCloudSave(){},isQuotaError(){return false},pruneLocalApplicationCache(){return{}},aggressiveSafeStorageCleanup(){return{}},renderBackupStatus(){},
    ensureOperationProductLink(){return''},finalizeCustomerOrderInventory(){return{records:0,quantity:0}},fetch:blocked('fetch'),
    XMLHttpRequest:class{constructor(){network++;throw new Error('LAB blocked XMLHttpRequest')}},WebSocket:class{constructor(){network++;throw new Error('LAB blocked WebSocket')}},
    ...KEYS
  };
  box.window=box;
  vm.createContext(box,{name:'RUNLU Warehouse Carpet Cut LAB'});
  vm.runInContext(exactSource,box,{filename:'index.html#exact-cut-functions',timeout:1500});
  must(typeof box.applySingleOperationImpact==='function','Exact production cut function did not load');
  return{box,localStorage,alerts,network:()=>network};
}

function seed(e,{length=100,roll='RC9001',carpetId=9001,po='LAB-JOB-181626'}={}){
  const s=e.localStorage;
  s.seed(KEYS.CARPETDB,[{id:carpetId,roll,manufacturerRoll:'MFG-9001',collection:'LAB CARPET',colour:'TEST GREY',length,originalLength:length,width:'12',location:'14C',measure:'FULL',status:'Active',po}]);
  s.seed(KEYS.CUTDB,[]);s.seed(KEYS.EVENTDB,[]);s.seed(KEYS.ODB,[{id:'JOB-181626',jobNumber:'181626',poNumber:po,status:'In Progress'}]);
  s.seed(KEYS.INVDB,[{id:'GEN-1',quantity:42}]);s.seed(KEYS.RCVDB,[{id:'RCV-1',status:'Received'}]);s.seed(KEYS.RAMDB,[]);s.seed(KEYS.REGISTRY,[{record_id:roll,payload:{rcNumber:roll}}]);
  s.seed(KEYS.TRANSFER,[{id:'T-1'}]);s.seed(KEYS.SHIPPING,[{id:'S-1'}]);s.clearWrites();
  return{roll,carpetId,po};
}
function op(x,{id=501,qty=10,cuts=1,roll=x.roll,carpetRecordId=x.carpetId,po=x.po}={}){return{id,date:'2026-09-15',time:'10:15',status:'Completed',type:'Carpet Cutting',inventoryMode:'Stock',roll,carpetRecordId,quantity:qty,requestedQuantity:qty,numberOfCuts:cuts,po,customer:'LAB CUSTOMER',operator:'LAB',collection:'LAB CARPET',colour:'TEST GREY',notes:'V0.5 synthetic actual-cut test'}}
function snapUnrelated(e){const s=e.localStorage;return Object.fromEntries([KEYS.INVDB,KEYS.RCVDB,KEYS.RAMDB,KEYS.REGISTRY,KEYS.TRANSFER,KEYS.SHIPPING].map(k=>[k,s.raw(k)]))}
function sameUnrelated(e,b){const s=e.localStorage;return Object.entries(b).every(([k,v])=>s.raw(k)===v)}
function check(name,fn){try{return{name,pass:true,...(fn()||{})}}catch(err){return{name,pass:false,error:err?.message||String(err)}}}

function coreScenarios(){
  const tests=[];
  tests.push(check('Exact Build127 cut functions extracted from current stable index',()=>{const e=boot();return{runtime:`${version.version} Build${version.build}`,sourceSha256,exactFunctionsSha256:exactSha256,functionCount:functionNames.length}}));
  tests.push(check('One actual cut deducts requested length plus exactly 3 inches per cut',()=>{const e=boot(),x=seed(e),r=op(x,{qty:10,cuts:2}),u=snapUnrelated(e);must(e.box.applySingleOperationImpact(r)===true,'cut rejected');const carpet=e.localStorage.json(KEYS.CARPETDB)[0],cut=e.localStorage.json(KEYS.CUTDB)[0];must(Math.abs(carpet.length-89.5)<1e-9,`remaining ${carpet.length}`);must(cut.operationId===501,'operation link missing');must(cut.roll===x.roll,'RC/roll link missing');must(cut.po===x.po,'Job/PO reference missing');must(cut.allowanceInches===6,'allowance not 6 inches');must(Math.abs(cut.requestedCutLength-10)<1e-9&&Math.abs(cut.actualCutLength-10.5)<1e-9,'cut lengths wrong');must(Math.abs(cut.beforeLength-100)<1e-9&&Math.abs(cut.remainingLength-89.5)<1e-9,'history balance wrong');must(e.localStorage.json(KEYS.ODB)[0].status==='Ready','linked order not Ready');must(sameUnrelated(e,u),'unrelated dataset changed');must(e.network()===0,'network attempted');return{before:100,requested:10,cuts:2,allowanceInches:6,remaining:carpet.length}}));
  tests.push(check('Same completed operation object is idempotent',()=>{const e=boot(),x=seed(e),r=op(x,{id:502,qty:7,cuts:1});must(e.box.applySingleOperationImpact(r),'first cut failed');const b=e.localStorage.snapshot();must(e.box.applySingleOperationImpact(r),'same object retry failed');must(JSON.stringify(e.localStorage.snapshot())===JSON.stringify(b),'same object retry mutated state');return{guard:'impactApplied'}}));
  tests.push(check('Insufficient roll rejects with zero mutation',()=>{const e=boot(),x=seed(e,{length:5}),r=op(x,{id:503,qty:6,cuts:1}),b=JSON.stringify(e.localStorage.snapshot());must(e.box.applySingleOperationImpact(r)===false,'insufficient cut accepted');must(JSON.stringify(e.localStorage.snapshot())===b,'insufficient cut mutated state');return{safeReject:true}}));
  tests.push(check('Unknown RC rejects with zero mutation',()=>{const e=boot(),x=seed(e),r=op(x,{id:504,roll:'RC-NOT-FOUND',carpetRecordId:'',qty:3}),b=JSON.stringify(e.localStorage.snapshot());must(e.box.applySingleOperationImpact(r)===false,'unknown RC accepted');must(JSON.stringify(e.localStorage.snapshot())===b,'unknown RC mutated state');return{safeReject:true}}));
  for(const [label,qty] of [['Zero',0],['Negative',-2]])tests.push(check(`${label} cut quantity rejects with zero mutation`,()=>{const e=boot(),x=seed(e),r=op(x,{id:505,qty}),b=JSON.stringify(e.localStorage.snapshot());must(e.box.applySingleOperationImpact(r)===false,`${label} cut accepted`);must(JSON.stringify(e.localStorage.snapshot())===b,`${label} cut mutated state`);return{safeReject:true}}));
  tests.push(check('Sub-3-foot tail is deliberately consumed as full-roll finish',()=>{const e=boot(),x=seed(e,{length:12}),r=op(x,{id:506,qty:9,cuts:1});must(e.box.applySingleOperationImpact(r),'tail cut failed');const carpet=e.localStorage.json(KEYS.CARPETDB)[0],cut=e.localStorage.json(KEYS.CUTDB)[0];must(carpet.length===0&&carpet.status==='Used Up','tail not consumed');must(cut.fullRollConsumed===true&&Math.abs(cut.actualCutLength-12)<1e-9,'full-roll audit incorrect');return{planned:9.25,actual:12,remaining:0}}));
  return tests;
}

function stress(n){
  const e=boot();let failure=null;
  for(let i=0;i<n;i++){
    const length=80+(i%41),qty=1+(i%20),cuts=1+(i%4),allow=cuts*0.25,planned=qty+allow;
    const x=seed(e,{length,roll:`RC${900000+i}`,carpetId:900000+i,po:`LAB-JOB-${i}`}),r=op(x,{id:1000000+i,qty,cuts}),u=snapUnrelated(e);
    try{
      must(e.box.applySingleOperationImpact(r)===true,'cut returned false');const c=e.localStorage.json(KEYS.CUTDB)[0],roll=e.localStorage.json(KEYS.CARPETDB)[0];
      const raw=Number((length-planned).toFixed(4)),expected=raw>=0&&raw<3?0:raw;
      must(Math.abs(roll.length-expected)<1e-9,`remaining ${roll.length} expected ${expected}`);must(c.operationId===1000000+i,'operation id');must(c.roll===x.roll,'RC link');must(c.allowanceInches===cuts*3,'allowance');must(sameUnrelated(e,u),'unrelated mutation');must(e.network()===0,'network');
    }catch(err){failure={cycle:i,error:err.message||String(err),writes:e.localStorage.writes()};break}
  }
  return{pass:!failure,cyclesRequested:n,cyclesCompleted:failure?failure.cycle:n,failure,networkCalls:e.network()};
}

function riskProbes(){
  const probes=[];
  probes.push(check('Risk detector: reconstructed retry with same operation ID can currently deduct twice',()=>{const e=boot(),x=seed(e),first=op(x,{id:700,qty:10,cuts:1});must(e.box.applySingleOperationImpact(first),'first cut failed');const once=e.localStorage.json(KEYS.CARPETDB)[0].length;const replay=op(x,{id:700,qty:10,cuts:1});const accepted=e.box.applySingleOperationImpact(replay),twice=e.localStorage.json(KEYS.CARPETDB)[0].length,logs=e.localStorage.json(KEYS.CUTDB).filter(c=>String(c.operationId)==='700').length;must(accepted===true&&twice<once&&logs===2,'reconstructed retry did not reproduce current duplicate-deduction gap');return{detected:true,once,twice,duplicateCutLogs:logs}}));
  for(const [label,key] of [['Carpet Inventory',KEYS.CARPETDB],['Cutting History',KEYS.CUTDB],['Order link',KEYS.ODB],['Event History',KEYS.EVENTDB]])probes.push(check(`Risk detector: ${label} write failure is not transactionally rejected`,()=>{const e=boot(),x=seed(e),r=op(x,{id:710+probes.length,qty:8,cuts:1});e.localStorage.failOnce(key);const result=e.box.applySingleOperationImpact(r),carpet=e.localStorage.json(KEYS.CARPETDB)[0],cuts=e.localStorage.json(KEYS.CUTDB)||[],events=e.localStorage.json(KEYS.EVENTDB)||[];must(result===true,'production path already rejected failure; update this probe');const inconsistent=key===KEYS.CARPETDB?carpet.length===100&&cuts.length===1:key===KEYS.CUTDB?carpet.length<100&&cuts.length===0:key===KEYS.ODB?e.localStorage.json(KEYS.ODB)[0].status!=='Ready'&&carpet.length<100:key===KEYS.EVENTDB?events.length===0&&carpet.length<100:false;must(inconsistent,`failure at ${key} did not reproduce expected partial state`);return{detected:true,failedDataset:key,impactReportedSuccess:r.impactApplied===true}}));
  return probes;
}

const scenarios=coreScenarios(),stressResult=stress(cycles),risks=riskProbes();
const corePass=scenarios.every(x=>x.pass)&&stressResult.pass;
const riskAuditPass=risks.every(x=>x.pass);
const hardeningRequired=risks.filter(x=>x.pass&&x.detected).map(x=>x.name.replace('Risk detector: ',''));
const report={
  schema:'runlu.warehouse.carpet-cut-execution-lab.v1',labVersion:'0.5.0',generatedAt:new Date().toISOString(),runtime:{version:version.version,build:version.build,channel:version.channel},
  environment:'NODE_VM_EXACT_FUNCTION_EXTRACTION_FROM_CURRENT_STABLE_INDEX',productionSource:'index.html',sourceSha256,exactFunctionsSha256,functionNames,
  auditPass:corePass&&riskAuditPass,marketGatePass:corePass&&hardeningRequired.length===0,core:{pass:corePass,passed:scenarios.filter(x=>x.pass).length,total:scenarios.length,tests:scenarios},stress:stressResult,
  riskAudit:{pass:riskAuditPass,hardeningRequired,probes:risks},
  isolation:{liveSupabaseAccess:false,hostBrowserStorageAccess:false,networkApisBlocked:true,storage:'ephemeral in-memory localStorage',productionRuntimeFilesModified:false},
  interpretation:['AUDIT PASS means the laboratory successfully verified the current stable cut path and reproduced any safety gaps; it is not a market-release PASS.','MARKET GATE remains false while any reproduced duplicate-deduction or partial-write risk remains.','This V0.5 branch adds tests only; warehouse production runtime and release-loader remain unchanged.']
};
fs.writeFileSync('warehouse-carpet-cut-execution-v050-report.json',JSON.stringify(report,null,2));
console.log(`${corePass?'PASS':'FAIL'} · Actual stable cut core scenarios · ${scenarios.filter(x=>x.pass).length}/${scenarios.length}`);
console.log(`${stressResult.pass?'PASS':'FAIL'} · Actual stable cut stress · ${stressResult.cyclesCompleted}/${stressResult.cyclesRequested}`);
console.log(`${riskAuditPass?'PASS':'FAIL'} · Safety risk probes · ${risks.filter(x=>x.pass).length}/${risks.length}`);
console.log(`MARKET GATE · ${report.marketGatePass?'PASS':'HOLD'} · hardening items ${hardeningRequired.length}`);
console.log(`Runtime · ${version.version} Build${version.build} · index SHA-256 ${sourceSha256}`);
console.log('Isolation · memory-only storage · network blocked · live Supabase access: NONE');
if(!report.auditPass){console.error('V0.5 CUT EXECUTION LAB AUDIT: FAIL');for(const x of [...scenarios,...risks].filter(x=>!x.pass))console.error(`${x.name}: ${x.error}`);if(stressResult.failure)console.error(stressResult.failure);process.exit(1)}
console.log('V0.5 CUT EXECUTION LAB AUDIT: PASS · MARKET HARDENING REQUIRED');
