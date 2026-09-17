// RUNLU Build144 · Warehouse Entity Deduplicator (planner-first)
// Goal: one canonical row per proven duplicate entity. This build does NOT infer duplicates
// from product name alone and never auto-dedupes carpet rolls. It first repairs Product links,
// then identifies inventory duplicates using stable business identity.
(() => {
'use strict';
if(window.__RUNLU_BUILD144_ENTITY_DEDUP__)return;window.__RUNLU_BUILD144_ENTITY_DEDUP__=true;
const INV='runlu_inventory_records_v21';
const parse=s=>{try{return JSON.parse(s)}catch{return null}};
const arr=k=>{const v=parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]};
const t=v=>String(v??'').trim().toLowerCase();
const n=v=>Number(v??NaN);
function repairProductLinks(){
  try{window.runluBuild112ProductLinkRecovery?.recover?.('build144-entity-dedup')}catch(e){console.warn('[Build144] product recovery isolated',e)}
  try{window.renderProducts?.();window.renderInventory?.();window.renderDashboard?.()}catch(e){}
}
function inventoryKey(r){
  if(!r||typeof r!=='object')return '';
  const master=t(r.masterId),po=t(r.po||r.poNumber),loc=t(r.location),unit=t(r.unit),qty=n(r.quantity);
  if(!master||!loc||!unit||!Number.isFinite(qty))return '';
  return [master,po,loc,unit,String(qty)].join('|');
}
function isProtected(r){return /\brc\d+\b/i.test(JSON.stringify(r||{}))||t(r.category)==='carpet'}
function score(r){let s=0;if(r.id)s+=4;if(r.masterId)s+=4;if(r.po||r.poNumber)s+=3;if(r.location)s+=3;if(r.quantity!==undefined)s+=2;if(r.unit)s+=2;if(r.createdAt||r.created)s+=1;if(r.updatedAt||r.updated)s+=1;return s}
function planInventory(){
  const groups=new Map();
  for(const r of arr(INV)){if(isProtected(r))continue;const k=inventoryKey(r);if(!k)continue;(groups.get(k)||groups.set(k,[]).get(k)).push(r)}
  const duplicates=[];
  for(const [key,items] of groups){if(items.length<2)continue;const ranked=[...items].sort((a,b)=>score(b)-score(a));duplicates.push({key,keep:ranked[0],remove:ranked.slice(1)})}
  return duplicates;
}
function snapshot(){const inventory=arr(INV);return {at:new Date().toISOString(),inventoryCount:inventory.length,groups:planInventory().map(g=>({key:g.key,keepId:g.keep.id||g.keep.recordId||'',removeIds:g.remove.map(r=>r.id||r.recordId||'')}))}}
function run(){repairProductLinks();const p=snapshot();try{localStorage.setItem('runlu_build144_dedupe_plan',JSON.stringify(p))}catch(e){}document.documentElement?.setAttribute('data-runlu-build144-duplicate-groups',String(p.groups.length));return p}
window.RUNLUEntityDeduplicatorBuild144={inventoryKey,isProtected,score,planInventory,snapshot,run};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(run,1800),{once:true});else setTimeout(run,1800);
})();
