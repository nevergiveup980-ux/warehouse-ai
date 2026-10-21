import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../v8/cut-bridge.sql',import.meta.url),'utf8');
test('cut bridge allows matching legacy projection canonicalId without rewriting record key',()=>{
 assert.match(sql,/record_id=p_roll::text or payload->>'canonicalId'=p_roll::text/);
 assert.match(sql,/mirror_result:=public\.warehouse_apply_mutation\(m\.dataset_key,m\.record_id,/);
});
test('cut bridge locks candidates and rejects ambiguous or mismatched projections before deduction',()=>{
 const lock=sql.indexOf('for candidate in');
 const cut=sql.indexOf('result:=warehouse_v7.cut_carpet_roll(');
 assert.ok(lock>0&&cut>lock);
 assert.match(sql,/for update\s+loop/);
 assert.match(sql,/projection_count>1 then raise exception 'CARPET_PROJECTION_AMBIGUOUS'/);
 assert.match(sql,/raise exception 'CARPET_PROJECTION_ID_MISMATCH'/);
 assert.ok(sql.indexOf('CARPET_PROJECTION_AMBIGUOUS')<cut);
 assert.ok(sql.indexOf('CARPET_PROJECTION_ID_MISMATCH')<cut);
});
