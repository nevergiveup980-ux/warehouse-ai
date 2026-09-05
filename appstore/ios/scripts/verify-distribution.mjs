import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(here,'../www');
const textExt=new Set(['.html','.js','.json','.svg']);
const errors=[];

async function walk(dir){const files=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,entry.name);if(entry.isDirectory())files.push(...await walk(p));else files.push(p)}return files}
const files=await walk(out);
const names=files.map(f=>f.slice(out.length+1).replaceAll('\\','/'));

for(const forbiddenFile of ['carpet_seed.js','screenshot-fixture.js'])if(names.some(n=>n.endsWith('/'+forbiddenFile)||n===forbiddenFile))errors.push(`Forbidden distribution file present: ${forbiddenFile}`);
const blockedBuilds=['072','073','074','075','076','077','078','083','084','085','086','087','088','090','094','095','096','097','098','099','100','101','102','103','104','107'];
for(const n of blockedBuilds)if(names.some(name=>new RegExp(`^build${n}-`,'i').test(name)))errors.push(`Private/company-specific/cloud build present: build${n}-`);

const exactForbidden=[
 ['production Supabase origin','https://ekrnknlawekeoszzkamd.supabase.co'],
 ['production Supabase publishable key','sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn'],
 ['Cloud Master runtime','runluCloudMaster'],
 ['Cloud Master storage namespace','runlu_cloud_master_'],
 ['historical PO 181276','181276'],
 ['historical PO 21228','21228'],
 ['historical PO 805613-EDM','805613-EDM'],
 ['old monthly pricing hypothesis','29.99'],
 ['old annual pricing hypothesis','299.99'],
 ['screenshot fixture company','Northstar Flooring Supply'],
 ['screenshot fixture marker','RUNLU_SCREENSHOT_FIXTURE_V1'],
 ['screenshot fixture PO','PO-DEMO-001']
];
const regexForbidden=[
 ['private company bridge',/\bdeerfoot\b/i],
 ['private training bridge',/central\s+training/i],
 ['company-specific product',/heather\s*choice/i],
 ['company-specific product',/spill\s*blocker/i],
 ['company-specific product',/\bplatinum\b/i],
 ['company-specific product',/cloud\s*9/i],
 ['company-specific product',/luxurious\s*elite/i],
 ['company-specific product',/perpetual\s*move/i],
 ['company-specific SKU',/48075-25-d/i],
 ['company-specific SKU',/heather-choice/i],
 ['company-specific SKU',/platinum-stock/i],
 ['fixed 3-inch business rule',/\b3\s*(?:″|inches?|[- ]inch)\b/i],
 ['company inventory year rule',/Aug\s+1.{0,30}Jul\s+31/i]
];
for(const file of files){
 if(!textExt.has(extname(file).toLowerCase()))continue;
 const rel=file.slice(out.length+1).replaceAll('\\','/');
 if(rel==='tesseract.min.js')continue;
 const text=await readFile(file,'utf8');
 for(const [label,needle] of exactForbidden)if(text.includes(needle))errors.push(`${label} remains in ${rel}`);
 for(const [label,re] of regexForbidden)if(re.test(text))errors.push(`${label} remains in ${rel}: ${re}`);
 const poLiteral=text.match(/\bPO\s*#?\s*\d{5,}(?:-[A-Z0-9-]+)?/i);if(poLiteral)errors.push(`Hard-coded PO literal remains in ${rel}: ${poLiteral[0]}`);
}

for(const required of ['index.html','universal-app.html','universal/onboarding.html','universal/sign-in.html','universal/users.html','universal/local-auth.js','universal/backup.html','universal/backup-manager.js','universal/permission-guard.js','universal/preview.html','universal/settings.html','release-loader.js','version.json','build082-version-authority.js','build091-carpet-edit-duplicate-guard.js','build108-carpet-sample-checkout.js']){try{await access(resolve(out,required))}catch{errors.push(`Required distribution file missing: ${required}`)}}

const mature=await readFile(resolve(out,'universal-app.html'),'utf8');
if(mature.includes('Cloud login password')||mature.includes('Download Cloud Data'))errors.push('Cloud Sync UI remains in universal-app.html.');
if(!mature.includes("function restoreConversationOrders(){return {addedOrders:0,addedSpecial:0,distribution:'clean'};}"))errors.push('Historical order recovery was not neutralized.');
if(!mature.includes("function migrateLegacyCarpetData(){return {addedRolls:0,addedCuts:0,distribution:'clean'};}"))errors.push('Legacy carpet migration was not neutralized.');
if(!mature.includes('runlu-native.js'))errors.push('Native bridge is not injected into mature core.');
if(!mature.includes('function scanGptEnabled(){return false}'))errors.push('Cloud Vision capability is not hard-disabled.');
if(!mature.includes('function voiceGptEnabled(){return false}'))errors.push('Cloud Voice AI capability is not hard-disabled.');
if(mature.includes('id="scanAiMode"')||mature.includes("id='scanAiMode'"))errors.push('Cloud Vision mode control remains in public UI.');
if(mature.includes('id="voiceAiMode"')||mature.includes("id='voiceAiMode'"))errors.push('Cloud Voice AI mode control remains in public UI.');
if(!mature.includes('configured cut allowance')&&!mature.includes('configured cutting allowance'))errors.push('Public core does not expose configurable cut allowance language.');
if(/\bJohn\b/.test(mature))errors.push('Personal operator default remains in public core.');
if(/\bTony\b/.test(mature))errors.push('Private customer/store example remains in public core.');
if(!mature.includes('function runluGeneralLowStockThreshold()')||!mature.includes('function runluCarpetLowStockThreshold()'))errors.push('Config-driven low-stock thresholds are missing.');
if(!mature.includes('function defaultWarehouseLocations(){return []}'))errors.push('Public app still seeds a company warehouse location map.');
if(!mature.includes("const UNDERLAYMENT_SPECS=[];"))errors.push('Public app still contains fixed named underlayment specifications.');
if(!mature.includes("function inventorySearchKey(value){return normKey(value)}"))errors.push('Inventory search still carries company-specific aliases.');
if(!mature.includes("function voiceWarehouseAliasDictionary(text){return null}"))errors.push('Voice still carries a company-specific alias dictionary.');
if(!mature.includes("function applyV5522UnderlaymentSpecs(showMessage=false)"))errors.push('Underlayment migration guard is missing.');
if(/const\s+deerfoot\s*=|\b18\\d\{4\}/i.test(mature))errors.push('Company-specific 18xxxx PO fallback remains.');
if(!mature.includes('<h1>Warehouse OS</h1>'))errors.push('Mature-core header is not compacted to Warehouse OS.');
if(!mature.includes('<p>Flooring Operations</p>'))errors.push('Mature-core header subtitle is not Flooring Operations.');
if(mature.includes('<h1>RUNLU Warehouse OS</h1>'))errors.push('Nested mature-core header still duplicates full RUNLU product name.');

const templates=await readFile(resolve(out,'universal/templates.js'),'utf8');
if(!templates.includes("id:'flooring'"))errors.push('Flooring template is missing.');
if(!templates.includes("cutAllowance:{enabled:false,inches:0}"))errors.push('Templates do not preserve zero/off cut allowance default.');
if((templates.match(/lowStock:\{enabled:false,defaultQuantity:0,carpetFeet:0\}/g)||[]).length<3)errors.push('Public templates do not use neutral Off / 0 low-stock defaults.');

const runtime=await readFile(resolve(out,'universal/runtime-config.js'),'utf8');
if(!runtime.includes('lowStock:Object.freeze({enabled:false,defaultQuantity:0,carpetFeet:0})'))errors.push('Runtime low-stock defaults are not neutral Off / 0.');
if(!runtime.includes('cutAllowance:Object.freeze({enabled:false,inches:0})'))errors.push('Runtime cut allowance is not neutral Off / 0.');

const auth=await readFile(resolve(out,'universal/local-auth.js'),'utf8');
if(!auth.includes('PBKDF2')||!auth.includes('pinHash')||!auth.includes('salt'))errors.push('Local account PIN hashing is not present.');
if(!auth.includes("['admin','manager','member','viewer']"))errors.push('Local role model is incomplete.');

const backup=await readFile(resolve(out,'universal/backup-manager.js'),'utf8');
if(!backup.includes("const FORMAT='RUNLU-WAREHOUSE-BACKUP'")||!backup.includes('AES-GCM')||!backup.includes('PBKDF2'))errors.push('Encrypted RUNLU backup format is incomplete.');
if(!backup.includes("W.can('backupData')")||!backup.includes('tenantStorage'))errors.push('Owner-only full tenant backup enforcement is missing.');
const backupPage=await readFile(resolve(out,'universal/backup.html'),'utf8');
if(!backupPage.includes('Restore This Backup')||!backupPage.includes('RUNLU does not receive a copy'))errors.push('Customer-owned backup/restore UI is incomplete.');

const permissions=await readFile(resolve(out,'universal/permission-guard.js'),'utf8');
for(const needle of ['manageProducts','editInventory','manageOrders','saveOperation','setOperationStatus'])if(!permissions.includes(needle))errors.push(`Role permission guard is missing ${needle}.`);

const onboarding=await readFile(resolve(out,'universal/onboarding.html'),'utf8');
if(!onboarding.includes('value="flooring" selected'))errors.push('Flooring is not the default onboarding template.');
if(!onboarding.includes('Local Owner account'))errors.push('Local Owner account setup is missing.');
if(!onboarding.includes('backup.html'))errors.push('Fresh-install backup restore entry is missing.');
if(!onboarding.includes('low-stock thresholds default to Off / 0'))errors.push('Onboarding does not explain neutral low-stock defaults.');

const signIn=await readFile(resolve(out,'universal/sign-in.html'),'utf8');
if(!signIn.includes('Restore an encrypted backup'))errors.push('Sign-in recovery path to encrypted backup restore is missing.');

const settings=await readFile(resolve(out,'universal/settings.html'),'utf8');
if(!settings.includes('RUNLU-hosted cloud: Off'))errors.push('Customer-owned cloud posture is not shown in Settings.');
if(settings.includes('data-feature="multiDeviceSync"'))errors.push('Multi-device sync toggle should not ship before a customer-owned connector exists.');
if(!settings.includes('0 = Off'))errors.push('Settings do not explain how to disable low-stock thresholds.');

const preview=await readFile(resolve(out,'universal/preview.html'),'utf8');
if(!preview.includes('permission-guard.js'))errors.push('Mature core permission guard is not injected.');
if(!preview.includes('backupLink'))errors.push('Owner backup entry is missing from shell.');
if(!preview.includes("owner:'Owner'")||!preview.includes("admin:'Administrator'")||!preview.includes("member:'Staff'"))errors.push('Public shell does not normalize local role labels.');

const entry=await readFile(resolve(out,'index.html'),'utf8');
if(!entry.includes('sign-in.html')||!entry.includes('RUNLULocalAuth.currentUser'))errors.push('App entry point does not enforce local sign-in.');

const version=JSON.parse(await readFile(resolve(out,'version.json'),'utf8'));
if(version.version!=='1.0.0'||String(version.build)!=='1'||version.channel!=='app-store')errors.push('App Store version manifest is not locked to 1.0.0 (1).');
const versionAuthority=await readFile(resolve(out,'build082-version-authority.js'),'utf8');
if(!versionAuthority.includes("const FALLBACK = {version:'1.0.0', build:'1'};"))errors.push('Version authority fallback is not App Store 1.0.0 (1).');
if(!versionAuthority.includes('RUNLU Warehouse OS V${current.version}'))errors.push('Version authority still uses legacy product branding.');

const build108=await readFile(resolve(out,'build108-carpet-sample-checkout.js'),'utf8');
if(!build108.includes('cutAllowance')||!build108.includes('configured cutting allowance'))errors.push('Carpet Sample Checkout is not using customer-configurable cut allowance.');
const build091=await readFile(resolve(out,'build091-carpet-edit-duplicate-guard.js'),'utf8');
if(!build091.includes('runluIsCarpetLowStock'))errors.push('Carpet duplicate/edit guard still uses a fixed low-stock threshold.');

if(errors.length){console.error('\nRUNLU App Store distribution verification FAILED:\n');for(const error of errors)console.error(' - '+error);process.exit(1)}
console.log(`RUNLU App Store distribution verification passed (${files.length} packaged files).`);
