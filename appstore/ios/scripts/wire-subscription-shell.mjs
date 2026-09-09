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
//
// Important UX rule: a subscription-locked command must remain tappable. A
// disabled button looks broken and cannot fire a click event, so read-only users
// now get the subscription sheet instead of a silent/dead control.
{
  const path=resolve(out,'universal/permission-guard.js');
  let text=await readFile(path,'utf8');
  const wrapped='const wrapped=new Set();';
  if(!text.includes(wrapped))throw new Error('Permission guard wrapped-set marker changed.');
  text=text.replace(wrapped,`${wrapped}\nlet subscriptionClickGuardInstalled=false;\nfunction subscriptionAccess(){try{return global.parent&&global.parent!==global?global.parent.RUNLU_SUBSCRIPTION_ACCESS:global.RUNLU_SUBSCRIPTION_ACCESS}catch(_){return null}}\nfunction subscriptionCan(action){const sub=subscriptionAccess();return !!(sub&&typeof sub.can==='function'&&sub.can(action))}`);

  const denyStart='function deny(action){const labels=';
  if(!text.includes(denyStart))throw new Error('Permission guard deny function changed.');
  text=text.replace(denyStart,"function deny(action){const sub=subscriptionAccess();if(!subscriptionCan(action)){if(sub&&typeof sub.showPaywall==='function'){sub.showPaywall();return false}alert('Your Warehouse OS subscription is not active. Existing data remains available in read-only mode; restore or renew the subscription to make operational changes.');return false}const labels=");

  const canLine='function can(action){return W.can(action)}';
  if(!text.includes(canLine))throw new Error('Permission guard can function changed.');
  text=text.replace(canLine,"function can(action){return subscriptionCan(action)&&W.can(action)}");

  const applyLine="function applyUI(){const role=W.role();document.documentElement.setAttribute('data-runlu-local-role',role);document.querySelectorAll('button,[role=\"button\"]').forEach(btn=>{let action=classifyButton(btn);if(role==='viewer'&&!action&&typeof global.accessMutationButtonIsWrite==='function'&&global.accessMutationButtonIsWrite(btn))action='editInventory';if(action&&!can(action)){btn.disabled=true;btn.setAttribute('aria-disabled','true');btn.title='Not available for '+(role==='member'?'Staff':role)+' role'}})}";
  if(!text.includes(applyLine))throw new Error('Permission guard applyUI function changed.');
  const applyReplacement="function applyUI(){const role=W.role();document.documentElement.setAttribute('data-runlu-local-role',role);document.querySelectorAll('button,[role=\"button\"]').forEach(btn=>{let action=classifyButton(btn);if(role==='viewer'&&!action&&typeof global.accessMutationButtonIsWrite==='function'&&global.accessMutationButtonIsWrite(btn))action='editInventory';if(!action)return;if(!W.can(action)){btn.disabled=true;btn.setAttribute('aria-disabled','true');btn.setAttribute('data-runlu-role-disabled','1');btn.removeAttribute('data-runlu-subscription-locked');btn.title='Not available for '+(role==='member'?'Staff':role)+' role';return}if(btn.getAttribute('data-runlu-role-disabled')==='1'){btn.disabled=false;btn.removeAttribute('aria-disabled');btn.removeAttribute('data-runlu-role-disabled')}if(!subscriptionCan(action)){btn.setAttribute('data-runlu-subscription-locked',action);btn.removeAttribute('aria-disabled');btn.title='Subscription required — tap to review access options.';return}btn.removeAttribute('data-runlu-subscription-locked');if(btn.title==='Subscription required — tap to review access options.')btn.removeAttribute('title')})}";
  text=text.replace(applyLine,applyReplacement);

  const bootLine="function boot(){install();observer.observe(document.documentElement,{subtree:true,childList:true});let tries=0;const timer=setInterval(()=>{install();if(++tries>40)clearInterval(timer)},250)}";
  if(!text.includes(bootLine))throw new Error('Permission guard boot function changed.');
  const clickGuard="function installSubscriptionClickGuard(){if(subscriptionClickGuardInstalled)return;document.addEventListener('click',event=>{const target=event.target&&event.target.closest?event.target.closest('[data-runlu-subscription-locked]'):null;if(!target)return;const action=target.getAttribute('data-runlu-subscription-locked');if(subscriptionCan(action)){target.removeAttribute('data-runlu-subscription-locked');return}event.preventDefault();event.stopImmediatePropagation();const sub=subscriptionAccess();if(sub&&typeof sub.showPaywall==='function')sub.showPaywall();else deny(action)},true);subscriptionClickGuardInstalled=true}\n";
  text=text.replace(bootLine,clickGuard+"function boot(){installSubscriptionClickGuard();install();observer.observe(document.documentElement,{subtree:true,childList:true});let tries=0;const timer=setInterval(()=>{install();if(++tries>40)clearInterval(timer)},250)}");

  if(!text.includes('RUNLU_SUBSCRIPTION_ACCESS')||!text.includes('data-runlu-subscription-locked')||!text.includes('showPaywall'))throw new Error('Subscription entitlement UX guard was not installed.');
  await writeFile(path,text,'utf8');
}

console.log('RUNLU subscription shell wired: StoreKit paywall in outer shell and tappable fail-closed operational read-only guard in mature core.');
