// RUNLU Warehouse OS Build097 · Flooring PO -> Warehouse Receiving handoff.
// Reads query parameters supplied by Deerfoot Flooring OS and opens a prefilled
// Warehouse receiving record. This bridge never changes inventory by itself.
(() => {
  const q=id=>document.getElementById(id);
  const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let applied=false;

  function params(){
    const p=new URLSearchParams(location.search);
    if((p.get('from')||'').toLowerCase()!=='flooring' || !p.get('po')) return null;
    return {
      po:p.get('po')||'', supplier:p.get('supplier')||'', pickup:p.get('pickup')||'',
      poStatus:p.get('poStatus')||'', pickupStatus:p.get('pickupStatus')||'',
      fulfillment:p.get('fulfillment')||'', purchaseType:p.get('purchaseType')||'',
      job:p.get('job')||'', customer:p.get('customer')||''
    };
  }

  function receivingStatus(h){
    const f=(h.fulfillment||'').toLowerCase();
    const done=['completed','ready'].includes((h.pickupStatus||'').toLowerCase()) || ['completed','received'].includes((h.poStatus||'').toLowerCase());
    if(!done) return 'Waiting for Pickup';
    return f.includes('delivery') ? 'Received' : 'Picked Up';
  }

  function ensureBanner(h){
    const editor=q('receivingEditor'); if(!editor || q('flooringPOHandoffBanner')) return;
    const card=editor.querySelector('.card'); if(!card) return;
    const banner=document.createElement('div');
    banner.id='flooringPOHandoffBanner'; banner.className='notice';
    banner.style.margin='10px 0'; banner.style.border='1px solid #bfd7ff'; banner.style.background='#eef5ff';
    banner.innerHTML=`<b>Flooring OS handoff received</b><br>PO <b>#${safe(h.po)}</b>${h.supplier?' · '+safe(h.supplier):''}${h.pickup?' · '+safe(h.pickup):''}<br><span style="font-size:12px">Review the receiving record below before saving. Inventory is not changed until Warehouse completes its normal receiving workflow.</span>`;
    const actions=card.querySelector('.actions'); actions ? actions.insertAdjacentElement('afterend',banner) : card.prepend(banner);
  }

  function apply(){
    const h=params(); if(!h || applied) return;
    if(typeof window.newReceiving!=='function' || typeof window.showPage!=='function') { setTimeout(apply,120); return; }
    applied=true;
    try{ window.newReceiving(); }catch(_){ try{ window.showPage('receivingEditor'); }catch(__){} }
    setTimeout(()=>{
      if(q('rcvDate') && h.pickup) q('rcvDate').value=h.pickup;
      if(q('rcvStatus')) q('rcvStatus').value=receivingStatus(h);
      if(q('rcvSource')) q('rcvSource').value='Supplier';
      if(q('rcvSupplier')) q('rcvSupplier').value=h.supplier;
      if(q('rcvPo')) q('rcvPo').value=h.po;
      if(q('rcvOrder')) q('rcvOrder').value=h.job;
      if(q('rcvLocation') && !q('rcvLocation').value) q('rcvLocation').value='Receiving';
      const note=[
        'Imported from RUNLU Deerfoot Flooring OS.',
        h.customer?'Customer: '+h.customer:'',
        h.poStatus?'Flooring PO status: '+h.poStatus:'',
        h.pickupStatus?'Supplier Pickup status: '+h.pickupStatus:'',
        h.fulfillment?'Fulfillment: '+h.fulfillment:'',
        h.purchaseType?'Purchase type: '+h.purchaseType:''
      ].filter(Boolean).join('\n');
      if(q('rcvNotes')) q('rcvNotes').value=note;
      ensureBanner(h);
      try{ window.updateReceivingCheck?.(); }catch(_){}
      try{ window.scrollTo(0,0); }catch(_){}
    },80);
  }

  function boot(){ setTimeout(apply,180); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  window.addEventListener('pageshow',()=>setTimeout(apply,120));
})();
