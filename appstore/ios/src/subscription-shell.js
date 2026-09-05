/* RUNLU Warehouse OS — App Store subscription shell. */
(function(global){
'use strict';

const SCREENSHOT_KEY='runlu-appstore-screenshot-marker';
const BLOCKED_ACTIONS=new Set(['manageProducts','editInventory','manageOrders','receive','transfer','cutPick','ship','returnStock','count']);
let state={mode:'checking',entitled:false,product:null,entitlement:null,message:''};
let overlay=null;
let dismissedReadOnly=false;
let entitlementListener=null;
let appStateListener=null;

function snapshot(){return Object.freeze({...state});}
function active(){return state.entitled===true||state.mode==='screenshot';}
function can(action){return active()||!BLOCKED_ACTIONS.has(String(action||''));}
function publish(){
  global.document?.documentElement?.setAttribute('data-runlu-subscription-state',state.mode);
  try{global.dispatchEvent(new CustomEvent('runlu-subscription-state',{detail:snapshot()}));}catch(_){ }
}

global.RUNLU_SUBSCRIPTION_ACCESS=Object.freeze({
  state:snapshot,
  active,
  can,
  refresh:()=>refresh(true),
  showPaywall:()=>{dismissedReadOnly=false;render(true);}
});

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function plural(value,unit){const n=Number(value||0);return `${n} ${unit}${n===1?'':'s'}`;}
function billingLabel(product){
  if(!product?.displayPrice)return 'Monthly subscription';
  const value=Number(product.periodValue||1),unit=String(product.periodUnit||'month');
  return value===1?`${product.displayPrice} / ${unit}`:`${product.displayPrice} every ${plural(value,unit)}`;
}
function trialLabel(product){
  const eligible=product?.introEligible===true&&product?.introAvailable===true&&product?.introPaymentMode==='freeTrial';
  if(!eligible)return '';
  const value=Number(product.introPeriodValue||0),unit=String(product.introPeriodUnit||'day');
  return value>0?`${plural(value,unit)} free, then ${billingLabel(product)}`:`Free trial, then ${billingLabel(product)}`;
}
function ctaLabel(product){return trialLabel(product)?`Start ${plural(Number(product.introPeriodValue||14),String(product.introPeriodUnit||'day')).replace(/s$/,'')} Free Trial`:'Subscribe';}

function ensureOverlay(){
  if(overlay||!global.document?.body)return overlay;
  const style=document.createElement('style');
  style.id='runluSubscriptionShellStyle';
  style.textContent=`
#runluSubscriptionOverlay{position:fixed;inset:0;z-index:9999;background:rgba(8,18,38,.58);display:none;align-items:flex-end;justify-content:center;padding:14px;padding-bottom:calc(14px + env(safe-area-inset-bottom))}
#runluSubscriptionOverlay.show{display:flex}
#runluSubscriptionCard{width:min(640px,100%);max-height:88vh;overflow:auto;background:#fff;color:#182033;border-radius:24px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.3)}
#runluSubscriptionCard .eyebrow{font-size:11px;font-weight:900;letter-spacing:.08em;color:#2563eb;text-transform:uppercase}
#runluSubscriptionCard h2{margin:8px 0 8px;font-size:28px;line-height:1.1}
#runluSubscriptionCard p{margin:8px 0;color:#5f6978;line-height:1.48;font-size:14px}
#runluSubscriptionCard .price{font-size:19px;font-weight:900;color:#182033;margin-top:14px}
#runluSubscriptionCard .benefits{display:grid;gap:7px;margin:16px 0;padding:0;list-style:none;color:#303a49;font-size:14px}
#runluSubscriptionCard .benefits li:before{content:'✓';font-weight:900;margin-right:8px;color:#17854b}
#runluSubscriptionCard .actions{display:grid;gap:9px;margin-top:16px}
#runluSubscriptionCard button,#runluSubscriptionCard a{font:inherit;border:0;border-radius:12px;padding:12px 14px;text-align:center;text-decoration:none;cursor:pointer}
#runluSubscriptionCard .primary{background:#2563eb;color:#fff;font-weight:850}
#runluSubscriptionCard .secondary{background:#eef2f7;color:#182033;font-weight:750}
#runluSubscriptionCard .linkrow{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px}
#runluSubscriptionCard .linkrow a{padding:5px 8px;background:transparent;color:#2563eb;font-size:12px}
#runluSubscriptionCard .status{font-size:12px;border-radius:10px;background:#f5f7fa;padding:9px 10px;margin-top:10px;color:#5f6978}
@media(min-width:700px){#runluSubscriptionOverlay{align-items:center}#runluSubscriptionCard{padding:26px}}
`;
  document.head.appendChild(style);
  overlay=document.createElement('div');
  overlay.id='runluSubscriptionOverlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','runluSubscriptionTitle');
  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay&&state.mode!=='checking'){} });
  return overlay;
}

function statusMessage(){
  if(state.mode==='checking')return 'Checking your App Store subscription…';
  if(state.mode==='unavailable')return state.message||'The App Store subscription is temporarily unavailable. Your warehouse data remains safe.';
  if(state.mode==='inactive')return 'Your warehouse data remains on this device. Subscribe to create or change operational records.';
  return '';
}

function render(force=false){
  const el=ensureOverlay();if(!el)return;
  if(active()||state.mode==='screenshot'){el.classList.remove('show');el.innerHTML='';return;}
  if(dismissedReadOnly&&!force){el.classList.remove('show');return;}
  const product=state.product||{};
  const trial=trialLabel(product),price=billingLabel(product);
  const purchasable=state.mode==='inactive'&&product.available===true&&product.canMakePayments!==false;
  const headline=state.mode==='checking'?'Preparing Warehouse OS…':'Run your flooring warehouse with confidence.';
  el.innerHTML=`<div id="runluSubscriptionCard">
    <div class="eyebrow">RUNLU Warehouse OS · Flooring Edition</div>
    <h2 id="runluSubscriptionTitle">${escapeHtml(headline)}</h2>
    <p>Inventory, carpet rolls, receiving, transfers, shipping, returns, scanning, local roles, and encrypted backups in one professional warehouse workspace.</p>
    ${state.mode==='checking'?'':`<div class="price">${escapeHtml(trial||price)}</div>`}
    <ul class="benefits"><li>No ads</li><li>Local-first warehouse data</li><li>Encrypted customer-owned backups</li><li>Continuing maintenance and workflow improvements</li></ul>
    <div class="status">${escapeHtml(statusMessage())}</div>
    <div class="actions">
      ${purchasable?`<button class="primary" id="runluSubscribeNow">${escapeHtml(ctaLabel(product))}</button>`:''}
      ${state.mode!=='checking'?'<button class="secondary" id="runluRestorePurchase">Restore Purchases</button>':''}
      ${state.mode!=='checking'?'<button class="secondary" id="runluContinueReadOnly">Continue Read-Only</button>':''}
      ${state.mode==='unavailable'?'<button class="secondary" id="runluRetrySubscription">Retry</button>':''}
      ${state.mode!=='checking'?'<a class="secondary" href="backup.html">Open Encrypted Backup</a>':''}
      ${state.mode!=='checking'?'<button class="secondary" id="runluManageSubscription">Manage Subscription</button>':''}
    </div>
    <div class="linkrow"><a href="https://runlu.ca/warehouse-privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a><a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noreferrer">Terms of Use</a></div>
  </div>`;
  el.classList.add('show');
  document.getElementById('runluSubscribeNow')?.addEventListener('click',purchase);
  document.getElementById('runluRestorePurchase')?.addEventListener('click',restore);
  document.getElementById('runluManageSubscription')?.addEventListener('click',manage);
  document.getElementById('runluRetrySubscription')?.addEventListener('click',()=>refresh(true));
  document.getElementById('runluContinueReadOnly')?.addEventListener('click',()=>{dismissedReadOnly=true;el.classList.remove('show');});
}

async function purchase(){
  const api=global.RUNLU_NATIVE?.subscription;if(!api)return;
  state={...state,mode:'checking',message:'Waiting for the App Store…'};publish();render(true);
  const result=await api.purchase();
  if(result?.entitled){state={...state,mode:'active',entitled:true,entitlement:result,message:''};publish();render();return;}
  await refresh(true);
}
async function restore(){
  const api=global.RUNLU_NATIVE?.subscription;if(!api)return;
  state={...state,mode:'checking',message:'Restoring purchases…'};publish();render(true);
  const result=await api.restore();
  if(result?.entitled){state={...state,mode:'active',entitled:true,entitlement:result,message:''};publish();render();return;}
  await refresh(true);
}
async function manage(){await global.RUNLU_NATIVE?.subscription?.manage?.();setTimeout(()=>refresh(false),500);}

async function refresh(force=false){
  if(localStorage.getItem(SCREENSHOT_KEY)){
    state={mode:'screenshot',entitled:true,product:null,entitlement:{state:'fixture'},message:''};publish();render();return snapshot();
  }
  const native=global.RUNLU_NATIVE;
  if(!native?.isNative||!native.subscription){
    state={mode:'unavailable',entitled:false,product:null,entitlement:null,message:'Subscription status is available inside the iOS app. Existing warehouse data remains safe.'};publish();render(force);return snapshot();
  }
  state={...state,mode:'checking',entitled:false,message:''};publish();render(force||!dismissedReadOnly);
  const [product,entitlement]=await Promise.all([native.subscription.product(),native.subscription.entitlement()]);
  if(entitlement?.entitled===true){
    state={mode:'active',entitled:true,product:product||state.product,entitlement,message:''};dismissedReadOnly=false;
  }else if(product?.available===true){
    state={mode:'inactive',entitled:false,product,entitlement:entitlement||null,message:''};
  }else{
    state={mode:'unavailable',entitled:false,product:product||null,entitlement:entitlement||null,message:'The App Store could not load the Warehouse OS subscription. Retry when the App Store is available.'};
  }
  publish();render(force);return snapshot();
}

async function boot(){
  ensureOverlay();
  if(localStorage.getItem(SCREENSHOT_KEY)){await refresh(false);return;}
  render(true);
  await refresh(true);
  entitlementListener=await global.RUNLU_NATIVE?.subscription?.onEntitlementChanged?.(payload=>{
    if(payload?.entitled){state={...state,mode:'active',entitled:true,entitlement:payload,message:''};dismissedReadOnly=false;publish();render();}
    else refresh(false);
  });
  appStateListener=await global.RUNLU_NATIVE?.onAppStateChange?.(info=>{if(info?.isActive)refresh(false);});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
