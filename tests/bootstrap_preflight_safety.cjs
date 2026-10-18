const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function recordSyncAssertBootstrapSafe(){');
const end=html.indexOf('async function recordSyncBootstrap(){',start);
assert(start>=0&&end>start,'bootstrap preflight not found');
const source=html.slice(start,end);
function check(values,queue,expected){
 const storage=new Map(Object.entries(values));
 const ctx={DATA_KEYS:['inventory','orders'],localStorage:{getItem:k=>storage.has(k)?storage.get(k):null},recordSyncOutbox:()=>queue};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 let message='';try{vm.runInContext('recordSyncAssertBootstrapSafe()',ctx)}catch(e){message=e.message}
 assert.equal(Boolean(message),expected,'unexpected bootstrap decision: '+message);
}
check({},[],false); // clean new device
check({inventory:'[]',orders:'{}'},[],false); // empty initialized keys
check({inventory:'[{"id":"30005"}]'},[],true); // existing inventory
check({orders:'{"id":"po1"}'},[],true); // existing object
check({inventory:'not-json'},[],true); // corrupted data must not be overwritten
check({},[{operation_id:'old'}],true); // held queue
console.log('PASS: clean device allowed; existing, corrupt and queued data protected');
