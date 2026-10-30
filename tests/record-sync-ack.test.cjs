// Run: node --test tests/record-sync-ack.test.cjs
// Mirrors the production acknowledgement decision in index.html.
// No browser storage, cloud connection or inventory mutations.
const test=require('node:test');
const assert=require('node:assert/strict');
function accepted(data){
 const status=data?.status;
 const duplicateOriginalStatus=data?.original?.status;
 return status==='ok'||(status==='duplicate'&&duplicateOriginalStatus==='ok');
}
const cases=[
 ['fresh successful operation',{status:'ok'},true],
 ['duplicate of successful operation',{status:'duplicate',original:{status:'ok'}},true],
 ['conflict',{status:'conflict',reason:'base_version_required'},false],
 ['duplicate of conflicted operation',{status:'duplicate',original:{status:'conflict',reason:'base_version_required'}},false],
 ['duplicate without original result',{status:'duplicate'},false],
 ['duplicate of rejected operation',{status:'duplicate',original:{status:'error'}},false],
 ['missing status',{},false],
 ['null response',null,false]
];
for(const [name,response,expected] of cases)test(name,()=>assert.equal(accepted(response),expected));
