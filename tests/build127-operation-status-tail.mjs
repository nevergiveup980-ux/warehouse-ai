import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build127-operation-status-tail.js',import.meta.url),'utf8');
const original=x=>x?.status==='Waiting'?'<button>Start</button>':'<button>Edit</button>';
const context={window:null,operationMobileActions:original,console};
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
console.log('Build127 operation status tail: PASS');
