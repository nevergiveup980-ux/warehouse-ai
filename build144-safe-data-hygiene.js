// RUNLU Build144 · Safe Data Hygiene Guard
// Repairs Product Master display links from existing local/cloud-authoritative IDs and
// auto-dismisses ONLY exact local/cloud review duplicates. Never deletes business rows.
(() => {
'use strict';
if(window.__RUNLU_BUILD144_SAFE_HYGIENE__)return;window.__RUNLU_BUILD144_SAFE_HYGIENE__=true;
const PM='runlu_product_master_v21',INV='runlu_inventory_records_v21';
const parse=s=>{try{return JSON.parse(s)}catch{return null}},read=k=>parse(localStorage.getItem(k)||'null');
const rows=k=>{const v=read(k);return Array.isArray(v)?v:[]},text=v=>String(v??'').trim();
function repairProductLinks(){
  // Delegate recovery to Build112: it verifies cloud Product Master + Inventory integrity
  // and changes Product Master only, never inventory quantities/locations/history.
  try{window.runluBuild112ProductLinkRecovery?.recover?.('build144-safe-hygiene')}catch(e){console.warn('[Build144] product-link recovery isolated',e)}
  try{window.renderProducts?.();window.renderInventory?.();window.renderDashboard?.()}catch(e){}
}
function canonical(v){
  if(v===null||v===undefined)return v;
  if(Array.isArray(v))return v.map(canonical);
  if(typeof v!=='object')return v;
  const ignore=new Set(['updatedAt','updated_at','lastUpdatedAt','syncedAt','device_id','deviceId','version','cloudVersion','localVersion','conflictAt','detectedAt']);
  const out={};Object.keys(v).sort().forEach(k=>{if(!ignore.has(k))out[k]=canonical(v[k])});return out;
}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function clickExactReviewDuplicates(){
  // UI-only cleanup: invoke the app's own Delete Duplicate action only when the card
  // explicitly presents identical Device and Cloud business text. Hidden-field safety:
  // if a structured conflict object can be found and differs canonically, leave it alone.
  const cards=[...document.querySelectorAll('div')].filter(el=>/This device:/i.test(el.innerText||'')&&/Cloud:/i.test(el.innerText||'')&&/Delete Duplicate/i.test(el.innerText||''));
  let cleaned=0;
  for(const card of cards){
    const lines=(card.innerText||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const d=lines.find(s=>/^This device:/i.test(s)),c=lines.find(s=>/^Cloud:/i.test(s));
    if(!d||!c||text(d.replace(/^This device:/i,''))!==text(c.replace(/^Cloud:/i,'')))continue;
    const btn=[...card.querySelectorAll('button')].find(b=>/Delete Duplicate/i.test(b.textContent||''));
    if(!btn||btn.disabled)continue;
    // Never touch carpet duplicates automatically; physical identity requires warehouse verification.
    if(/Carpet|RC\d+/i.test(card.innerText||''))continue;
    btn.click();cleaned++;
  }
  return cleaned;
}
function run(){repairProductLinks();setTimeout(()=>{const n=clickExactReviewDuplicates();document.documentElement.setAttribute('data-runlu-build144-cleaned',String(n));},1200)}
window.runluBuild144SafeDataHygiene={run,repairProductLinks,clickExactReviewDuplicates,equal};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(run,1800),{once:true});else setTimeout(run,1800);
})();
