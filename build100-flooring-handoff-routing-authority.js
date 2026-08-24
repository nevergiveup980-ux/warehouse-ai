// RUNLU Warehouse OS Build100 · Flooring handoff routing authority.
// Resolves the race between the generic Flooring receiving bridge and Job-specific routing.
// Final authority: Job-specific / Non-stock / Special -> Special Order / Job Staging;
// Stock -> normal Receiving. No inventory is changed automatically.
(() => {
  const q=id=>document.getElementById(id);
  const clean=v=>String(v??'');
  const safe=v=>clean(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
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

  function inferredPurchaseType(h){
    if(h.purchaseType)return h.purchaseType;
    const notes=q('rcvNotes')?.value||'';
    const m=notes.match(/Purchase\s*type\s*:\s*([^\n\r]+)/i);
    return m?m[1].trim():'';
  }

  function isJobSpecific(h){
    const t=inferredPurchaseType(h).toLowerCase();
    return t.includes('job')||t.includes('non-stock')||t.includes('nonstock')||t.includes('special');
  }

  function gateOpen(){
    const g=q('accessGate');
    return !!(g&&!g.classList.contains('hidden')&&getComputedStyle(g).display!=='none');
  }

  function statusFor(h){
    const done=['completed','ready'].includes(clean(h.pickupStatus).toLowerCase())||['completed','received'].includes(clean(h.poStatus).toLowerCase());
    return done?'Received':'Waiting for Arrival';
  }

  function addBanner(h){
    const editor=q('specialOrderEditor');if(!editor)return;
    let b=q('flooringJobSpecificAuthorityBanner');
    if(!b){
      b=document.createElement('div');b.id='flooringJobSpecificAuthorityBanner';b.className='notice';
      b.style.cssText='margin:10px 0;border:1px solid #b8dfc7;background:#eef9f2';
      const card=editor.querySelector('.card');if(!card)return;
      const actions=card.querySelector('.actions');actions?actions.insertAdjacentElement('afterend',b):card.prepend(b);
    }
    b.innerHTML=`<b>Job-specific / Non-stock handoff</b><br>PO <b>#${safe(h.po)}</b>${h.supplier?' · '+safe(h.supplier):''}${h.pickup?' · '+safe(h.pickup):''}<br><span style="font-size:12px">Purchase Type routing: this material belongs to its Job / Customer and does <b>not</b> enter General Inventory. Confirm customer/job, product, quantity and staging location before saving.</span>`;
  }

  function routeJobSpecific(h){
    if(typeof window.newSpecialOrder!=='function'||typeof window.showPage!=='function')return false;
    try{window.newSpecialOrder()}catch(_){try{window.showPage('specialOrderEditor')}catch(__){return false}}
    setTimeout(()=>{
      if(q('spCustomer'))q('spCustomer').value=h.customer||'';
      if(q('spPo'))q('spPo').value=h.po;
      if(q('spSupplier'))q('spSupplier').value=h.supplier;
      if(q('spStatus'))q('spStatus').value=statusFor(h);
      if(q('spLocation'))q('spLocation').value='Job Staging';
      const pt=inferredPurchaseType(h)||'Job-specific';
      const notes=[
        'Imported from RUNLU Deerfoot Flooring OS.',
        'Purchase type: '+pt,
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
      routed=true;
    },100);
    return true;
  }

  function enforce(){
    const h=handoff();if(!h||gateOpen())return;
    if(!isJobSpecific(h))return;
    const active=document.querySelector('.page:not(.hidden)')?.id||'';
    if(routed&&active==='specialOrderEditor')return;
    routeJobSpecific(h);
  }

  function scheduleAuthority(){
    routed=false;
    [700,1100,1700,2600].forEach(ms=>setTimeout(enforce,ms));
  }

  function boot(){
    scheduleAuthority();
    const enter=q('runluCoreEnterButton');
    if(enter)enter.addEventListener('click',scheduleAuthority,true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',scheduleAuthority);
})();
