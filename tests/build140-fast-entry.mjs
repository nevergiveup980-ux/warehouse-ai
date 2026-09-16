import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build140-fast-entry.js',import.meta.url),'utf8');

class ClassList{
  constructor(hidden=false){this.hidden=hidden}
  contains(name){return name==='hidden'?this.hidden:false}
  add(){}
  remove(){}
}
function el(id,{hidden=false,tag='DIV'}={}){
  return {id,tagName:tag,classList:new ClassList(hidden),style:{},textContent:'',innerHTML:'',isContentEditable:false,querySelectorAll(){return []}};
}

const els=new Map();
els.set('operationEditor',el('operationEditor',{hidden:false}));
els.set('carpetInventory',el('carpetInventory',{hidden:true}));
els.set('headerVersion',el('headerVersion'));
els.set('operationDraftState',el('operationDraftState'));
for(const id of ['operation_collection_memory','operation_roll_memory','operation_customer_memory','operation_supplier_memory','operation_sales_memory','operation_operator_memory'])els.set(id,el(id));
const active=el('operationCollection',{tag:'INPUT'});els.set('operationCollection',active);

let formCalls=0,calcCalls=0,productCalls=0,legacyDraftCalls=0,saveCalls=0,carpetCalls=0;

const document={
  readyState:'complete',
  activeElement:active,
  documentElement:{setAttribute(){},removeAttribute(){}},
  getElementById:id=>els.get(id)||null,
  addEventListener(){},
};
const windowObj={
  __RUNLU_BUILD140_FAST_ENTRY__:false,
  updateOperationForm(){formCalls++},
  updateOperationCalculationPreview(){calcCalls++},
  operationProductChanged(){productCalls++},
  scheduleOperationDraft(){legacyDraftCalls++},
  saveOperationDraftNow(){saveCalls++},
  protectedInputActive(){return false},
  renderCarpetInventory(){carpetCalls++},
  refreshOperationMemory(){},
  addEventListener(){},
};
windowObj.window=windowObj;

const context={
  window:windowObj,document,console,
  setTimeout,clearTimeout,
  setInterval:()=>1,clearInterval:()=>{},
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'build140-fast-entry.js'});
await new Promise(r=>setTimeout(r,30));

assert.equal(windowObj.RUNLUFastEntryBuild140.build,'140');
assert.equal(windowObj.protectedInputActive(),true,'active form typing must protect against background cloud refresh');

for(let i=0;i<25;i++)windowObj.updateOperationForm();
for(let i=0;i<25;i++)windowObj.updateOperationCalculationPreview();
assert.equal(formCalls,0,'heavy structure work should not run on every keystroke');
assert.equal(calcCalls,0,'heavy preview work should not run on every keystroke');
await new Promise(r=>setTimeout(r,260));
assert.equal(formCalls,1,'rapid typing should collapse to one structure update');
assert.equal(calcCalls,1,'rapid typing should collapse to one preview update');

windowObj.renderCarpetInventory();
assert.equal(carpetCalls,0,'hidden carpet page must not rerender in the background');

for(let i=0;i<8;i++)windowObj.scheduleOperationDraft();
assert.equal(legacyDraftCalls,0,'typing should use the quiet draft path');
await new Promise(r=>setTimeout(r,780));
assert.equal(saveCalls,1,'rapid typing should produce one delayed draft save');

console.log('Build140 Fast Entry regression: PASS');
