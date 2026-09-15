import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build127-operation-status-tail.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../release-loader.js',import.meta.url),'utf8');
const original=x=>x?.status==='Waiting'?'<button>Start</button>':'<button>Edit</button>';

// Immediate-install path.
{
  const document={querySelectorAll:()=>[]};
  const context={window:null,operationMobileActions:original,console,document,setTimeout:()=>0};
  context.window=context;
  vm.runInNewContext(source,context,{filename:'build127-operation-status-tail.js'});
  assert.equal(
    context.operationMobileActions({impactApplied:true,inventoryMode:'Record Only',impactResult:'Completed as a work record only'}),
    '<div class="lockedOperation">✓ Completed · Work record saved</div>'
  );
  assert.equal(
    context.operationMobileActions({impactApplied:true,inventoryMode:'Stock',impactResult:'Inventory updated'}),
    '<div class="lockedOperation">✓ Completed and linked to inventory</div>'
  );
  assert.equal(
    context.operationMobileActions({impactApplied:false,status:'Waiting'}),
    '<button>Start</button>'
  );
  assert.ok(!context.operationMobileActions({impactApplied:true,inventoryMode:'Stock'}).includes('Record locked'));
  assert.ok(!context.operationMobileActions({impactApplied:true,inventoryMode:'Record Only'}).includes('linked to inventory'));
}

// Late-install path: release-loader can execute before the main app defines operationMobileActions.
{
  let domReady=null;
  const timers=[];
  const visible={textContent:'✓ Completed and linked to inventory · Record locked'};
  const document={
    readyState:'loading',
    addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')domReady=fn},
    querySelectorAll:selector=>selector==='.lockedOperation'?[visible]:[]
  };
  const context={window:null,console,document,setTimeout:fn=>{timers.push(fn);return timers.length}};
  context.window=context;
  vm.runInNewContext(source,context,{filename:'build127-operation-status-tail.js'});
  assert.equal(context.operationMobileActions,undefined,'hotfix must tolerate loading before the app function exists');
  context.operationMobileActions=original;
  assert.equal(typeof domReady,'function','hotfix must schedule a DOM-ready retry');
  domReady();
  assert.equal(
    context.operationMobileActions({impactApplied:true,inventoryMode:'Record Only',impactResult:'Completed as a work record only'}),
    '<div class="lockedOperation">✓ Completed · Work record saved</div>'
  );
  assert.equal(visible.textContent,'✓ Completed and linked to inventory','visible legacy tail should be removed after late install');
}

assert.ok(loader.includes("'build127-operation-status-tail.js'"),'release-loader must load the status-tail hotfix');
console.log('Build127 operation status tail: PASS');
