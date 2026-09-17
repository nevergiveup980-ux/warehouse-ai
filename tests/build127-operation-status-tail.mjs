import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build127-operation-status-tail.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../release-loader.js',import.meta.url),'utf8');
const original=x=>x?.status==='Waiting'?'<button>Start</button>':'<button>Edit</button>';

// The archived status-tail hotfix must remain independently valid even while the
// production runtime is intentionally frozen to the known-good Build127 loader.
{
  const document={querySelectorAll:()=>[]};
  const context={window:null,operationMobileActions:original,console,document,setTimeout:()=>0};
  context.window=context;
  vm.runInNewContext(source,context,{filename:'build127-operation-status-tail.js'});
  assert.equal(context.operationMobileActions({impactApplied:true,inventoryMode:'Record Only',impactResult:'Completed as a work record only'}),'<div class="lockedOperation">✓ Completed · Work record saved</div>');
  assert.equal(context.operationMobileActions({impactApplied:true,inventoryMode:'Stock',impactResult:'Inventory updated'}),'<div class="lockedOperation">✓ Completed and linked to inventory</div>');
  assert.equal(context.operationMobileActions({impactApplied:false,status:'Waiting'}),'<button>Start</button>');
  assert.ok(!context.operationMobileActions({impactApplied:true,inventoryMode:'Stock'}).includes('Record locked'));
  assert.ok(!context.operationMobileActions({impactApplied:true,inventoryMode:'Record Only'}).includes('linked to inventory'));
}

{
  let domReady=null;const timers=[];const visible={textContent:'✓ Completed and linked to inventory · Record locked'};
  const document={readyState:'loading',addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')domReady=fn},querySelectorAll:selector=>selector==='.lockedOperation'?[visible]:[]};
  const context={window:null,console,document,setTimeout:fn=>{timers.push(fn);return timers.length}};context.window=context;
  vm.runInNewContext(source,context,{filename:'build127-operation-status-tail.js'});
  assert.equal(context.operationMobileActions,undefined);context.operationMobileActions=original;assert.equal(typeof domReady,'function');domReady();
  assert.equal(context.operationMobileActions({impactApplied:true,inventoryMode:'Record Only',impactResult:'Completed as a work record only'}),'<div class="lockedOperation">✓ Completed · Work record saved</div>');
  assert.equal(visible.textContent,'✓ Completed and linked to inventory');
}

// Rollback invariant: production loader is frozen at release 127 and must not
// silently re-enable later archived runtime layers during data recovery.
assert.match(loader,/const RELEASE='127'/,'production loader must remain frozen at Build127');
assert.ok(loader.includes("'build127-carpet-receiving-guard-authority.js'"),'Build127 receiving authority must remain loaded');
assert.ok(!loader.includes("'build127-operation-status-tail.js'"),'archived status-tail layer must remain unloaded in frozen Build127 baseline');
assert.ok(!loader.includes("'build144-safe-data-hygiene.js'"),'Build144 must not enter production before engineering gates pass');
console.log('Build127 frozen-baseline + archived operation status tail: PASS');
