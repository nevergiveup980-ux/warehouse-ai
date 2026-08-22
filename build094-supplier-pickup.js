// RUNLU Warehouse OS Build094 · Flooring Supplier Pickup / Receiving execution bridge.
// Reads and updates the same Supabase training task rows created by Deerfoot Flooring OS.
// Existing Warehouse inventory datasets are not modified by this bridge.
(() => {
  const ENV='training';
  let supplierTasks=[];

  const q=id=>document.getElementById(id);
  const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dateLabel=d=>{if(!d)return 'No requested date';const x=new Date(d+'T12:00:00');return Number.isNaN(x.getTime())?d:x.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'})};
  const monthLabel=d=>{if(!d)return 'No Date';const x=new Date(d+'T12:00:00');return Number.isNaN(x.getTime())?'No Date':x.toLocaleDateString('en-CA',{month:'long',year:'numeric'})};

  function injectHomeModule(){
    const home=q('home');if(!home||q('flooringSupplierPickupModule'))return;
    const grid=home.querySelector('.grid2');if(!grid)return;
    const b=document.createElement('button');b.id='flooringSupplierPickupModule';b.className='module tasks';b.onclick=()=>{showPage('supplierPickupExec');refreshFlooringSupplierTasks()};
    b.innerHTML='<span class="icon">🚚</span><strong>Supplier Pickup</strong><small>Flooring PO pickup / receiving tasks, Warehouse execution and Sales feedback.</small>';
    grid.appendChild(b);
  }

  function injectPage(){
    if(q('supplierPickupExec'))return;
    const main=document.querySelector('main');if(!main)return;
    const page=document.createElement('section');page.id='supplierPickupExec';page.className='page hidden';
    page.innerHTML=`
      <button class="back" onclick="showPage('home')">← Back</button>
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div><h2>Supplier Pickup / Receiving</h2><div class="meta">Shared from Deerfoot Flooring OS · Central Training pilot</div></div><button class="primary" onclick="refreshFlooringSupplierTasks(true)">Refresh</button></div>
        <div class="notice" style="margin-top:10px"><b>One shared record:</b> Sales issues the PO and requested date → Warehouse executes Pickup / Receiving → Ready or Delayed status flows back to Flooring OS → Accounting sees the received quantities from the same record.</div>
        <div class="summaryStrip" style="margin-top:10px"><div><small>Scheduled</small><b id="fspScheduled">0</b></div><div><small>In Progress</small><b id="fspProgress">0</b></div><div><small>Delayed</small><b id="fspDelayed">0</b></div></div>
      </div>
      <div class="card"><div class="formgrid"><div><label>Status</label><select id="fspFilter" onchange="renderFlooringSupplierTasks()"><option value="">All</option><option>Scheduled</option><option>In Progress</option><option>Picked Up</option><option>Ready</option><option>Delayed</option><option>Completed</option><option>Cancelled</option></select></div><div><label>Search</label><input id="fspSearch" placeholder="PO, supplier, job, sales rep" oninput="renderFlooringSupplierTasks()"></div></div></div>
      <div id="fspList"></div>`;
    main.appendChild(page);
  }

  async function session(){
    if(typeof cloudEnsureSession!=='function')return null;
    return cloudEnsureSession();
  }
  async function api(path,options={}){
    const s=await session();if(!s)throw new Error('Warehouse Cloud sign-in is required. Open Settings → Cloud Sync and sign in first.');
    const headers=options.headers||cloudHeaders(s.access_token,options.json!==false);
    return cloudRequest(path,{...options,headers});
  }

  window.refreshFlooringSupplierTasks=async function(showMessage=false){
    const el=q('fspList');if(el)el.innerHTML='<div class="card"><div class="empty">Checking shared Supplier Pickup tasks…</div></div>';
    try{
      supplierTasks=await api('/rest/v1/flooring_supplier_tasks?select=*&environment=eq.'+ENV+'&order=requested_date.asc,created_at.asc',{json:false});
      if(!Array.isArray(supplierTasks))supplierTasks=[];
      renderFlooringSupplierTasks();if(showMessage)alert('Supplier Pickup / Receiving refreshed.');
    }catch(e){if(el)el.innerHTML='<div class="card"><div class="notice">'+safe(e.message)+'</div></div>'}
  };

  window.renderFlooringSupplierTasks=function(){
    const el=q('fspList');if(!el)return;
    const filter=q('fspFilter')?.value||'',search=(q('fspSearch')?.value||'').trim().toLowerCase();
    q('fspScheduled').textContent=supplierTasks.filter(t=>t.status==='Scheduled').length;
    q('fspProgress').textContent=supplierTasks.filter(t=>['In Progress','Picked Up'].includes(t.status)).length;
    q('fspDelayed').textContent=supplierTasks.filter(t=>t.status==='Delayed').length;
    const rows=supplierTasks.filter(t=>(!filter||t.status===filter)&&(!search||[t.po_number,t.supplier,t.job_number,t.customer_name,t.sales_rep].some(v=>String(v||'').toLowerCase().includes(search))));
    if(!rows.length){el.innerHTML='<div class="card"><div class="empty">No Supplier Pickup / Receiving tasks match this view.</div></div>';return}
    const months={};rows.forEach(t=>{const k=monthLabel(t.requested_date);(months[k]||(months[k]=[])).push(t)});
    el.innerHTML=Object.entries(months).map(([month,list])=>`<div class="sectionTitle">${safe(month)}</div>${list.map(taskCard).join('')}`).join('');
  };

  function taskCard(t){
    const items=Array.isArray(t.items)?t.items:[],received=Array.isArray(t.received_items)?t.received_items:[];
    const itemHtml=items.length?items.map((x,i)=>`<div class="item"><div class="name" style="font-size:15px">${safe(x.style||'Item')} ${x.colour?'· '+safe(x.colour):''}</div><div class="meta">Ordered: <b>${safe(x.qty||'—')}</b>${x.size?' · Size '+safe(x.size):''}</div><div class="formgrid"><div><label>Received Qty</label><input id="fspQty-${t.id}-${i}" value="${safe(received[i]?.received_qty||'')}" placeholder="Enter actual received qty"></div><div><label>Condition / Note</label><input id="fspCond-${t.id}-${i}" value="${safe(received[i]?.condition||'')}" placeholder="OK / damaged / short..."></div></div></div>`).join(''):'<div class="notice">No PO item lines were supplied.</div>';
    const delayed=t.status==='Delayed'?`<div class="notice" style="margin-top:8px;color:#9a5a00"><b>Delay:</b> ${safe(t.delay_reason||'No reason entered')}</div>`:'';
    const pickupBtn=t.fulfillment_method==='Pickup'?`<button class="purple" onclick="updateFlooringSupplierTask('${t.id}','Picked Up')">Picked Up</button>`:'';
    return `<div class="card" data-task="${t.id}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div class="name">PO #${safe(t.po_number)} · ${safe(t.supplier)}</div><div class="meta">${safe(dateLabel(t.requested_date))} · ${safe(t.fulfillment_method)} · ${safe(t.purchase_type)}<br>Job ${safe(t.job_number||'—')} · Sales ${safe(t.sales_rep||'—')} · Customer ${safe(t.customer_name||'—')}</div></div><span class="status ${t.status==='Ready'||t.status==='Completed'?'done':t.status==='In Progress'||t.status==='Picked Up'?'progress':'waiting'}">${safe(t.status)}</span></div>
      ${delayed}<div class="sectionTitle">Items / Receiving</div>${itemHtml}
      <div class="actions"><button onclick="fillFlooringOrderedQty('${t.id}')">Fill Ordered Qty</button><button class="primary" onclick="updateFlooringSupplierTask('${t.id}','In Progress')">Start</button>${pickupBtn}<button class="green" onclick="updateFlooringSupplierTask('${t.id}','Ready')">Ready / Received</button><button class="orange" onclick="delayFlooringSupplierTask('${t.id}')">Delayed</button><button onclick="updateFlooringSupplierTask('${t.id}','Completed')">Complete</button></div>
      <label>Warehouse Notes</label><textarea id="fspNotes-${t.id}" placeholder="Receipt, location, shortage, damage, supplier comment…">${safe(t.warehouse_notes||'')}</textarea>
    </div>`;
  }

  window.fillFlooringOrderedQty=function(id){
    const t=supplierTasks.find(x=>x.id===id);if(!t)return;(t.items||[]).forEach((x,i)=>{const el=q(`fspQty-${id}-${i}`);if(el)el.value=x.qty||''})
  };

  function receivedPayload(t){return (t.items||[]).map((x,i)=>({style:x.style||'',colour:x.colour||'',ordered_qty:x.qty||'',received_qty:q(`fspQty-${t.id}-${i}`)?.value.trim()||'',condition:q(`fspCond-${t.id}-${i}`)?.value.trim()||''}))}

  window.delayFlooringSupplierTask=function(id){
    const reason=prompt('Why is this Pickup / Receiving task delayed?\n\nExample: Supplier not ready, backorder, quantity incomplete, wrong material, vehicle issue.');if(reason===null)return;if(!reason.trim()){alert('A delay reason is required.');return}updateFlooringSupplierTask(id,'Delayed',reason.trim())
  };

  window.updateFlooringSupplierTask=async function(id,status,delayReason=''){
    const t=supplierTasks.find(x=>x.id===id);if(!t)return;
    const received=receivedPayload(t),notes=q('fspNotes-'+id)?.value.trim()||'';
    if(status==='Ready'&&(t.items||[]).length&&received.some(x=>!x.received_qty)){
      alert('Enter the actual Received Qty for every PO item, or use Fill Ordered Qty for a full receipt. Accounting relies on this receiving record.');return;
    }
    try{
      await api('/rest/v1/rpc/flooring_update_supplier_task',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:id,p_status:status,p_delay_reason:delayReason||null,p_warehouse_notes:notes||null,p_received_items:received})});
      await refreshFlooringSupplierTasks();
      if(status==='Ready')alert('Receiving saved. Flooring OS and Accounting can now see the same received quantities.');
      else if(status==='Delayed')alert('Delay saved. Flooring OS now has the reason for the Sales update.');
    }catch(e){alert('Supplier task update failed: '+e.message)}
  };

  function boot(){injectPage();injectHomeModule();const obs=new MutationObserver(()=>{injectPage();injectHomeModule()});obs.observe(document.body,{childList:true,subtree:true});setInterval(()=>{if(!q('supplierPickupExec')?.classList.contains('hidden'))refreshFlooringSupplierTasks()},60000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();