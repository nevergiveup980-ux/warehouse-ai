// RUNLU Warehouse OS Build115 · shared Warehouse Work Orchestration.
// Phase 1: Supplier Pickup plans come from Flooring PO once, execute here, and write only cloud task status.
// No inventory mutation occurs in this layer.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD115_WAREHOUSE_WORK__) return;
  window.__RUNLU_BUILD115_WAREHOUSE_WORK__ = true;

  const ENV='training';
  const q=id=>document.getElementById(id);
  const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const uiStatus=s=>s==='Scheduled'?'Waiting':String(s||'Waiting');
  const open=t=>!['Completed','Cancelled'].includes(uiStatus(t?.status));
  let rows=[],busy=false,lastSync='';

  async function session(){return typeof cloudEnsureSession==='function'?cloudEnsureSession():null}
  async function api(path,options={}){
    const s=await session();
    if(!s)throw new Error('Warehouse Cloud sign-in is required. Open Settings → Cloud Sync and sign in first.');
    return cloudRequest(path,{...options,headers:options.headers||cloudHeaders(s.access_token,options.json!==false)});
  }
  function style(){
    if(q('runluBuild115WorkStyle'))return;
    const s=document.createElement('style');s.id='runluBuild115WorkStyle';s.textContent=`
      #warehouseWork115{margin-top:12px}.ww115Head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.ww115State{font-size:10px;font-weight:850;padding:5px 8px;border-radius:999px;background:#e9f8ef;color:#176b40}.ww115State.warn{background:#fff1dd;color:#8a5900}.ww115List{display:grid;gap:9px;margin-top:10px}.ww115Task{border:1px solid var(--line);border-radius:14px;background:#fff;padding:12px}.ww115Top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ww115Title{font-size:16px;font-weight:900}.ww115Meta{font-size:12px;color:var(--muted);line-height:1.45;margin-top:4px}.ww115Items{margin-top:8px;padding:8px 9px;background:#f7f9fc;border-radius:10px;font-size:12px;line-height:1.45}.ww115Actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.ww115Actions button{padding:8px 10px;font-size:12px}.ww115Badge{font-size:10px;font-weight:850;padding:5px 8px;border-radius:999px;background:#fff1dd;color:#8a5900;white-space:nowrap}.ww115Badge.progress{background:#eaf0ff;color:#244da0}.ww115Badge.done{background:#e9f8ef;color:#176b40}.ww115Empty{padding:18px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:12px}
    `;document.head.appendChild(s);
  }
  function ensure(){
    style();
    const page=q('operations');if(!page||q('warehouseWork115'))return;
    const first=page.querySelector('.card');if(!first)return;
    const card=document.createElement('div');card.id='warehouseWork115';card.className='card';
    card.innerHTML=`<div class="ww115Head"><div><h2 style="margin:0">Today’s Warehouse Work</h2><div class="meta">Flooring PO creates the plan once. Execute here; status returns to Flooring Pickup and Warehouse Activity automatically.</div></div><div style="display:flex;gap:7px;align-items:center"><span id="ww115State" class="ww115State warn">CONNECTING</span><button type="button" id="ww115Refresh">Refresh</button></div></div><div id="ww115List" class="ww115List"><div class="ww115Empty">Loading shared work plan…</div></div>`;
    first.insertAdjacentElement('afterend',card);
    q('ww115Refresh')?.addEventListener('click',()=>refresh(true));
  }
  function itemText(t){
    const a=Array.isArray(t.items)?t.items:[];
    if(!a.length)return 'No item lines recorded';
    const shown=a.slice(0,4).map(x=>[x.qty,x.unit,x.style||x.product,x.colour||x.color,x.sku].filter(Boolean).join(' · '));
    if(a.length>4)shown.push(`+${a.length-4} more`);return shown.join('<br>');
  }
  function badgeClass(s){s=uiStatus(s);return ['Completed','Picked Up','Ready'].includes(s)?'done':(['In Progress','Partial'].includes(s)?'progress':'')}
  function actions(t){
    const s=uiStatus(t.status),id=safe(t.id);if(['Completed','Cancelled'].includes(s))return '';
    const a=[];
    if(s==='Waiting'||s==='Delayed')a.push(`<button class="primary" onclick="warehouseWork115Status('${id}','In Progress')">Start</button>`);
    if(['In Progress','Partial'].includes(s))a.push(`<button onclick="warehouseWork115Status('${id}','Partial')">Partial</button>`);
    if(['In Progress','Partial'].includes(s))a.push(`<button class="green" onclick="warehouseWork115Status('${id}','Picked Up')">Pickup Complete</button>`);
    if(['Picked Up','Ready'].includes(s))a.push(`<button class="green" onclick="warehouseWork115Status('${id}','Completed')">Complete Task</button>`);
    if(!['Picked Up','Ready'].includes(s))a.push(`<button class="orange" onclick="warehouseWork115Delay('${id}')">Delayed</button>`);
    return a.join('');
  }
  function render(){
    ensure();const list=q('ww115List');if(!list)return;
    const view=rows.filter(open).sort((a,b)=>String(a.requested_date||'9999').localeCompare(String(b.requested_date||'9999'))||Number(a.po_number||0)-Number(b.po_number||0));
    list.innerHTML=view.length?view.map(t=>`<div class="ww115Task" data-work-id="${safe(t.id)}"><div class="ww115Top"><div><div class="ww115Title">${safe(t.fulfillment_method||'Supplier Pickup')} · PO #${safe(t.po_number)}</div><div class="ww115Meta">${safe(t.supplier||'Supplier')} · ${safe(t.requested_date||'Date not set')}${t.job_number?' · Job '+safe(t.job_number):''}${t.customer_name?' · '+safe(t.customer_name):''}</div></div><span class="ww115Badge ${badgeClass(t.status)}">${safe(uiStatus(t.status))}</span></div><div class="ww115Items">${itemText(t)}</div><div class="ww115Actions">${actions(t)}</div></div>`).join(''):'<div class="ww115Empty">No open Supplier Pickup work is waiting for Warehouse.</div>';
    const st=q('ww115State');if(st){st.textContent=`LIVE · ${view.length} OPEN${lastSync?' · '+lastSync:''}`;st.classList.remove('warn')}
  }
  async function refresh(showAlert=false){
    if(busy)return;busy=true;ensure();const st=q('ww115State');if(st){st.textContent='REFRESHING…';st.classList.add('warn')}
    try{
      const data=await api('/rest/v1/flooring_supplier_tasks?select=*&environment=eq.'+ENV+'&order=requested_date.asc,created_at.asc',{json:false});
      rows=Array.isArray(data)?data:[];lastSync=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});render();
      if(showAlert)alert('Warehouse work plan refreshed.');
    }catch(e){console.warn('[Build115] refresh:',e?.message||e);if(st){st.textContent='SIGN IN / NETWORK';st.classList.add('warn')}if(showAlert)alert('Warehouse work refresh failed: '+e.message)
    }finally{busy=false}
  }
  async function setStatus(id,status,delayReason=''){
    const t=rows.find(x=>String(x.id)===String(id));if(!t)return;
    try{
      await api('/rest/v1/rpc/flooring_update_supplier_task',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:id,p_status:status,p_delay_reason:delayReason||null,p_warehouse_notes:`[Warehouse OS] ${uiStatus(t.status)} → ${status}. Operator executed shared work plan.`,p_received_items:Array.isArray(t.received_items)?t.received_items:[]})});
      await refresh(false);
      try{window.refreshFlooringSupplierTasks?.(false)}catch(_){}
    }catch(e){alert('Work status could not be updated: '+e.message)}
  }
  window.warehouseWork115Status=async function(id,status){
    const t=rows.find(x=>String(x.id)===String(id));if(!t)return;
    if(status==='Completed'&&!confirm(`Complete Warehouse task for PO #${t.po_number}? This closes the work task but does not post inventory here.`))return;
    await setStatus(id,status);
  };
  window.warehouseWork115Delay=async function(id){
    const reason=prompt('Delay reason:','Supplier / material not ready');if(reason===null)return;if(!reason.trim()){alert('Enter a delay reason.');return}await setStatus(id,'Delayed',reason.trim());
  };
  function boot(){
    ensure();
    const mo=new MutationObserver(()=>ensure());mo.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(b&&(b.getAttribute('onclick')||'').includes("showPage('operations')"))setTimeout(()=>refresh(false),120)},true);
    window.addEventListener('focus',()=>refresh(false));window.addEventListener('pageshow',()=>refresh(false));
    setInterval(()=>{if(document.visibilityState==='visible'&&!q('operations')?.classList?.contains('hidden'))refresh(false)},15000);
    [500,1400,2800].forEach(ms=>setTimeout(()=>refresh(false),ms));
  }
  window.RUNLUWarehouseWorkBuild115={refresh,setStatus,version:'115'};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
