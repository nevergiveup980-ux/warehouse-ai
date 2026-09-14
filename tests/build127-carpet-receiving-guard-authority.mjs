import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build127-carpet-receiving-guard-authority.js',import.meta.url),'utf8');

function base(){return 'base'}
function build125(){return 'build125'}
build125.__build125=true;build125.__original=base;
function outerBuild120(){return 'old-build120'}
outerBuild120.__build120=true;outerBuild120.__original=build125;
function add125(){return 'add125'}
add125.__build125=true;add125.__original=base;
function add120(){return 'add120'}
add120.__build120=true;add120.__original=add125;
function status125(){return 'status125'}
status125.__build125=true;status125.__original=base;
function status120(){return 'status120'}
status120.__build120=true;status120.__original=status125;
function impact126(){return 'impact126'}
impact126.__build126=true;impact126.__original=base;
function impact125(){return 'impact125'}
impact125.__build125=true;impact125.__original=impact126;
function impact124(){return 'impact124'}
impact124.__build124SharedCarpet=true;impact124.__original=impact125;

let intervalFn=null;
const context={
  console,
  saveOperation:outerBuild120,
  addOperationItem:add120,
  setOperationStatus:status120,
  applySingleOperationImpact:impact124,
  document:{documentElement:{setAttribute(){}}},
  setInterval(fn){intervalFn=fn;return 1},clearInterval(){},setTimeout(fn){fn();return 1},
  addEventListener(){}
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build127-carpet-receiving-guard-authority.js'});

const api=context.RUNLUCarpetGuardAuthorityBuild127;
assert.ok(api);
assert.equal(api.version,'127');
assert.equal(context.saveOperation,build125,'Build125 save handler must become outer authority');
assert.equal(context.addOperationItem,add125,'Build125 add-line handler must become outer authority');
assert.equal(context.setOperationStatus,status125,'Build125 completion handler must become outer authority');
assert.equal(build125.__build120,true,'Build125 save handler must advertise Build120 ownership compatibility');
assert.equal(add125.__build120,true);
assert.equal(status125.__build120,true);
assert.equal(context.applySingleOperationImpact,impact126,'Build126 finalizer must become outer impact authority');
assert.equal(impact126.__build124SharedCarpet,true);
assert.equal(impact126.__build125,true);

// Simulate Build120's persistent MutationObserver trying to re-install itself.
let rewrapped=false;
if(!context.saveOperation.__build120){rewrapped=true;context.saveOperation=outerBuild120}
assert.equal(rewrapped,false,'Build120 must not re-wrap the authoritative Build125 handler');
assert.equal(context.saveOperation,build125);

// Re-claim remains idempotent after later DOM mutation/focus cycles.
intervalFn?.();
assert.equal(context.saveOperation,build125);
assert.equal(context.applySingleOperationImpact,impact126);

console.log('Build127 carpet receiving guard authority: PASS');
