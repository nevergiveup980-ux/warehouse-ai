import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadHtml } from 'cheerio';

const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(here,'../www');

// Load the native StoreKit bridge and subscription shell before the preview boot
// script creates the mature-core iframe. This ensures the iframe permission guard
// sees a subscription state from its first operational interaction.
{
  const path=resolve(out,'universal/preview.html');
  const html=await readFile(path,'utf8');
  const $=loadHtml(html,{decodeEntities:false});
  if($('script[src="../runlu-native.js"]').length||$('script[src="../runlu-subscription-shell.js"]').length)throw new Error('Subscription shell already wired unexpectedly.');
  const scripts=$('script');
  if(!scripts.length)throw new Error('Preview boot script missing; stopped before subscription wiring.');
  scripts.last().before('<script src="../runlu-native.js"></script><script src="../runlu-subscription-shell.js"></script>');
  const result=$.html();
  if(!result.includes('../runlu-native.js')||!result.includes('../runlu-subscription-shell.js'))throw new Error('Could not wire subscription scripts into preview shell.');
  await writeFile(path,result,'utf8');
}

// The mature core remains role-aware, but operational writes also require a
// verified StoreKit entitlement. The parent subscription object is in-memory and
// derives its state from the native StoreKit 2 plugin; no localStorage flag can
// grant paid access. If the parent gate is absent, operational permission fails
// closed instead of granting paid access accidentally.
{
  const path=resolve(out,'universal/permission-guard.js');
  let text=await readFile(path,'utf8');
  const wrapped='const wrapped=new Set();';
  if(!text.includes(wrapped))throw new Error('Permission guard wrapped-set marker changed.');
  text=text.replace(wrapped,`${wrapped}\nfunction subscriptionAccess(){try{return global.parent&&global.parent!==global?global.parent.RUNLU_SUBSCRIPTION_ACCESS:global.RUNLU_SUBSCRIPTION_ACCESS}catch(_){return null}}`);
  const denyStart='function deny(action){const labels=';
  if(!text.includes(denyStart))throw new Error('Permission guard deny function changed.');
  text=text.replace(denyStart,"function deny(action){const sub=subscriptionAccess();if(!sub||typeof sub.can!=='function'||!sub.can(action)){alert('Your Warehouse OS subscription is not active. Existing data remains available in read-only mode; restore or renew the subscription to make operational changes.');return false}const labels=");
  const canLine='function can(action){return W.can(action)}';
  if(!text.includes(canLine))throw new Error('Permission guard can function changed.');
  text=text.replace(canLine,"function can(action){const sub=subscriptionAccess();if(!sub||typeof sub.can!=='function'||!sub.can(action))return false;return W.can(action)}");
  if(!text.includes('RUNLU_SUBSCRIPTION_ACCESS')||!text.includes('read-only mode'))throw new Error('Subscription entitlement guard was not installed.');
  await writeFile(path,text,'utf8');
}

console.log('RUNLU subscription shell wired: StoreKit paywall in outer shell and fail-closed operational read-only guard in mature core.');
