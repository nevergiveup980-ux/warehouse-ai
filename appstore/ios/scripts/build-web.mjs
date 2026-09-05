import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { load as loadHtml } from 'cheerio';

const here = dirname(fileURLToPath(import.meta.url));
const iosDir = resolve(here, '..');
const repoRoot = resolve(iosDir, '../..');
const out = resolve(iosDir, 'www');
const universalSrc = resolve(repoRoot, 'universal');
const universalOut = resolve(out, 'universal');

const OMIT_ROOT = new Set(['index.html','universal-app.html','carpet_seed.js','worker.js','worker.min.js']);
const OMIT_BUILD_RE = /^build(?:072-|088-|090-|094-|095-|096-|097-|098-|099-|100-|101-|102-|103-|104-)/i;
const OMIT_BUILD_ANY_RE = /build(?:072-|088-|090-|094-|095-|096-|097-|098-|099-|100-|101-|102-|103-|104-)/i;
const COPY_EXTENSIONS = new Set(['.js','.json','.jpg','.jpeg','.png','.svg','.wasm','.gz']);

const replacements = new Map([
  ['initializeSeedDatabase', "function initializeSeedDatabase(){return {addedMasters:0,addedInventory:0,distribution:'clean'};}"],
  ['autoInitializeSeed', "function autoInitializeSeed(){return false;}"],
  ['applyV516WarehouseDataset', "function applyV516WarehouseDataset(){return {addedMasters:0,addedInventory:0,distribution:'clean'};}"],
  ['applyV5515FieldProducts', "function applyV5515FieldProducts(){return {addedM:0,addedI:0,distribution:'clean'};}"],
  ['restoreConversationOrders', "function restoreConversationOrders(){return {addedOrders:0,addedSpecial:0,distribution:'clean'};}"],
  ['migrateLegacyCarpetData', "function migrateLegacyCarpetData(){return {addedRolls:0,addedCuts:0,distribution:'clean'};}"],
  ['cloudSignUp', "async function cloudSignUp(){return null;}"],
  ['cloudSignIn', "async function cloudSignIn(){return null;}"],
  ['cloudChangePassword', "async function cloudChangePassword(){return null;}"],
  ['cloudSignOut', "function cloudSignOut(){return null;}"],
  ['cloudAutoRefresh', "async function cloudAutoRefresh(){return null;}"],
  ['startCloudPolling', "function startCloudPolling(){return null;}"],
  ['cloudSyncNow', "async function cloudSyncNow(){return null;}"],
  ['cloudUploadAll', "async function cloudUploadAll(){return null;}"],
  ['cloudDownloadAll', "async function cloudDownloadAll(){return null;}"],
  ['cloudResolveConflictsFromCloud', "async function cloudResolveConflictsFromCloud(){return null;}"],
  ['cloudResolveConflictsFromDevice', "async function cloudResolveConflictsFromDevice(){return null;}"],
]);

await rm(out,{recursive:true,force:true});await mkdir(universalOut,{recursive:true});
for(const entry of await readdir(repoRoot,{withFileTypes:true})){if(!entry.isFile()||OMIT_ROOT.has(entry.name)||OMIT_BUILD_RE.test(entry.name)||!COPY_EXTENSIONS.has(extname(entry.name).toLowerCase()))continue;await cp(resolve(repoRoot,entry.name),resolve(out,entry.name))}
const loaderPath=resolve(out,'release-loader.js');let loader=await readFile(loaderPath,'utf8');loader=loader.split('\n').filter(line=>!OMIT_BUILD_RE.test(line.replace(/[ '\",]/g,''))).join('\n');if(OMIT_BUILD_ANY_RE.test(loader))throw new Error('Distribution guard: an omitted private/cloud build remains in release-loader.js.');await writeFile(loaderPath,loader,'utf8');

for(const name of ['onboarding.html','sign-in.html','users.html','backup.html','preview.html','settings.html','runtime-config.js','templates.js','workspace.js','local-auth.js','backup-manager.js','permission-guard.js','storage-adapter.js','core-adapter.js','legacy-storage-shim.js'])await cp(resolve(universalSrc,name),resolve(universalOut,name));

for(const name of ['runtime-config.js','templates.js']){const p=resolve(universalOut,name);let text=await readFile(p,'utf8');text=text.replaceAll('multiDeviceSync:true','multiDeviceSync:false');if(name==='runtime-config.js'){text=text.replace("productName: 'RUNLU Warehouse OS', productCode: 'warehouse-os', channel: 'universal-development', trialDays: 14,","productName: 'RUNLU Warehouse OS', productCode: 'warehouse-os', channel: 'app-store-local-first', trialDays: 0,");text=text.replace("pricing: Object.freeze({monthlyUsd: 29.99, annualUsd: 299.99, includedUsers: 5, includedWarehouses: 1})","pricing: Object.freeze({monthlyUsd: 0, annualUsd: 0, includedUsers: 1, includedWarehouses: 1})")}await writeFile(p,text,'utf8')}
{const p=resolve(universalOut,'legacy-storage-shim.js');let text=await readFile(p,'utf8');text=text.replace("const productionCloudOrigin='https://ekrnknlawekeoszzkamd.supabase.co';","const productionCloudOrigin='https://local-only.invalid';");await writeFile(p,text,'utf8')}

function neutralizeFunctions(html){const found=new Set(),scriptRe=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;html=html.replace(scriptRe,(whole,attrs,code)=>{if(/\bsrc\s*=/.test(attrs))return whole;let ast;try{ast=parse(code,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true})}catch(error){throw new Error(`Distribution guard: could not parse an inline script: ${error.message}`)}const edits=[];walk.simple(ast,{FunctionDeclaration(node){const name=node.id?.name;if(name&&replacements.has(name)){edits.push({start:node.start,end:node.end,text:replacements.get(name)});found.add(name)}}});edits.sort((a,b)=>b.start-a.start);for(const edit of edits)code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);return `<script${attrs}>${code}</script>`});for(const required of ['initializeSeedDatabase','autoInitializeSeed','applyV516WarehouseDataset','applyV5515FieldProducts','restoreConversationOrders','migrateLegacyCarpetData','cloudSignUp','cloudSignIn','cloudAutoRefresh','startCloudPolling'])if(!found.has(required))throw new Error(`Distribution guard: expected function ${required} was not found. Upstream core changed; review before shipping.`);return html}

function configureCutAllowance(html){
  const a="Number(RUNLUWorkspace.workspace()?.config?.warehouse?.cutAllowance?.enabled?RUNLUWorkspace.workspace()?.config?.warehouse?.cutAllowance?.inches||0:0)";
  html=html.replaceAll('requested+(cuts*0.25)',`requested+(cuts*(${a}/12))`);
  html=html.replaceAll('out.allowanceInches=out.numberOfCuts*3;',`out.allowanceInches=out.numberOfCuts*${a};`);
  html=html.replaceAll('requested+pieces.length*0.25',`requested+pieces.length*(${a}/12)`);
  html=html.replaceAll('requested+numberOfCuts*0.25',`requested+numberOfCuts*(${a}/12)`);
  html=html.replaceAll('allowanceInches:r.allowanceInches||3','allowanceInches:Number(r.allowanceInches||0)');
  html=html.replaceAll('r.allowanceInches=(r.numberOfCuts||1)*3;',`r.allowanceInches=(r.numberOfCuts||1)*${a};`);
  html=html.replaceAll('stored.allowanceInches=numberOfCuts*3;',`stored.allowanceInches=numberOfCuts*${a};`);
  html=html.replaceAll('allowanceInches:numberOfCuts*3',`allowanceInches:numberOfCuts*${a}`);
  html=html.replaceAll('plus 3″ for every piece','plus the configured cut allowance for every piece');
  html=html.replaceAll('plus 3″ cutting allowance','plus configured cutting allowance');
  html=html.replaceAll('× 3″ normally requires','× configured allowance normally requires');
  html=html.replaceAll('× 3″ (','× configured allowance (');
  html=html.replaceAll('× 3″ =','× configured allowance =');
  html=html.replaceAll('× 3″ allowance','× configured allowance');
  html=html.replaceAll('including 3″ cutting allowance','including configured cutting allowance');
  html=html.replaceAll('Each cut deducts an additional 3 inches.','Each cut uses the warehouse configured cut allowance.');
  // Final public-language scrub: the production core historically mentioned our own
  // three-inch practice in several labels and audit messages. Universal V1 must never
  // present that company practice as an industry rule.
  html=html.replaceAll('3″ allowance','configured allowance');
  html=html.replaceAll('3″','configured allowance');
  html=html.replaceAll('3 inches','configured allowance');
  html=html.replaceAll('3-inch','configured-allowance');
  return html;
}

function cleanMatureCore(html){html=neutralizeFunctions(html);html=configureCutAllowance(html);html=html.replace("const CLOUD_URL='https://ekrnknlawekeoszzkamd.supabase.co';","const CLOUD_URL='https://local-only.invalid';");html=html.replace(/const CLOUD_KEY='[^']*';/,"const CLOUD_KEY='';");const $=loadHtml(html,{decodeEntities:false});$('script[src="carpet_seed.js"]').remove();$('#headerCloudPill').remove();$('.settingRow').each((_,el)=>{const title=$(el).find('.name').first().text().trim();if(title==='Cloud Sync'||title==='Carpet Management Link')$(el).remove()});$('body').append('<script src="runlu-native.js"></script>');return $.html()}

let mature=await readFile(resolve(repoRoot,'universal-app.html'),'utf8');mature=cleanMatureCore(mature);await writeFile(resolve(out,'universal-app.html'),mature,'utf8');

function publicOnboarding(html){const $=loadHtml(html,{decodeEntities:false});$('.eyebrow').text('Universal Edition');$('header p').text('Create your company, local Owner account and first warehouse. Flooring-ready by default, fully configurable by the customer.');$('section.card').each((_,el)=>{if($(el).find('h2').first().text().trim()==='Commercial preview')$(el).remove()});const submit=$('button[type="submit"]');if(submit.length&&!$('a[href="backup.html"]').length)submit.after('<a class="btn" href="backup.html" style="margin-top:10px;background:#e9edf3;color:#182033">Restore an encrypted backup</a>');$('.footer').text('RUNLU Warehouse OS · Local-first · Customer-owned storage');return $.html()}
function publicSettings(html){const $=loadHtml(html,{decodeEntities:false});$('title').text('RUNLU Warehouse OS Settings');$('.topsub').text('Universal Edition · local-first · customer-owned storage');$('[data-feature="multiDeviceSync"]').closest('label').remove();$('button[type="submit"]').text('Save Settings');$('#saved').text('Settings saved to this workspace.');return $.html().replace("multiDeviceSync:'Multi-device Sync',",'')}
function publicPreview(html){const $=loadHtml(html,{decodeEntities:false});$('title').text('RUNLU Warehouse OS');$('.bar b').first().text('RUNLU Warehouse OS · Universal Edition');$('#settingsLink').attr('href','settings.html').text('Settings');$('#usersLink').attr('href','users.html');return $.html()}
for(const [name,transform] of [['onboarding.html',publicOnboarding],['settings.html',publicSettings],['preview.html',publicPreview]]){const p=resolve(universalOut,name);await writeFile(p,transform(await readFile(p,'utf8')),'utf8')}

await writeFile(resolve(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>RUNLU Warehouse OS</title></head><body><script src="universal/workspace.js"></script><script src="universal/local-auth.js"></script><script>(function(){if(!RUNLUWorkspace.isReady()){location.replace('universal/onboarding.html');return}if(!RUNLUWorkspace.ensureSession()||!RUNLULocalAuth.currentUser()){location.replace('universal/sign-in.html');return}location.replace('universal/preview.html')})()</script><a href="universal/sign-in.html">Open RUNLU Warehouse OS</a></body></html>`,'utf8');
console.log('RUNLU Warehouse OS App Store web bundle prepared:',out);
