import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(here,'../www');
const errors=[];

for(const name of ['runlu-native.js','runlu-subscription-shell.js','universal/preview.html','universal/permission-guard.js']){
  try{await access(resolve(out,name))}catch{errors.push(`Subscription distribution file missing: ${name}`)}
}

const preview=await readFile(resolve(out,'universal/preview.html'),'utf8');
const nativeIndex=preview.indexOf('../runlu-native.js');
const shellIndex=preview.indexOf('../runlu-subscription-shell.js');
const bootIndex=preview.indexOf("const frame=document.getElementById('app')");
if(nativeIndex<0||shellIndex<0)errors.push('Preview shell does not load both native and subscription scripts.');
if(bootIndex>=0&&(nativeIndex>bootIndex||shellIndex>bootIndex))errors.push('Subscription scripts must load before the preview creates the mature-core iframe.');

const permission=await readFile(resolve(out,'universal/permission-guard.js'),'utf8');
for(const needle of ['RUNLU_SUBSCRIPTION_ACCESS','subscriptionAccess()','read-only mode'])if(!permission.includes(needle))errors.push(`Operational subscription guard is missing: ${needle}`);
if(!permission.includes("if(!sub||typeof sub.can!=='function'||!sub.can(action))return false"))errors.push('Operational subscription guard is not fail-closed.');

const shell=await readFile(resolve(out,'runlu-subscription-shell.js'),'utf8');
for(const needle of ['displayPrice','introEligible','introPaymentMode','Restore Purchases','Continue Read-Only','Open Encrypted Backup','Manage Subscription','warehouse-privacy.html','stdeula','runlu-appstore-screenshot-marker'])if(!shell.includes(needle))errors.push(`Subscription shell is missing: ${needle}`);
for(const forbidden of ['14.99','29.99','299.99','RUNLU_SCREENSHOT_FIXTURE_V1'])if(shell.includes(forbidden))errors.push(`Subscription shell contains a forbidden hard-coded value or fixture marker: ${forbidden}`);
if(!shell.includes("BLOCKED_ACTIONS=new Set(['manageProducts','editInventory','manageOrders','receive','transfer','cutPick','ship','returnStock','count'])"))errors.push('Subscription shell does not define the expected operational read-only boundary.');

const native=await readFile(resolve(out,'runlu-native.js'),'utf8');
for(const needle of ['getProduct','getEntitlement','purchase','restore','manageSubscriptions','entitlementChanged','appStateChange'])if(!native.includes(needle))errors.push(`Native subscription bridge is missing: ${needle}`);

if(errors.length){
  console.error('\nRUNLU App Store subscription shell verification FAILED:\n');
  for(const error of [...new Set(errors)])console.error(' - '+error);
  process.exit(1);
}
console.log('RUNLU App Store subscription shell verification passed: StoreKit-localized paywall, restore/manage actions, and fail-closed read-only operational guard confirmed.');
