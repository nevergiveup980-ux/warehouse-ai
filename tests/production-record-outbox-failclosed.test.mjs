import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function recordSyncOutbox(){');
const end=html.indexOf('\nfunction setRecordSyncOutbox(',start);
assert.ok(start>=0&&end>start,'production recordSyncOutbox function exists');
const source=html.slice(start,end);
const key='runlu_record_sync_outbox_v1';

function read(raw){
  const storage={getItem(k){assert.equal(k,key);return raw}};
  return vm.runInNewContext(source+';recordSyncOutbox()',{
    localStorage:storage,RECORD_SYNC_OUTBOX_KEY:key
  });
}

test('missing outbox is empty',()=>assert.equal(read(null).length,0));
test('valid outbox retains all entries',()=>{
  const rows=[{operation_id:'keep-1'},{operation_id:'keep-2'}];
  assert.deepEqual(JSON.parse(JSON.stringify(read(JSON.stringify(rows)))),rows);
});
test('corrupt JSON fails closed without deleting raw bytes',()=>{
  const raw='[{"operation_id":"preserve"';
  assert.throws(()=>read(raw),/unreadable/);
});
test('non-array JSON fails closed',()=>{
  for(const raw of ['{}','null','"hello"','42'])
    assert.throws(()=>read(raw),/invalid format/);
});
