// RUNLU Warehouse OS Build102 · Flooring PO item-line handoff.
// Extends the existing header-level Flooring bridge for Stock Inventory POs.
// Prefills one receiving line at a time; inventory is never posted automatically.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD102_FLOORING_ITEMS__) return;
  window.__RUNLU_BUILD102_FLOORING_ITEMS__=true;

  const q=id=>document.getElementById(id);
  const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let currentIndex=-1;
  let handoffCache=null;

  function parseItems(raw){
    try{
      const x=JSON.parse(raw||'[]');
      return Array.isArray(x)?x.filter(Boolean):[];
    }catch(_){return []}
  }

  function handoff(){
    if(handoffCache) return handoffCache;
    const p=new URLSearchParams(location.search);
    if((p.get('from')||'').toLowerCase()!=='flooring'||!p.get('po')) return null;
    handoffCache={
      po:p.get('po')||'',
      supplier:p.get('supplier')||'',
      purchaseType:p.get('purchaseType')||'',
      items:parseItems(p.get('items'))
    };
    return handoffCache;
  }

  function isJobSpecific(h){
    const t=String(h?.purchaseType||'').toLowerCase();
    return t.includes('job')||t.includes('non-stock')||t.includes('nonstock')||t.includes('special');
  }

  function normalizeUnit(v){
    const k=String(v||'').trim().toLowerCase();
    const map={carton:'Carton',box:'Box',pail:'Pail',bucket:'Bucket',tube:'Tube',roll:'Roll',piece:'Piece',ea:'Piece',each:'Piece',pallet:'Pallet'};
    return map[k]||'Box';
  }

  function itemLabel(x){
    return [x?.style||x?.sku||'Unnamed item',x?.colour||'',x?.sku?('SKU '+x.sku):''].filter(Boolean).join(' · ');
  }

  function receivingReady(){
    return !!(q('receivingEditor')&&q('rcvProduct')&&q('rcvQty')&&q('rcvUnit'));
  }

  function ensureBanner(h){
    if(!receivingReady()||!h.items.length) return;
    let b=q('flooringPOItemBanner');
    if(!b){
      b=document.createElement('div');
      b.id='flooringPOItemBanner';
      b.className='notice';
      b.style.cssText='margin:10px 0;border:1px solid #9fd2b1;background:#eef9f2';
      const anchor=q('flooringPOHandoffBanner');
      const card=q('receivingEditor')?.querySelector('.card');
      if(anchor) anchor.insertAdjacentElement('afterend',b);
      else if(card){const actions=card.querySelector('.actions');actions?actions.insertAdjacentElement('afterend',b):card.prepend(b)}
      else return;
    }
    const buttons=h.items.length>1?h.items.map((x,i)=>`<button type="button" data-flooring-po-line="${i}" style="margin:6px 6px 0 0">Load line ${i+1}</button>`).join(''):'';
    b.innerHTML=`<b>Flooring PO item lines received</b><br>PO <b>#${safe(h.po)}</b> · ${h.items.length} line${h.items.length===1?'':'s'}<br>${h.items.map((x,i)=>`${i+1}. ${safe(x.qty||'')} ${safe(normalizeUnit(x.unit))} · ${safe(itemLabel(x))}`).join('<br>')}<br><span style="font-size:12px">Review the Product Master match, quantity, unit and put-away location before saving. Stock is not changed until Warehouse saves a Received / Put Away / Completed receiving record.</span>${buttons}`;
  }

  function appendItemNote(item,index){
    const box=q('rcvNotes');if(!box)return;
    const line=`Flooring PO line ${index+1}: ${item.qty||''} ${normalizeUnit(item.unit)} · ${item.style||''}${item.colour?' · '+item.colour:''}${item.sku?' · SKU '+item.sku:''}`;
    const existing=String(box.value||'').split(/\r?\n/).filter(x=>!x.startsWith('Flooring PO line '));
    existing.push(line);
    box.value=existing.filter(Boolean).join('\n');
  }

  function applyItem(index){
    const h=handoff();
    if(!h||isJobSpecific(h)||!h.items.length||!receivingReady()) return false;
    const item=h.items[index]||h.items[0];
    currentIndex=Math.max(0,Math.min(index,h.items.length-1));
    const qty=Math.max(0,Number(item.qty??item.quantity??0)||0);

    // Prefer SKU for exact Product Master matching; otherwise use the product/style name.
    const productValue=String(item.sku||item.style||'').trim();
    if(q('rcvProduct')){
      q('rcvProduct').value=productValue;
      q('rcvProduct').dataset.masterId='';
    }
    if(q('rcvSupplier')&&!q('rcvSupplier').value)q('rcvSupplier').value=item.supplier||h.supplier||'';
    if(q('rcvPallets'))q('rcvPallets').value=0;
    if(q('rcvPerPallet'))q('rcvPerPallet').value=0;
    if(q('rcvLoose'))q('rcvLoose').value=qty;
    if(q('rcvQty'))q('rcvQty').value=qty;
    if(q('rcvUnit'))q('rcvUnit').value=normalizeUnit(item.unit);
    if(q('rcvLocation')&&!q('rcvLocation').value)q('rcvLocation').value='Receiving';
    appendItemNote(item,currentIndex);
    ensureBanner(h);
    try{window.updateReceivingCheck?.()}catch(_){}
    return true;
  }

  function applyWhenReady(){
    const h=handoff();
    if(!h||isJobSpecific(h)||!h.items.length||currentIndex>=0)return;
    if(!receivingReady()){setTimeout(applyWhenReady,180);return}
    applyItem(0);
  }

  function boot(){
    [450,850,1350,2200].forEach(ms=>setTimeout(applyWhenReady,ms));
    document.addEventListener('click',ev=>{
      const b=ev.target?.closest?.('[data-flooring-po-line]');
      if(!b)return;
      ev.preventDefault();
      applyItem(Number(b.dataset.flooringPoLine)||0);
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',()=>setTimeout(applyWhenReady,500));
  window.runluLoadFlooringPOItem=applyItem;
})();
