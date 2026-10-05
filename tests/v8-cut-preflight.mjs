import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const compat=fs.readFileSync(new URL('../v8-compat.js',import.meta.url),'utf8');
const id='0ffc1347-ac7c-4e92-a709-26c22796fe58';
let rows=[{id,roll_number:'RC2096',version:1,remaining_sixteenths:15216,lifecycle:'active'}],requests=[];
const c={console,crypto:{randomUUID:()=> 'test-command'},cloudEnsureSession:async()=>({user:{id:'operator'},access_token:'test-token'}),cloudHeaders:()=>({}),cloudRequest:async(path,options)=>{requests.push({path,options});return rows[0]||null}};
c.window=c;vm.createContext(c);vm.runInContext(compat,c);
vm.runInContext(html.slice(html.indexOf('async function v8ReadCutRoll('),html.indexOf('async function v8ExecuteCutCommand(')),c);
const cached={canonicalId:id,roll:'RC2096',length:999};
const live=await c.v8ReadCutRoll(cached);
assert.equal(live._cloudVersion,1);assert.equal(live.length,79.25);assert.equal(cached.length,999);
assert.equal(requests[0].path,'/rest/v1/rpc/warehouse_v8_cut_read');assert.equal(JSON.parse(requests[0].options.body).p_roll,id);assert.equal(requests[0].options.method,'POST');
const plan=c.RUNLU_V8_CUT_PLAN(live,62,5);
assert.equal(plan.deductFeet,63.25);assert.equal(plan.remainingFeet,16);assert.equal(plan.allowanceInches,15);
const command=c.RUNLU_V8_BUILD_CUT_COMMAND(live,62,5,{});
assert.equal(command.expectedVersion,1);assert.equal(command.deductSixteenths,12144);
assert.equal(c.RUNLU_V8_VALIDATE_CUT_RESULT(plan,{status:'committed',remaining_sixteenths:3072,new_version:2}),true);
for(const result of [{status:'rejected',code:'STALE_VERSION'},{},{status:'committed'}]){
 assert.throws(()=>c.RUNLU_V8_VALIDATE_CUT_RESULT(plan,result));
}
rows=[];await assert.rejects(()=>c.v8ReadCutRoll(cached),/not found/);
rows=[{id,version:1,remaining_sixteenths:15216,lifecycle:'consumed'}];await assert.rejects(()=>c.v8ReadCutRoll(cached),/not active/);
rows=[{id,version:0,remaining_sixteenths:15216,lifecycle:'active'}];await assert.rejects(()=>c.v8ReadCutRoll(cached),/Invalid/);
c.cloudRequest=async()=>{throw new Error('offline')};await assert.rejects(()=>c.v8ReadCutRoll(cached),/offline/);
const nodes={operationCalculationPreview:{style:{}},operationCuts:{value:'5'},operationProduct:{value:'Natural Texture',dataset:{}},operationCollection:{value:''},operationColour:{value:''},operationUnit:{value:'Foot'},operationLineType:{value:'Carpet Cutting'},operationLineInventoryMode:{value:'Stock'},operationRoll:{value:'RC2096',dataset:{}}};
Object.assign(c,{$:id=>nodes[id],operationQuantityInput:()=>62,underlaymentSpec:()=>null,currentOperationInventoryRecord:()=>null,carpetRecords:()=>[live],findCarpetRollForOperation:()=>live,feetLabel:n=>String(n),carpetCutConsumptionPlan:item=>({useFullRoll:false})});
vm.runInContext(html.slice(html.indexOf('function enrichOperationItem('),html.indexOf('function operationQuantityLabel(')),c);
c.updateOperationCalculationPreview();
assert.match(nodes.operationCalculationPreview.innerHTML,/5 cut\(s\)/);
assert.match(nodes.operationCalculationPreview.innerHTML,/63.25/);
assert.ok(html.includes('const liveRoll=await v8ReadCutRoll(roll)'));
assert.ok(html.includes('RUNLU_V8_BUILD_CUT_COMMAND(liveRoll,'));
console.log('V8 canonical cut preflight, result validation and five-cut preview: PASS');


for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(script[1].trim())new vm.Script(script[1]);}
