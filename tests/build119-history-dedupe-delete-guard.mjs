import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build119-history-dedupe-delete-guard.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../release-loader.js',import.meta.url),'utf8');

const rows=[
  {id:1,date:'2026-09-09',time:'11:36',type:'Carpet Cutting',po:'181603',roll:'RC2288',collection:'ELEVATED',colour:'DAWN BEIGE',quantity:107.5,unit:'Foot',location:'13A',status:'Completed',updatedAt:'2026-09-10T18:00:00Z'},
  {id:2,date:'2026-09-09',time:'11:38',type:'Carpet Cutting',po:'181603',roll:'RC2288',collection:'ELEVATED',colour:'DAWN BEIGE',quantity:107.5,unit:'Foot',location:'13A',status:'Completed',_cloudUpdatedAt:'2026-09-10T18:05:00Z'},
  {id:3,date:'2026-09-10',time:'10:00',type:'Shipping',po:'181555',collection:'Cloud 9 Spill Blocker',quantity:4,unit:'Roll',location:'10A',status:'Waiting'},
  {id:4,date:'2026-09-10',time:'10:01',type:'Shipping',po:'181555',collection:'Cloud 9 Spill Blocker',quantity:5,unit:'Roll',location:'10A',status:'Waiting'},
  {id:5,date:'2026-09-08',time:'09:20',type:'Supplier Pickup / Receiving / Put-away',po:'181570',supplier:'Taiga',collection:'Trio EPC',colour:'Walnut grove',quantity:7,unit:'Box',status:'Completed'},
  {id:6,date:'2026-09-08',time:'09:24',type:'Supplier Pickup / Receiving / Put-away',po:'181570',supplier:'Taiga',collection:'Trio EPC',colour:'Walnut grove',quantity:7,unit:'Box',status:'Completed',_cloudUpdatedAt:'2026-09-10T18:06:00Z'},
  {id:7,date:'2026-09-10',time:'12:00',type:'Other',notes:'cycle count',quantity:1,unit:'Task'},
  {id:8,date:'2026-09-10',time:'12:05',type:'Other',notes:'cycle count',quantity:1,unit:'Task'}
];

const store=new Map();
const context={
  console,
  Date,
  encodeURIComponent,
  setTimeout(fn){fn();return 1},
  setInterval(){return 1},
  clearTimeout(){},
  alert(){},
  confirm(){return false},
  prompt(){return ''},
  MutationObserver:class{constructor(fn){this.fn=fn}observe(){}disconnect(){}},
  document:{readyState:'complete',body:{},getElementById(){return null},addEventListener(){}},
  localStorage:{getItem(k){return store.has(k)?store.get(k):null},setItem(k,v){store.set(k,String(v))},removeItem(k){store.delete(k)}},
  operationRecords:()=>rows.map(x=>({...x})),
  operationMobileActions:()=>'<button class="delete" onclick="deleteOperation(1)">Delete</button>',
  deleteOperation(){},
  renderOperationsDay(){},renderOperationsDays(){},renderDashboard(){}
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build119-history-dedupe-delete-guard.js'});

const out=context.operationRecords();
assert.equal(out.length,6,'two duplicate display copies should be suppressed');
assert.equal(context.RUNLUHistoryGuardBuild119.suppressed,2);
assert.equal(out.filter(x=>x.type==='Carpet Cutting').length,1);
assert.equal(out.find(x=>x.type==='Carpet Cutting').id,2,'newer live-cloud copy should win');
assert.equal(out.filter(x=>x.type==='Shipping').length,2,'different quantities must remain separate jobs');
assert.equal(out.filter(x=>x.type==='Supplier Pickup / Receiving / Put-away').length,1);
assert.equal(out.filter(x=>x.type==='Other').length,2,'conservative fallback must preserve separate manual work times');
assert.match(context.operationMobileActions({}),/Delete Record…/);
assert.equal(context.RUNLUHistoryGuardBuild119.version,'119');

const release=Number((loader.match(/const RELEASE='(\d+)'/)||[])[1]||0);
assert.ok(release>=119,'Build119 history guard must remain loaded in Build119 or later releases');
assert.match(loader,/build118-command-center-live-record-history\.js/);
assert.match(loader,/build119-history-dedupe-delete-guard\.js/);
assert.doesNotMatch(loader,/build117-command-center-cloud-history\.js/,'stale user_datasets history reader must not load');

console.log('Build119 duplicate-safe history regression: PASS');
