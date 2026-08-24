// RUNLU Warehouse OS Build099 · Flooring Purchase Type routing.
// Job-specific / non-stock Flooring POs go to Special Order staging instead of General Inventory Receiving.
// Stock purchases continue through the normal Receiving flow. This bridge never changes inventory automatically.
(() => {
  const q=id=>document.getElementById(id);
  const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let routed=false;

  function handoff(){
    const p=new URLSearchParams(location.search);
    if((p.get('from')||'').toLowerCase()!=='flooring'||!p.get('po'))return null;
    return {
      po:p.get('po')||'',supplier:p.get('supplier')||'',pickup:p.get('pickup')||'',
      poStatus:p.get('poStatus')||'',pickupStatus:p.get('pickupStatus')||'',
      fulfillment:p.get('fulfillment')||'',purchaseType:p.get('purchaseType')||'',
      job:p.get('job')||'',customer:p.get('customer')||''
    };
  }

  function isJobSpecific(h){
    const t=String(h?.purchaseType||'').toLowerCase();
    return t.includes('job')||t.includes('non-stock')||t.includes('nonstock')||t.includes('special');
  }

  function accessReady(){
    const gate=q('accessGate');
    if(!gate)return true;
    return gate.classList.contains('hidden')||getComputedStyle(gate).display==='none';
  }

  function statusFor(h){
    const done=['completed','ready'].includes(String(h.pickupStatus||'').toLowerCase())||['completed','received'].includes(String(h.poStatus||'').toLowerCase());
    return done?'Received':'Waiting for Arrival';
  }

  function addBanner(h){
    const editor=q('specialOrderEditor');if(!editor||q('flooringJobSpecificBanner'))return;
    const card=editor.querySelector('.card');if(!card)return;
    const b=document.createElement('div');b.id='flooringJobSpecificBanner';b.className='notice';
    b.style.margin='10px 0';b.style.border='1px solid #cce9d8';b.style.background='#eef9f2';
    b.innerHTML=`<b>Job-specific / Non-stock handoff</b><br>PO <b>#${safe(h.po)}</b>${h.supplier?' · '+safe(h.supplier):''}${h.pickup?' · '+safe(h.pickup):''}<br><span style="font-size:12px">This order is staged for its Job / Customer and does <b>not</b> add to General Inventory. Confirm the real customer/job, product, quantity and staging location before saving.</span>`;
    const actions=card.querySelector('.actions');actions?actions.insertAdjacentElement('afterend',b):card.prepend(b);
  }

  function route(){
    const h=handoff();
    if(!h||!isJobSpecific(h)||routed)return;
    if(!accessReady()){setTimeout(route,160);return}
    if(typeof window.newSpecialOrder!=='function'||typeof window.showPage!=='function'){setTimeout(route,160);return}
    routed=true;
    try{window.newSpecialOrder()}catch(_){try{window.showPage('specialOrderEditor')}catch(__){}}
    setTimeout(()=>{
      if(q('spCustomer'))q('spCustomer').value=h.customer||'';
      if(q('spPo'))q('spPo').value=h.po;
      if(q('spSupplier'))q('spSupplier').value=h.supplier;
      if(q('spStatus'))q('spStatus').value=statusFor(h);
      if(q('spLocation')&&!q('spLocation').value)q('spLocation').value='Job Staging';
      const notes=[
        'Imported from RUNLU Deerfoot Flooring OS.',
        'Purchase type: '+(h.purchaseType||'Job-specific'),
        h.job?'Job / Order: '+h.job:'',
        h.customer?'Customer: '+h.customer:'',
        h.pickup?'Supplier Pickup / Receiving Date: '+h.pickup:'',
        h.poStatus?'Flooring PO status: '+h.poStatus:'',
        h.pickupStatus?'Supplier Pickup status: '+h.pickupStatus:'',
        h.fulfillment?'Fulfillment: '+h.fulfillment:''
      ].filter(Boolean).join('\n');
      if(q('spNotes'))q('spNotes').value=notes;
      addBanner(h);
      try{window.scrollTo(0,0)}catch(_){}
    },100);
  }

  function boot(){setTimeout(route,260)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',()=>setTimeout(route,200));
})();
