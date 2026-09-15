import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build128-operation-save-authority.js',import.meta.url),'utf8');

let ordinaryCalls=0, carpetCalls=0;
const ordinary=function(){ordinaryCalls++;return 'ordinary-saved'};
const stuckBuild120=function(){return false};
stuckBuild120.__build120=true;
stuckBuild120.__original=ordinary;
const build125=async function(){
  const type=context.document.getElementById('operationLineType')?.value||'';
  if(type==='Carpet Receiving'){carpetCalls++;return 'carpet-guarded'}
  return stuckBuild120();
};
build125.__build125=true;
build125.__original=stuckBuild120;

const nodes={
  operationType:{value:'Order Picking & Preparation'},
  operationLineType:{value:'Shipping'}
};
const context={
  console,
  alert(){},
  operationItemsDraft:[],
  window:{saveOperation:build125,operationItemFromForm(){return {type:nodes.operationLineType.value,product:'Test',quantity:1}}},
  document:{documentElement:{setAttribute(){}},getElementById(id){return nodes[id]||null}},
  setInterval(fn){fn();return 1},clearInterval(){},setTimeout(fn){fn();return 1}
};
context.window.window=context.window;
context.window.document=context.document;
context.window.addEventListener=()=>{};
context.window.setInterval=context.setInterval;
context.window.clearInterval=context.clearInterval;
context.window.setTimeout=context.setTimeout;
vm.createContext(context);
vm.runInContext(source,context,{filename:'build128-operation-save-authority.js'});

assert.equal(context.window.saveOperation.__build128OperationSaveAuthority,true,'Build128 must own saveOperation');
assert.equal(context.window.saveOperation.__build120,true,'Build120 must not re-wrap Build128');
assert.equal(context.window.saveOperation.__build125,true,'Build127 must not replace Build128');

const ordinaryResult=await context.window.saveOperation();
assert.equal(ordinaryResult,'ordinary-saved','ordinary Work must bypass a stuck carpet checking lane');
assert.equal(ordinaryCalls,1,'ordinary save chain should execute exactly once');
assert.equal(carpetCalls,0,'ordinary Work must not enter Carpet Receiving guard');

nodes.operationLineType.value='Carpet Receiving';
const carpetResult=await context.window.saveOperation();
assert.equal(carpetResult,'carpet-guarded','Carpet Receiving must retain Build125 guard path');
assert.equal(carpetCalls,1,'Carpet Receiving guard should execute');
assert.equal(ordinaryCalls,1,'Carpet guard path must not bypass directly to ordinary save');

console.log('Build128 operation save authority regression: PASS');
