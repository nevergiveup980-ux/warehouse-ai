// RUNLU Warehouse OS Build098 · Flooring handoff after access gate.
// Re-applies the Flooring PO -> Warehouse Receiving handoff after the saved-session
// access gate returns the app to Home. No inventory is changed automatically.
(() => {
  const q=id=>document.getElementById(id);
  let done=false, tries=0;
  function handoff(){
    const p=new URLSearchParams(location.search);
    if((p.get('from')||'').toLowerCase()!=='flooring' || !p.get('po')) return null;
    return {
      po:p.get('po')||'', supplier:p.get('supplier')||'', pickup:p.get('pickup')||'',
      poStatus:p.get('poStatus')||'', pickupStatus:p.get('pickupStatus')||'',
      fulfillment:p.get('fulfillment')||'', purchaseType:p.get('purchaseType')||'',
      job:p.get('job')||'', customer:p.get('customer')||''
    };
  }
  function gateOpen(){const g=q('accessGate');return !!(g && !g.classList.contains('hidden') && getComputedStyle(g).display!=='none')}
  function statusFor(h){
    const f=(h.fulfillment||'').toLowerCase();
    const doneStatus=['completed','ready'].includes((h.pickupStatus||'').toLowerCase()) || ['completed','received'].includes((h.poStatus||'').toLowerCase());
    if(!doneStatus)return 'Waiting for Pickup';
    return f.includes('delivery')?'Received':'Picked Up';
  }
  function fill(h){
    try{window.newReceiving?.()}catch(_){try{window.showPage?.('receivingEditor')}catch(__){}}
    setTimeout(()=>{
      if(q('rcvDate')&&h.pickup)q('rcvDate').value=h.pickup;
      if(q('rcvStatus'))q('rcvStatus').value=statusFor(h);
      if(q('rcvSource'))q('rcvSource').value='Supplier';
      if(q('rcvSupplier'))q('rcvSupplier').value=h.supplier;
      if(q('rcvPo'))q('rcvPo').value=h.po;
      if(q('rcvOrder'))q('rcvOrder').value=h.job;
      if(q('rcvLocation')&&!q('rcvLocation').value)q('rcvLocation').value='Receiving';
      const note=['Imported from RUNLU Deerfoot Flooring OS.',h.customer?'Customer: '+h.customer:'',h.poStatus?'Flooring PO status: '+h.poStatus:'',h.pickupStatus?'Supplier Pickup status: '+h.pickupStatus:'',h.fulfillment?'Fulfillment: '+h.fulfillment:'',h.purchaseType?'Purchase type: '+h.purchaseType:''].filter(Boolean).join('\n');
      if(q('rcvNotes'))q('rcvNotes').value=note;
      if(!q('flooringPOHandoffBanner')){
        const card=q('receivingEditor')?.querySelector('.card');
        if(card){const b=document.createElement('div');b.id='flooringPOHandoffBanner';b.className='notice';b.style.cssText='margin:10px 0;border:1px solid #bfd7ff;background:#eef5ff';b.innerHTML='<b>Flooring OS handoff received</b><br>PO <b>#'+String(h.po).replace(/[&<>"']/g,'')+'</b>'+ (h.supplier?' · '+String(h.supplier).replace(/[&<>"']/g,''):'')+'<br><span style="font-size:12px">Review and save through the normal Warehouse receiving workflow. Inventory is not changed automatically.</span>';card.prepend(b)}
      }
      try{window.updateReceivingCheck?.()}catch(_){}
      window.scrollTo(0,0); done=true;
    },120);
  }
  function attempt(){
    const h=handoff();if(!h||done)return;
    tries++;
    if(gateOpen()||typeof window.newReceiving!=='function'||typeof window.showPage!=='function'){if(tries<120)setTimeout(attempt,250);return}
    fill(h);
  }
  function boot(){setTimeout(attempt,250);const enter=q('runluCoreEnterButton');if(enter)enter.addEventListener('click',()=>{done=false;tries=0;setTimeout(attempt,350)},true)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',()=>{done=false;tries=0;setTimeout(attempt,250)});
})();
