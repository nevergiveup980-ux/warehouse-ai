import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(here,'../www');

async function rewrite(rel,fn){
  const path=resolve(out,rel);
  const before=await readFile(path,'utf8');
  const after=fn(before);
  await writeFile(path,after,'utf8');
}

const excludedBuilds=['075','076','077','078','083','084','085','086','087'];
const excludedRe=new RegExp(`^build(?:${excludedBuilds.join('|')})-`,'i');
for(const name of await readdir(out))if(excludedRe.test(name))await rm(resolve(out,name),{force:true});
await rewrite('release-loader.js',text=>text.split('\n').filter(line=>!excludedRe.test(line.trim().replace(/^['\"]/,''))).join('\n'));

const functionReplacements=new Map([
  ['scanOrderValue',String.raw`function scanOrderValue(raw){
 const explicit=firstMatch(raw,[
  /\bP\.?\s*O\.?\s*(?:NO\.?|NUMBER|#)?\s*[:#-]?\s*([A-Z0-9-]{5,})\b/i,
  /\b(?:ORDER|INVOICE)\s*(?:NO\.?|NUMBER|#)\s*[:#-]?\s*([A-Z0-9-]{5,})\b/i
 ]);
 if(explicit&&(explicit.match(/\d/g)||[]).length>=4)return explicit;
 return '';
}`],
  ['scanRecognizedProductRows',String.raw`function scanRecognizedProductRows(raw){
 const text=normalizeOcrText(raw),rows=[];
 scanMatchedMasters(text).forEach(x=>{
  if(!rows.some(row=>normKey(row.name)===normKey(x.master.name)))rows.push({name:x.master.name,color:x.master.color||'',sku:x.master.sku||'',detail:[x.master.series,x.master.category].filter(Boolean).join(' · ')});
 });
 return rows;
}`],
  ['inventorySearchKey',`function inventorySearchKey(value){return normKey(value)}`],
  ['underlaymentSpec',`function underlaymentSpec(item={}){const p=operationMaster(item)||{},syPerRoll=Number(p.syPerRoll||0),lbPerRoll=Number(p.lbPerRoll||0);if(!(syPerRoll>0))return null;return {key:String(p.id||p.sku||p.name||''),name:p.name||item.product||item.collection||'Underlayment',syPerRoll,lbPerRoll}}`],
  ['carpetRackCapacity',`function carpetRackCapacity(rack){const row=warehouseLocations().find(x=>normKey(x.code)===normKey(rack));return Math.max(0,Number(row?.capacity||0))}`],
  ['carpetInventoryMapHTML',`function carpetInventoryMapHTML(rows){const groups={};rows.forEach(x=>{const rack=String(x.location||'Unassigned').trim()||'Unassigned';(groups[rack]||(groups[rack]=[])).push(x)});const known=new Set(Object.keys(groups));return \`<div class="inventoryRackGrid">\${[...known].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(r=>{const items=groups[r]||[],cap=carpetRackCapacity(r),state=items.length===0?'empty':carpetRackState(items.length,cap)||'empty';return \`<button class="inventoryRackCard \${state}" onclick="setCarpetRackFilter('\${esc(r)}')"><b>\${esc(r)}</b><span>\${items.length}\${cap?' / '+cap:''} roll(s)</span><small>\${items.slice(0,4).map(x=>esc(x.roll)).join(' · ')||'No active rolls'}\${items.length>4?' · +'+(items.length-4):''}</small></button>\`}).join('')}</div>\`}`],
  ['defaultWarehouseLocations',`function defaultWarehouseLocations(){return []}`],
  ['applyV5522UnderlaymentSpecs',`function applyV5522UnderlaymentSpecs(showMessage=false){if(showMessage)alert('No fixed underlayment conversion rules are bundled. Configure product units and specifications in Product Master.');return []}`],
  ['voiceWarehouseAliasDictionary',`function voiceWarehouseAliasDictionary(text){return null}`],
  ['voiceProductFamilyMasters',`function voiceProductFamilyMasters(message,resolved){return resolved?.master?[resolved.master]:[]}`],
  ['voiceEntityFamilyKey',`function voiceEntityFamilyKey(master){return master?voiceNorm(master.name||master.sku||master.id||''):''}`]
]);

function transformInlineScripts(html){
  const scriptRe=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const replaced=new Set();
  html=html.replace(scriptRe,(whole,attrs,code)=>{
    if(/\bsrc\s*=/.test(attrs))return whole;
    let ast;
    try{ast=parse(code,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true})}
    catch(error){throw new Error(`Flooring public sanitizer could not parse inline JavaScript: ${error.message}`)}
    const edits=[];
    walk.simple(ast,{
      FunctionDeclaration(node){const name=node.id?.name;if(name&&functionReplacements.has(name)){edits.push({start:node.start,end:node.end,text:functionReplacements.get(name)});replaced.add(name)}},
      VariableDeclaration(node){if(node.declarations?.some(d=>d.id?.type==='Identifier'&&d.id.name==='UNDERLAYMENT_SPECS'))edits.push({start:node.start,end:node.end,text:'const UNDERLAYMENT_SPECS=[];'})}
    });
    edits.sort((a,b)=>b.start-a.start);
    for(const edit of edits)code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
    return `<script${attrs}>${code}</script>`;
  });
  for(const name of functionReplacements.keys())if(!replaced.has(name))throw new Error(`Expected mature-core function was not found: ${name}`);
  return html;
}

await rewrite('universal-app.html',html=>{
  html=transformInlineScripts(html);
  html=html
    .replaceAll('<option>Spill Blocker</option><option>HEATHER CHOICE</option><option>PLATINUM</option>','')
    .replace('Try: “How many Platinum?”, “Where is Heather Choice?”, “181243”, or “今天还有几个 Transfer？”','Try: “How many are in stock?”, “Where is this roll?”, or “今天还有几个 Transfer？”')
    .replace('<div class="voiceQuick"><button onclick="voiceHandle(\'How many Platinum?\')">How many Platinum?</button><button onclick="voiceHandle(\'Where is Heather Choice?\')">Where is Heather Choice?</button>','<div class="voiceQuick"><button onclick="voiceHandle(\'Show today inventory\')">Today Inventory</button><button onclick="voiceHandle(\'Show active carpet rolls\')">Active Carpet</button>')
    .replace('(?:DEERFOOT|CARPET|FLOORING|CALGARY|ALBERTA|CANADA|STREET|ROAD|DRIVE|PLACE|AVE|EMAIL|PHONE|FAX|WWW|GST|SOLD|SHIP|DATE|DC)','(?:CARPET|FLOORING|CALGARY|ALBERTA|CANADA|STREET|ROAD|DRIVE|PLACE|AVE|EMAIL|PHONE|FAX|WWW|GST|SOLD|SHIP|DATE|DC)')
    .replace('Add Heather Choice or another material below, then complete. Only the new item will update inventory.','Add another material below, then complete. Only the new item will update inventory.')
    .replace('iOS often returns mixed speech with no boundary, e.g. “Platinum在哪里” or “Spill Blocker还有多少”.','iOS can return mixed-language speech with no boundary between Latin and Han characters.')
    .replaceAll('Runlu Warehouse AI','RUNLU Warehouse OS')
    .replaceAll('RUNLU Warehouse AI','RUNLU Warehouse OS')
    .replaceAll("'Warehouse AI'","'RUNLU Voice'")
    .replace('MULTI-AI GATEWAY READY · Build048','LOCAL WAREHOUSE READY')
    .replace(/<title>[^<]*<\/title>/,'<title>RUNLU Warehouse OS</title>');

  const today="function todayISO(){const d=new Date(),year=d.getFullYear(),month=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${year}-${month}-${day}`}";
  const helpers=`${today}\nfunction runluGeneralLowStockThreshold(){const c=RUNLUWorkspace.workspace()?.config?.warehouse?.lowStock||{};return c.enabled?Math.max(0,Number(c.defaultQuantity||0)):0}\nfunction runluCarpetLowStockThreshold(){const c=RUNLUWorkspace.workspace()?.config?.warehouse?.lowStock||{};return c.enabled?Math.max(0,Number(c.carpetFeet||0)):0}\nfunction runluIsGeneralLowStock(qty){const t=runluGeneralLowStockThreshold();return t>0&&Number(qty)>=0&&Number(qty)<=t}\nfunction runluIsCarpetLowStock(length){const t=runluCarpetLowStockThreshold();return t>0&&Number(length)>0&&Number(length)<=t}`;
  if(!html.includes(today))throw new Error('todayISO anchor changed; threshold helpers were not injected.');
  html=html.replace(today,helpers);

  const replacements=[
    ['low=!pending&&qty<=30','low=!pending&&runluIsGeneralLowStock(qty)'],
    ["knownLength&&length<=50&&x.status!=='Used Up'&&measure.startsWith('CAL')","knownLength&&runluIsCarpetLowStock(length)&&x.status!=='Used Up'&&measure.startsWith('CAL')"],
    ['source.tmRequired=source.length<=50&&source.length>=3','source.tmRequired=runluIsCarpetLowStock(source.length)&&source.length>=3'],
    ['roll.tmRequired=!plan.useFullRoll&&roll.length<=50&&roll.length>=3','roll.tmRequired=!plan.useFullRoll&&runluIsCarpetLowStock(roll.length)&&roll.length>=3'],
    ['roll.tmRequired=roll.length<=50','roll.tmRequired=runluIsCarpetLowStock(roll.length)'],
    ['target.tmRequired=!plan.useFullRoll&&after<=50&&after>=3','target.tmRequired=!plan.useFullRoll&&runluIsCarpetLowStock(after)&&after>=3'],
    ["if(length>0&&length<=50&&measure.startsWith('CAL')&&!usedUp)","if(runluIsCarpetLowStock(length)&&measure.startsWith('CAL')&&!usedUp)"],
    ["Number(x.length)>0&&Number(x.length)<=50&&String(x.measure||'').toUpperCase().startsWith('CAL')","runluIsCarpetLowStock(Number(x.length))&&String(x.measure||'').toUpperCase().startsWith('CAL')"],
    ["warehouseActive&&knownLength&&Number(x.length)<=50&&measure.startsWith('CAL')","warehouseActive&&knownLength&&runluIsCarpetLowStock(Number(x.length))&&measure.startsWith('CAL')"],
    ['short=warehouseActive&&knownLength&&Number(x.length)<=50','short=warehouseActive&&knownLength&&runluIsCarpetLowStock(Number(x.length))'],
    ["warehouseActive&&known&&Number(x.length)<=50&&String(x.measure||'').toUpperCase().startsWith('CAL')","warehouseActive&&known&&runluIsCarpetLowStock(Number(x.length))&&String(x.measure||'').toUpperCase().startsWith('CAL')"],
    ["under50=active.filter(x=>Number(x.length)>0&&Number(x.length)<=50)","under50=active.filter(x=>runluIsCarpetLowStock(Number(x.length)))"],
    ["tmRequired:newLength<=50&&newLength>=3&&measure!=='TM'","tmRequired:runluIsCarpetLowStock(newLength)&&newLength>=3&&measure!=='TM'"],
    ["if(measure==='TM'&&x.length<=50)","if(measure==='TM'&&runluIsCarpetLowStock(x.length))"],
    ["inv.filter(x=>!x.quantityPending&&Number(x.quantity||0)<=30).length+carpetRecords().filter(x=>isCarpetWarehouseActive(x)&&Number(x.length)>0&&Number(x.length)<=50).length","inv.filter(x=>!x.quantityPending&&runluIsGeneralLowStock(Number(x.quantity||0))).length+carpetRecords().filter(x=>isCarpetWarehouseActive(x)&&runluIsCarpetLowStock(Number(x.length))).length"],
    ['UNDER 50′','LOW STOCK'],
    ['Under 50′</span>','Low Stock</span>']
  ];
  for(const [from,to] of replacements)html=html.replaceAll(from,to);
  return html;
});

await rewrite('build091-carpet-edit-duplicate-guard.js',text=>text
  .replaceAll('RUNLU Warehouse AI','RUNLU Warehouse OS')
  .replace("tmRequired:newLength<=50&&newLength>=3&&measure!=='TM'","tmRequired:runluIsCarpetLowStock(newLength)&&newLength>=3&&measure!=='TM'")
  .replace("if(measure==='TM'&&x.length<=50)","if(measure==='TM'&&runluIsCarpetLowStock(x.length))")
  .replace('current Cloud Master model','current warehouse model')
);

await rewrite('build108-carpet-sample-checkout.js',text=>text
  .replaceAll('RUNLU Warehouse OS V6.12.15 Build108','RUNLU Warehouse OS · Carpet Sample Checkout')
  .replace('Warehouse carpet rule: every cut consumes requested length + 3 inches.','Customer-configured rule: a cut can include the warehouse cut allowance.')
  .replace('const allowance = 0.25;',"const allowanceInches=Number(window.RUNLUWorkspace?.workspace?.()?.config?.warehouse?.cutAllowance?.enabled?window.RUNLUWorkspace.workspace()?.config?.warehouse?.cutAllowance?.inches||0:0);\n    const allowance=allowanceInches/12;")
  .replace('including the 3-inch cutting allowance','including the configured cutting allowance')
  .replace('+ 3" cut allowance =','+ configured cut allowance =')
  .replace('r.allowanceInches = 3;','r.allowanceInches = Number(p.allowance*12||0);')
);

await rewrite('build082-version-authority.js',text=>text
  .replaceAll('RUNLU Warehouse AI','RUNLU Warehouse OS')
  .replace("const FALLBACK = {version:'6.12.4', build:'090'};","const FALLBACK = {version:'1.0.0', build:'1'};")
  .replace('const titleWanted=`RUNLU Warehouse OS V${current.version} Build${current.build}`;','const titleWanted=`RUNLU Warehouse OS V${current.version}`;')
);

await rewrite('universal/templates.js',text=>text
  .replaceAll("lowStock:{enabled:true,defaultQuantity:30,carpetFeet:50}","lowStock:{enabled:false,defaultQuantity:0,carpetFeet:0}")
);
await rewrite('universal/runtime-config.js',text=>text
  .replace("lowStock:Object.freeze({enabled:true,defaultQuantity:30,carpetFeet:50})","lowStock:Object.freeze({enabled:false,defaultQuantity:0,carpetFeet:0})")
);
await rewrite('universal/settings.html',text=>text
  .replaceAll('No company-specific 3-inch rule is built into the Flooring Edition.','No fixed company-specific cut allowance is built into the Flooring Edition.')
  .replace("lowStock:{enabled:true,defaultQuantity:Number($('lowStock').value||0),carpetFeet:Number($('carpetLow').value||0)}","lowStock:{enabled:Number($('lowStock').value||0)>0||Number($('carpetLow').value||0)>0,defaultQuantity:Number($('lowStock').value||0),carpetFeet:Number($('carpetLow').value||0)}")
  .replace('<label>Default low-stock quantity</label>','<label>Default low-stock quantity (0 = Off)</label>')
  .replace('<label>Carpet low-stock feet</label>','<label>Carpet low-stock feet (0 = Off)</label>')
);
await rewrite('universal/onboarding.html',text=>text
  .replace('Cut allowance defaults to Off / 0 and can be configured later by each customer.','Cut allowance and low-stock thresholds default to Off / 0 and can be configured later by each customer.')
);

await writeFile(resolve(out,'version.json'),JSON.stringify({version:'1.0.0',build:'1',date:'2026-09-05',channel:'app-store',notes:'RUNLU Warehouse OS Flooring Edition 1.0'},null,2)+'\n','utf8');

async function walkFiles(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())files.push(...await walkFiles(p));else files.push(p)}return files}
const textFiles=(await walkFiles(out)).filter(p=>['.html','.js','.json','.svg'].includes(extname(p).toLowerCase()));
const forbidden=[/heather\s*choice/i,/spill\s*blocker/i,/\bplatinum\b/i,/cloud\s*9/i,/luxurious\s*elite/i,/perpetual\s*move/i,/\bdeerfoot\b/i,/48075-25-d/i,/heather-choice/i,/platinum-stock/i,/\b3\s*(?:″|inches?|[- ]inch)\b/i,/Aug\s+1.{0,20}Jul\s+31/i];
const errors=[];
for(const file of textFiles){const rel=file.slice(out.length+1).replaceAll('\\','/');if(rel==='tesseract.min.js')continue;const text=await readFile(file,'utf8');for(const re of forbidden)if(re.test(text))errors.push(`${re} remains in ${rel}`);if(excludedRe.test(rel))errors.push(`Excluded company-specific build remains: ${rel}`)}
const loader=await readFile(resolve(out,'release-loader.js'),'utf8');if(excludedBuilds.some(n=>loader.includes(`build${n}-`)))errors.push('Excluded company-specific build remains in release-loader.js');
if(errors.length)throw new Error('Flooring public business-rule sanitizer failed:\n'+errors.join('\n'));
console.log('RUNLU Flooring public sanitizer passed: customer-specific products, racks, fixed thresholds and legacy release branding removed.');
