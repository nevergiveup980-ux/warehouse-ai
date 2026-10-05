import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const compat=fs.readFileSync(new URL('../v8-compat.js',import.meta.url),'utf8');
function source(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end<0?undefined:end);}
let records=[{id:30006,masterId:'PRD-0006',quantity:44,unit:'Carton',location:'LOC-15C',updated:'2026-09-28, 11:43:04 a.m.',_cloudRecordId:'30006',_cloudVersion:1}];
let saved=null,alerts=[];
const elements={};
const unit={options:[],appendChild(o){o.parent=this;this.options.push(o)},get value(){return this.selected||''},set value(v){this.selected=this.options.some(o=>o.value===v)?v:''}};
function option(value){return {value,textContent:value,dataset:{},remove(){this.parent.options=this.parent.options.filter(o=>o!==this)}}}
for(const value of ['Carton','Box','Roll','Each'])unit.appendChild(option(value));
elements.editInvUnit=unit;
const context={console,setTimeout:()=>{},INVDB:'inventory',PMDB:'products',load:()=>structuredClone(records),save:(key,value)=>{saved=structuredClone(value);return true},document:{createElement:()=>option('')},$:id=>elements[id]||(elements[id]={value:'',classList:{add(){},remove(){}},focus(){}}),esc:String,alert:x=>alerts.push(x),inventoryProductForRecord:()=>({name:'Details Matter',color:'Shadow 989'}),editingInventoryRecordId:null};
for(const name of ['renderInventoryManager','renderProducts','renderInventory','renderDashboard','renderMap','refreshMemory'])context[name]=()=>{};
context.window=context;vm.createContext(context);vm.runInContext(compat,context);
for(const name of ['normalizeText','normKey','loadInventoryRecords','inventoryRecordIdentity','inventoryRecordJsRef','inventoryRecordIdentityMatches','findInventoryRecordByIdentity','inventoryRecordIdentityMatchCount','normalizeInventoryLifecycleRecord','setInventoryEditUnit','openInventoryRecordEditor','closeInventoryEdit','saveInventoryRecordEdits'])vm.runInContext(source(name),context);
// Reproduce a list render generating an INV label absent from a fresh cloud load.
const view=context.loadInventoryRecords()[0];context.normalizeInventoryLifecycleRecord(view);
assert.equal(view.inventoryId,'INV-20260928114304-030006');
assert.equal(context.inventoryRecordIdentity(view),'30006');
context.openInventoryRecordEditor(context.inventoryRecordIdentity(view));
assert.equal(alerts.length,0);assert.equal(elements.editInvQuantity.value,44);
assert.match(elements.inventoryEditContext.innerHTML,/Shadow 989/);
elements.editInvLocation.value='15C';context.saveInventoryRecordEdits();
assert.equal(saved[0]._cloudRecordId,'30006');assert.equal(saved[0].quantity,44);assert.equal(saved[0].location,'15C');
// Same business payload/legacy ID may exist in a separate cloud row: select exactly one.
records.push({...records[0],_cloudRecordId:'INV-20260928114304-030006',inventoryId:'INV-20260928114304-030006'});
context.openInventoryRecordEditor('30006');elements.editInvLocation.value='15C';saved=null;context.saveInventoryRecordEdits();
assert.equal(saved.length,2);assert.equal(saved[1].location,'LOC-15C');
assert.equal(context.findInventoryRecordByIdentity([{id:1,inventoryId:'dup'},{id:2,inventoryId:'dup'},{id:'dup'}],'dup'),null);
assert.equal(context.findInventoryRecordByIdentity([{_cloudRecordId:'dup',id:1},{_cloudRecordId:'dup',id:2}],'dup'),null);
assert.equal(context.findInventoryRecordByIdentity(records,'missing'),null);
// Norwich: adapt the real location UUID, preserve exact BOX unit through an edit.
records=[{id:'stock-norwich',inventoryId:'stock-norwich',_cloudRecordId:'stock-norwich',masterId:'norwich',quantity:61,unit:'BOX',locationId:'2ead4d8f-0511-44e0-9ed5-76c80e9ceb07'}];
const original=JSON.stringify(records[0]),adapted=context.loadInventoryRecords()[0];
assert.equal(adapted.location,'29B');assert.equal(JSON.stringify(adapted),original);
context.openInventoryRecordEditor('stock-norwich');assert.equal(unit.value,'BOX');assert.equal(elements.editInvLocation.value,'29B');
context.saveInventoryRecordEdits();assert.equal(saved[0].unit,'BOX');assert.equal(saved[0].quantity,61);assert.equal(saved[0].location,'29B');
context.setInventoryEditUnit('Custom pack');assert.equal(unit.value,'Custom pack');context.setInventoryEditUnit('Carton');assert.equal(unit.value,'Carton');assert.equal(unit.options.filter(o=>o.dataset.inventoryOriginalUnit==='1').length,0);
// Cloud refresh introduces ambiguity while modal is open: block the write.
context.openInventoryRecordEditor('stock-norwich');records.push({...records[0]});saved=null;context.saveInventoryRecordEdits();assert.equal(saved,null);assert.match(alerts.at(-1),/blocked/);
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim())new vm.Script(match[1]);}
console.log('PASS V8 inventory editor: transient labels, exact cloud target, ambiguity guard, BOX preservation, read-only location mapping and inline syntax');
