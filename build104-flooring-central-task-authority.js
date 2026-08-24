// RUNLU Warehouse OS Build104 · Flooring central supplier-task authority.
// Any authenticated Flooring→Warehouse PO handoff guarantees one shared Supplier Pickup task in Supabase.
// The upsert is metadata-only: it never resets Warehouse progress/status and never posts inventory.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD104_FLOORING_CENTRAL_TASK__) return;
  window.__RUNLU_BUILD104_FLOORING_CENTRAL_TASK__ = true;

  const q=id=>document.getElementById(id);
  let syncing=false, synced=false, retryCount=0;

  function parseItems(raw){
    try{const x=JSON.parse(raw||'[]');return Array.isArray(x)?x.filter(Boolean):[]}catch(_){return []}
  }
  function handoff(){
    const p=new URLSearchParams(location.search);
    if((p.get('from')||'').toLowerCase()!=='flooring'||!p.get('po'))return null;
    return {
      po:p.get('po')||'',
      supplier:p.get('supplier')||'',
      pickup:p.get('pickup')||'',
      fulfillment:p.get('fulfillment')||'Pickup',
      purchaseType:p.get('purchaseType')||'Job-specific',
      job:p.get('job')||'',
      customer:p.get('customer')||'',
      items:parseItems(p.get('items'))
    };
  }
  function purchaseType(v){return String(v||'').toLowerCase().includes('stock')?'Stock':'Job-specific'}
  function fulfillment(v){return String(v||'').toLowerCase().includes('delivery')?'Supplier Delivery':'Pickup'}
  function compactItems(h){
    return h.items.map(x=>({
      style:x?.style||x?.product||'',
      colour:x?.colour||x?.color||'',
      sku:x?.sku||'',
      qty:x?.qty??x?.quantity??'',
      unit:String(x?.unit||'').toLowerCase(),
      supplier:x?.supplier||h.supplier||'',
      size:x?.size||''
    })).filter(x=>x.style||x.sku||x.qty);
  }
  function setStatus(text,ok=false){
    let el=q('flooringCentralTaskStatus');
    const anchor=q('flooringPOItemBanner')||q('flooringPOHandoffBanner');
    if(!anchor)return;
    if(!el){el=document.createElement('div');el.id='flooringCentralTaskStatus';el.style.cssText='margin-top:7px;font-size:12px;font-weight:750';anchor.appendChild(el)}
    el.style.color=ok?'#176b40':'#8b5a00';
    el.textContent=text;
  }
  async function ensureCentralTask(){
    if(synced||syncing)return;
    const h=handoff();if(!h)return;
    if(typeof cloudEnsureSession!=='function'||typeof cloudRequest!=='function'||typeof cloudHeaders!=='function'){
      if(retryCount++<8)setTimeout(ensureCentralTask,500);
      return;
    }
    syncing=true;
    try{
      const s=await cloudEnsureSession();
      if(!s){setStatus('Central Supplier Task pending · Warehouse cloud sign-in required.');return}
      const poNum=Number(String(h.po).replace(/\D/g,''));
      if(!Number.isFinite(poNum)||poNum<=0)throw new Error('Invalid Flooring PO number.');
      const args={
        p_environment:'training',
        p_po_id:null,
        p_po_number:poNum,
        p_job_id:'',
        p_job_number:h.job||'',
        p_customer_name:h.customer||'',
        p_supplier:h.supplier||'Supplier',
        p_sales_rep:'',
        p_fulfillment_method:fulfillment(h.fulfillment),
        p_requested_date:h.pickup||null,
        p_purchase_type:purchaseType(h.purchaseType),
        p_items:compactItems(h)
      };
      await cloudRequest('/rest/v1/rpc/flooring_create_supplier_task',{
        method:'POST',
        headers:cloudHeaders(s.access_token,true),
        body:JSON.stringify(args)
      });
      synced=true;
      setStatus(`Central Supplier Task synced ✓ · PO #${h.po}`,true);
      try{localStorage.setItem('runlu_flooring_central_task_last_v104',JSON.stringify({po:h.po,at:new Date().toISOString()}))}catch(_){}
      try{window.refreshFlooringSupplierTasks?.()}catch(_){}
    }catch(e){
      console.warn('[Build104] central supplier-task sync:',e?.message||e);
      setStatus('Central Supplier Task sync pending · receiving remains safe.');
      if(retryCount++<3)setTimeout(ensureCentralTask,1200);
    }finally{syncing=false}
  }
  function boot(){[350,900,1800,3200].forEach(ms=>setTimeout(ensureCentralTask,ms))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',()=>setTimeout(ensureCentralTask,500));
  window.runluEnsureFlooringCentralTask=ensureCentralTask;
})();
