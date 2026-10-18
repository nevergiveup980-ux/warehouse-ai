const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('index.html','utf8');
const start=src.indexOf('function initializeSeedDatabase(showMessage=false){');
const end=src.indexOf('\nfunction backupBeforeV516()',start);
assert(start>=0&&end>start);
const functionCode=src.slice(start,end)+'\nfunction autoInitializeSeed(){\n return false;\n}';
function run(label,{marker=false,inventory=[],confirmResult=true,manual=true},expect){
 const store=new Map(marker?[['runlu_v30_seed_initialized','1']]:[]);
 let masters=[],inv=structuredClone(inventory),writes=[],confirms=0;
 const ctx={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 loadMasters:()=>masters,loadInventoryRecords:()=>inv,confirm:()=>{confirms++;return confirmResult},
 alert:()=>{},save:(k,v)=>writes.push({k,size:v.length}),normKey:x=>String(x??'').trim().toLowerCase(),
 refreshMemory:()=>{},renderProducts:()=>{},renderInventory:()=>{},renderDashboard:()=>{},
 PMDB:'masters',INVDB:'inventory',console,Date};
 vm.createContext(ctx);vm.runInContext(functionCode,ctx);
 const result=manual?vm.runInContext('initializeSeedDatabase(true)',ctx):vm.runInContext('autoInitializeSeed()',ctx);
 assert.equal(writes.length,expect.writes,label+' writes');
 assert.equal(confirms,expect.confirms,label+' confirms');
 assert.equal(inv.length,expect.inventory,label+' inventory');
 console.log('PASS',label);
}
run('normal startup empty',{manual:false},{writes:0,confirms:0,inventory:0});
run('marker blocks manual import',{marker:true},{writes:0,confirms:0,inventory:0});
run('existing seed blocks import',{inventory:[{id:30001,masterId:'PRD-0001',location:'NEW'}]},{writes:0,confirms:1,inventory:1});
run('unrelated existing inventory blocks import',{inventory:[{id:90001,masterId:'PRD-X',location:'RACK'}]},{writes:0,confirms:1,inventory:1});
run('manual import canceled',{confirmResult:false},{writes:0,confirms:1,inventory:0});
run('empty manual confirmed',{}, {writes:2,confirms:1,inventory:9});
