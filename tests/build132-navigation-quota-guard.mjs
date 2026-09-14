import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build132-navigation-quota-guard.js',import.meta.url),'utf8');
const ROLE='runlu_access_role_v620';

const quota=()=>Object.assign(new Error('The quota has been exceeded.'),{name:'QuotaExceededError',code:22});
class StorageMock{
  constructor(){this.map=new Map()}
  setItem(k,v){
    if(k===ROLE||k==='business')throw quota();
    this.map.set(String(k),String(v));
  }
  getItem(k){return this.map.get(String(k))??null}
  removeItem(k){this.map.delete(String(k))}
}
const localStorage=new StorageMock(),sessionStorage=new StorageMock();
const classes=()=>{const s=new Set();return {add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x),toggle(x,on){if(on)s.add(x);else s.delete(x)},has:x=>s.has(x)}};
const home={id:'home',classList:classes()},products={id:'products',classList:classes()};
products.classList.add('hidden');
const pages=[home,products];
let navigated='',extraFailure=false;

const document={
  readyState:'complete',
  documentElement:{setAttribute(){}},
  body:{classList:classes()},
  getElementById(id){return id==='home'?home:id==='products'?products:null},
  querySelectorAll(sel){return sel==='.page'?pages:[]},
  addEventListener(){}
};
const context={
  console,Error,Object,String,RegExp,Array,Set,Map,Math,Date,Promise,
  localStorage,sessionStorage,document,
  setTimeout(fn){fn();return 1},setInterval(){return 1},clearInterval(){},
  addEventListener(){},scrollTo(){},
  showPage(id){
    localStorage.setItem(ROLE,'admin');
    if(extraFailure)localStorage.setItem('business','x');
    navigated=id;return true;
  }
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build132-navigation-quota-guard.js'});

assert.equal(context.RUNLUNavigationQuotaBuild132.version,'132');
assert.equal(context.RUNLUNavigationQuotaBuild132.ready,true);

// The administrator role cache is disposable: quota pressure must not block navigation.
assert.equal(context.showPage('products'),true);
assert.equal(navigated,'products');

// Business writes are not globally swallowed by the role-marker guard.
assert.throws(()=>localStorage.setItem('business','x'),e=>e?.name==='QuotaExceededError');

// If another quota exception escapes during the navigation function, the requested page still opens.
extraFailure=true;
home.classList.remove('hidden');products.classList.add('hidden');
assert.equal(context.showPage('products'),true);
assert.equal(products.classList.has('hidden'),false);
assert.equal(home.classList.has('hidden'),true);

console.log('Build132 navigation quota guard: PASS');
