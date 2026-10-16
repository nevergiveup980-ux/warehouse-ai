import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../build072-hotfix.js',import.meta.url),'utf8');

test('all conflict resolution actions are paused in handler and UI',()=>{
  const handler=source.slice(source.indexOf('window.runluCloudMasterResolve='),source.indexOf('\n  function renderPanel()',source.indexOf('window.runluCloudMasterResolve=')));
  assert.match(handler,/\['cloud','device','delete'\]\.includes\(action\)/);
  assert.doesNotMatch(handler,/write\(QUEUE|sync\(|m\.op\s*=/);
  for(const label of ['Use Cloud — Disabled','Apply Device — Disabled','Delete Duplicate — Disabled'])
    assert.ok(source.includes(label));
  assert.doesNotMatch(source,/onclick="runluCloudMasterResolve\(/);
});

test('invalid queue fails closed without replacing it',()=>{
  const start=source.indexOf('function queue(){');
  const end=source.indexOf('\n  function conflicts()',start);
  const body=source.slice(start,end);
  assert.match(body,/localStorage\.getItem\(QUEUE\)/);
  assert.match(body,/throw new Error\('Cloud Master offline queue is unreadable/);
  assert.match(body,/!Array\.isArray\(q\)/);
});

test('pending queue blocks both activation and cloud refresh',()=>{
  assert.match(source,/if\(queue\(\)\.length\)throw new Error\('Cloud Master activation paused/);
  assert.match(source,/if\(queue\(\)\.length\)throw new Error\('Cloud refresh paused/);
});

test('existing conflicts stop auto-upload before mutation loop',()=>{
  const flush=source.slice(source.indexOf('async function flushQueue('),source.indexOf('\n  function sortDataset('));
  assert.ok(flush.indexOf('if(conflicts().length)throw')>=0);
  assert.ok(flush.indexOf('if(conflicts().length)throw')<flush.indexOf('applyMutation(s,m)'));
});

test('failed enqueue restores cache and queue',()=>{
  const wrapper=source.slice(source.indexOf('function installSaveWrapper()'),source.indexOf('\n  function installCloudWrappers()'));
  assert.match(wrapper,/previousRaw=localStorage\.getItem\(k\)/);
  assert.match(wrapper,/previousQueue=localStorage\.getItem\(QUEUE\)/);
  assert.match(wrapper,/localStorage\.setItem\(QUEUE,previousQueue\)/);
  assert.match(wrapper,/localStorage\.setItem\(k,previousRaw\)/);
});
