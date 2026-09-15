import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build130-global-carpet-search.js',import.meta.url),'utf8');
assert.match(source,/Global search · all roll statuses and racks/,'search result must explain global scope');
assert.match(source,/quick:''/,'global search must bypass quick/status filters');
assert.match(source,/rack:''/,'global search must bypass rack filters');

const nodes=new Map([
  ['carpetFilter',{value:'2246',setAttribute(){}}],
  ['carpetCount',{textContent:''}],
]);
const attrs=new Map();
const document={
  getElementById(id){return nodes.get(id)||null},
  documentElement:{setAttribute(k,v){attrs.set(k,v)},removeAttribute(k){attrs.delete(k)}},
};
const context={console,document,setInterval(){return 1},clearInterval(){},setTimeout(fn){fn();return 1},addEventListener(){}};
context.window=context;
vm.createContext(context);
vm.runInContext("let carpetQuickFilter='ACTIVE'; let carpetRackFilter='3D';",context);
context.renderCarpetInventory=function(){
  context.seenQuick=vm.runInContext('carpetQuickFilter',context);
  context.seenRack=vm.runInContext('carpetRackFilter',context);
  nodes.get('carpetCount').textContent='1 roll(s) shown';
};
vm.runInContext(source,context,{filename:'build130-global-carpet-search.js'});
assert.equal(context.renderCarpetInventory.__build130GlobalCarpetSearch,true,'renderCarpetInventory must be wrapped');
context.renderCarpetInventory();
assert.equal(context.seenQuick,'','search render must ignore Active/status filters');
assert.equal(context.seenRack,'','search render must ignore rack filters');
assert.equal(vm.runInContext('carpetQuickFilter',context),'ACTIVE','user quick filter must be restored after search render');
assert.equal(vm.runInContext('carpetRackFilter',context),'3D','user rack filter must be restored after search render');
assert.match(nodes.get('carpetCount').textContent,/Global search/,'global search scope must be visible');
assert.equal(attrs.get('data-runlu-carpet-search'),'global');

nodes.get('carpetFilter').value='';
context.renderCarpetInventory();
assert.equal(context.seenQuick,'ACTIVE','normal render must keep Active filter after search clears');
assert.equal(context.seenRack,'3D','normal render must keep rack filter after search clears');

console.log('Build130 global carpet search: PASS');
