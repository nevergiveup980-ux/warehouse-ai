import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build137-quiet-cloud-recovery-banner.js',import.meta.url),'utf8');

function classList(initial=[]){
  const set=new Set(initial);
  return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toString:()=>[...set].join(' ')};
}
const banner={classList:classList(),className:'',textContent:''};
const title={textContent:'Warehouse open · Reconnecting Cloud'};
const header={className:'cloudPill online',textContent:'Cloud ✓'};
const nodes={runluCloudRecoveryBanner:banner,runluCloudRecoveryTitle:title,headerCloudPill:header};
const attrs=new Map();
let now=1000;
const document={
  readyState:'complete',visibilityState:'visible',
  documentElement:{setAttribute(k,v){attrs.set(k,v)}},
  getElementById(id){return nodes[id]||null},
  addEventListener(){}
};
class MutationObserver{constructor(fn){this.fn=fn}observe(){}disconnect(){}}
const context={
  console,document,MutationObserver,queueMicrotask:fn=>fn(),Date:{now:()=>now},
  setTimeout(fn){fn();return 1},clearTimeout(){},setInterval(){return 1},
  window:{addEventListener(){}}
};
context.window.window=context.window;context.window.document=document;context.window.MutationObserver=MutationObserver;
context.window.queueMicrotask=context.queueMicrotask;context.window.setTimeout=context.setTimeout;context.window.clearTimeout=context.clearTimeout;context.window.setInterval=context.setInterval;
vm.createContext(context);
vm.runInContext(source,context,{filename:'build137-quiet-cloud-recovery-banner.js'});

const api=context.window.RUNLUQuietCloudRecoveryBannerBuild137;
assert.ok(api,'Build137 banner API must be exported');
assert.equal(api.classifyTitle('Warehouse open · Reconnecting Cloud'),'passive');
assert.equal(api.classifyTitle('Warehouse open · Cloud needs attention'),'actionable');
assert.equal(banner.classList.contains('hidden'),true,'healthy passive reconnect banner should auto-dismiss');
assert.equal(attrs.get('data-runlu-cloud-recovery-banner'),'137:quiet');

banner.classList.remove('hidden');
title.textContent='Warehouse open · Cloud needs attention';
api.inspect();
assert.equal(banner.classList.contains('hidden'),false,'actionable cloud error must remain visible');

banner.classList.remove('hidden');
title.textContent='Warehouse open · Reconnecting Cloud';
header.className='cloudPill syncing';header.textContent='Syncing…';
now=2000;
api.inspect();
assert.equal(banner.classList.contains('hidden'),true,'passive reconnect banner must not remain stuck even while sync continues');

console.log('Build137 quiet cloud recovery banner regression: PASS');
