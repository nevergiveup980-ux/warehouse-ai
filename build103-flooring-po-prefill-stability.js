// RUNLU Warehouse OS Build103 · Flooring PO stock receiving prefill stability.
// Re-applies the PO item after the older header/access handoff finishes resetting the receiving form.
// Never posts inventory automatically and stops touching fields after the user edits receiving details.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD103_FLOORING_PREFILL__) return;
  window.__RUNLU_BUILD103_FLOORING_PREFILL__=true;

  const q=id=>document.getElementById(id);
  const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
  let userDirty=false;

  function parseItems(raw){
    try{const x=JSON.parse(raw||'[]');return Array.isArray(x)?x.filter(Boolean):[]}catch(_){return []}
  }
  function handoff(){
    const p=new URLSearchParams(location.search);
    if((p.get('from')||'').toLowerCase()!=='flooring'||!p.get('po'))return null;
    return {po:p.get('po')||'',supplier:p.get('supplier')||'',purchaseType:p.get('purchaseType')||'',items:parseItems(p.get('items'))};
  }
  function isJobSpecific(h){
    const t=norm(h?.purchaseType);
    return t.includes('job')||t.includes('non-stock')||t.includes('nonstock')||t.includes('special');
  }
  function normalizeUnit(v){
    const k=norm(v);const map={carton:'Carton',box:'Box',pail:'Pail',bucket:'Bucket',tube:'Tube',roll:'Roll',piece:'Piece',ea:'Piece',each:'Piece',pallet:'Pallet'};
    return map[k]||'Box';
  }
  function exactMaster(item){
    if(typeof loadMasters!=='function')return null;
    const rows=loadMasters()||[];
    const sku=norm(item?.sku),style=norm(item?.style),colour=norm(item?.colour);
    let matches=[];
    if(sku)matches=rows.filter(m=>norm(m.sku)===sku);
    if(matches.length!==1&&style){
      matches=rows.filter(m=>norm(m.name)===style&&(!colour||norm(m.color)===colour));
    }
    return matches.length===1?matches[0]:null;
  }
  function displayMaster(m,item){
    try{if(m&&typeof productDisplayLabel==='function')return productDisplayLabel(m)}catch(_){}
    return String(item?.sku||item?.style||'').trim();
  }
  function ready(){return !!(q('receivingEditor')&&q('rcvProduct')&&q('rcvPallets')&&q('rcvPerPallet')&&q('rcvLoose')&&q('rcvQty')&&q('rcvUnit'))}
  function apply(){
    if(userDirty)return false;
    const h=handoff();if(!h||isJobSpecific(h)||!h.items.length||!ready())return false;
    const item=h.items[0],qty=Math.max(0,Number(item.qty??item.quantity??0)||0),m=exactMaster(item);
    const product=q('rcvProduct');
    product.value=displayMaster(m,item);
    product.dataset.masterId=m?String(m.id):'';
    if(q('rcvSupplier')&&!q('rcvSupplier').value)q('rcvSupplier').value=item.supplier||h.supplier||'';
    q('rcvPallets').value=0;
    q('rcvPerPallet').value=0;
    q('rcvLoose').value=qty;
    q('rcvQty').value=qty;
    q('rcvUnit').value=normalizeUnit(item.unit);
    if(q('rcvLocation')&&!q('rcvLocation').value)q('rcvLocation').value='Receiving';
    try{window.calcReceivingQty?.()}catch(_){}
    try{window.updateReceivingCheck?.()}catch(_){}
    const b=q('flooringPOItemBanner');
    if(b){
      const state=m?'Product Master matched automatically.':'Product Master match needs review before saving.';
      let s=q('flooringPOPrefillStatus');
      if(!s){s=document.createElement('div');s.id='flooringPOPrefillStatus';s.style.cssText='margin-top:6px;font-size:12px;font-weight:700';b.appendChild(s)}
      s.textContent=`Build103 prefill stable · ${state}`;
    }
    return true;
  }
  function schedule(){
    userDirty=false;
    [700,1100,1700,2500,3600,5200].forEach(ms=>setTimeout(apply,ms));
  }
  function boot(){
    const ids=new Set(['rcvProduct','rcvPallets','rcvPerPallet','rcvLoose','rcvQty','rcvUnit','rcvLocation']);
    document.addEventListener('input',ev=>{if(ids.has(ev.target?.id))userDirty=true},true);
    document.addEventListener('change',ev=>{if(ids.has(ev.target?.id))userDirty=true},true);
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',schedule);
})();
