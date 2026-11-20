const fs=require('node:fs');
const assert=require('node:assert/strict');
const sql=fs.readFileSync('docs/proposals/warehouse-apply-operation-safe-conflict.REVIEW_ONLY.sql','utf8');
const begin=sql.indexOf('if v_result is null then');
const ledger=sql.indexOf('insert into public.warehouse_mutations(',begin);
assert(begin>=0&&ledger>begin,'missing guarded mutation and ledger');
const section=sql.slice(begin,ledger);
assert.match(section,/begin\s+v_result:=public\.warehouse_apply_mutation\(/i);
assert.match(section,/exception when raise_exception then/i);
for(const reason of ['possible_duplicate_physical_roll','carpet_identity_requires_review']){
 assert(section.includes(reason), 'missing nested mapping: '+reason);
}
assert.match(section,/end;\s+end if;/i);
assert.match(sql,/case when v_status='ok' then 'applied' when v_status='conflict' then 'conflict' else 'blocked' end/);
assert.match(sql,/if found then return jsonb_build_object\('status','duplicate','operation_id',p_operation_id,'original',v_existing.result\)/);
console.log('PASS RPC draft nested trigger conflict and durable ledger contract (static check only)');
