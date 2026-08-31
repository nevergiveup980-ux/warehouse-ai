// RUNLU Warehouse OS V6.12.18 Build111 · Correct Supplier Pickup folder semantics.
// People to Call is NOT a supplier-chasing queue. It begins only after pickup / receiving is complete,
// when Sales needs to do the next follow-up. Delays, overdue pickups and confirmation waits remain
// operational alerts, but they do not belong in People to Call.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD111_SALES_FOLLOWUP_WORKFLOW__) return;
  window.__RUNLU_BUILD111_SALES_FOLLOWUP_WORKFLOW__ = true;

  const ENV='training';
  const OPEN_STATUSES=['Scheduled','In Progress','Picked Up','Delayed'];
  const PICKUP_PENDING_STATUSES=['Scheduled','In Progress','Delayed'];
  const SALES_FOLLOWUP_STATUSES=['Ready','Completed'];
  let workflowTasks=[];
  let activeQueue='all';
  const q=id=>document.getElementById(id);
  const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function localDateOnly(d=new Date()){
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function parseDateOnly(v){
    if(!v)return null;
    const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0,0);
    return !Number.isNaN(d.getTime())&&localDateOnly(d)===String(v)?d:null;
  }
  function monthKey(v){const d=typeof v==='string'?parseDateOnly(v):v;return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:''}
  function nextMonthKey(){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+1);return monthKey(d)}
  function isOpen(t){return OPEN_STATUSES.includes(t?.status)}
  function isConfirmed(t){
    return !!(t?.supplier_confirmed_at||t?.started_at||t?.picked_up_at||t?.received_at||t?.completed_at) || ['In Progress','Picked Up','Ready','Completed'].includes(t?.status);
  }
  function isPickupPending(t){return PICKUP_PENDING_STATUSES.includes(t?.status)}
  function needsSalesFollowup(t){return SALES_FOLLOWUP_STATUSES.includes(t?.status)&&t?.call_needed===true}
  function inQueue(t,queue){
    if(queue==='all')return true;
    if(queue==='awaiting')return isOpen(t)&&!isConfirmed(t);
    if(queue==='this')return isPickupPending(t)&&isConfirmed(t)&&monthKey(t.requested_date)===monthKey(new Date());
    if(queue==='next')return isPickupPending(t)&&isConfirmed(t)&&monthKey(t.requested_date)===nextMonthKey();
    if(queue==='call')return needsSalesFollowup(t);
    return true;
  }
  function taskById(id){return workflowTasks.find(t=>String(t.id)===String(id))}

  async function session(){return typeof cloudEnsureSession==='function'?cloudEnsureSession():null}
  async function api(path,options={}){
    const s=await session();if(!s)throw new Error('Warehouse Cloud sign-in is required. Open Settings → Cloud Sync and sign in first.');
    return cloudRequest(path,{...options,headers:options.headers||cloudHeaders(s.access_token,options.json!==false)});
  }

  function injectStyle(){
    if(q('runluBuild111SupplierWorkflowStyle'))return;
    q('runluBuild110SupplierWorkflowStyle')?.remove();
    const s=document.createElement('style');s.id='runluBuild111SupplierWorkflowStyle';s.textContent=`
      #fspWorkflowQueues{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}
      #fspWorkflowQueues button{border:1px solid #d8dde6;background:#fff;border-radius:13px;padding:10px 9px;text-align:left;min-height:68px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;color:inherit}
      #fspWorkflowQueues button b{font-size:23px;line-height:1}#fspWorkflowQueues button span{font-size:12px;font-weight:800;line-height:1.2}
      #fspWorkflowQueues button.active{outline:2px solid #294f91;border-color:#294f91;background:#f2f6ff}
      #fspWorkflowQueues button.call.active{outline-color:#7c3f78;border-color:#7c3f78;background:#fbf4fb}
      #fspWorkflowToolbar{margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      #fspWorkflowToolbar .queueHint{font-size:12px;color:#657083}
      .runluWorkflowState{margin:9px 0 2px;padding:9px 10px;border:1px solid #e3e7ed;border-radius:12px;background:#fafbfd}
      .runluWorkflowState .wfLine{display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:12px}
      .runluWorkflowState .wfBadge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;background:#eef1f5;color:#485466}
      .runluWorkflowState .wfBadge.confirmed{background:#e9f8ef;color:#176b40}.runluWorkflowState .wfBadge.call{background:#f7edf7;color:#71376d}
      .runluWorkflowState .wfActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.runluWorkflowState .wfActions button{font-size:12px;padding:7px 9px}
      @media(max-width:720px){#fspWorkflowQueues{grid-template-columns:repeat(2,minmax(0,1fr))}#fspWorkflowQueues button{min-height:64px}}
    `;document.head.appendChild(s);
  }

  function injectQueueStrip(){
    const page=q('supplierPickupExec');if(!page)return;
    q('fspWorkflowQueues')?.remove();q('fspWorkflowToolbar')?.remove();
    const firstCard=page.querySelector('.card');if(!firstCard)return;
    const summary=q('fspScheduled')?.closest('.summaryStrip');
    const shell=document.createElement('div');
    shell.innerHTML=`<div id="fspWorkflowQueues" aria-label="Supplier pickup work queues">
      <button type="button" data-queue="awaiting"><span>Awaiting Confirmation</span><b id="fspQueueAwaiting">0</b></button>
      <button type="button" data-queue="next"><span>Pick-ups Next Month</span><b id="fspQueueNext">0</b></button>
      <button type="button" data-queue="this"><span>Pick-ups This Month</span><b id="fspQueueThis">0</b></button>
      <button type="button" class="call" data-queue="call"><span>People to Call</span><b id="fspQueueCall">0</b></button>
    </div><div id="fspWorkflowToolbar"><div class="queueHint" id="fspWorkflowHint"></div><button type="button" id="fspQueueAll">Show All</button></div>`;
    [...shell.children].forEach(n=>summary?firstCard.insertBefore(n,summary):firstCard.appendChild(n));
    q('fspWorkflowQueues')?.querySelectorAll('button[data-queue]').forEach(b=>b.addEventListener('click',()=>selectQueue(b.dataset.queue)));
    q('fspQueueAll')?.addEventListener('click',()=>selectQueue('all'));
    paintQueueButtons();
  }

  function queueHint(){
    const map={
      all:'Four live queues mirror the physical folders. People to Call begins only after receiving is complete.',
      awaiting:'PO has been sent, but supplier confirmation has not yet been recorded.',
      next:'Supplier confirmed; pickup date falls in next calendar month.',
      this:'Supplier confirmed; pickup date falls in the current calendar month.',
      call:'Pickup / receiving is complete. These orders are waiting for Sales to do the next follow-up.'
    };
    const el=q('fspWorkflowHint');if(el)el.textContent=map[activeQueue]||map.all;
  }
  function paintQueueButtons(){
    q('fspWorkflowQueues')?.querySelectorAll('button[data-queue]').forEach(b=>b.classList.toggle('active',b.dataset.queue===activeQueue));queueHint();
  }
  function updateCounts(){
    const counts={awaiting:0,next:0,this:0,call:0};
    workflowTasks.forEach(t=>Object.keys(counts).forEach(k=>{if(inQueue(t,k))counts[k]++}));
    if(q('fspQueueAwaiting'))q('fspQueueAwaiting').textContent=counts.awaiting;
    if(q('fspQueueNext'))q('fspQueueNext').textContent=counts.next;
    if(q('fspQueueThis'))q('fspQueueThis').textContent=counts.this;
    if(q('fspQueueCall'))q('fspQueueCall').textContent=counts.call;
  }
  function selectQueue(queue){
    activeQueue=queue||'all';const status=q('fspFilter'),search=q('fspSearch');if(status)status.value='';if(search)search.value='';
    paintQueueButtons();if(typeof window.renderFlooringSupplierTasks==='function')window.renderFlooringSupplierTasks();else applyQueueFilter();
  }

  function decorateCards(){
    const list=q('fspList');if(!list)return;
    list.querySelectorAll('[data-task]').forEach(card=>{
      const id=card.getAttribute('data-task'),t=taskById(id);if(!t)return;
      card.querySelector('.runluWorkflowState')?.remove();
      const confirmed=isConfirmed(t),followup=needsSalesFollowup(t),eligible=SALES_FOLLOWUP_STATUSES.includes(t.status);
      const confirmedLabel=confirmed?`Supplier Confirmed${t.supplier_confirmed_at?' · '+new Date(t.supplier_confirmed_at).toLocaleDateString('en-CA'):''}`:'Awaiting Confirmation';
      const state=document.createElement('div');state.className='runluWorkflowState';
      state.innerHTML=`<div class="wfLine"><span class="wfBadge ${confirmed?'confirmed':''}">${safe(confirmedLabel)}</span>${followup?`<span class="wfBadge call">People to Call · Sales Follow-up</span>`:''}</div>
        ${t.supplier_confirmation_note?`<div class="meta" style="margin-top:6px"><b>Supplier note:</b> ${safe(t.supplier_confirmation_note)}</div>`:''}
        ${followup&&t.call_reason?`<div class="meta" style="margin-top:6px"><b>Sales follow-up:</b> ${safe(t.call_reason)}</div>`:''}
        <div class="wfActions">
          <button type="button" class="${confirmed?'':'green'}" onclick="confirmFlooringSupplierTask('${safe(id)}')">${confirmed?'Update Confirmation / Date':'Supplier Confirmed'}</button>
          ${eligible?(followup?`<button type="button" onclick="resolveFlooringSalesFollowup('${safe(id)}')">Sales Follow-up Done</button>`:`<button type="button" onclick="reopenFlooringSalesFollowup('${safe(id)}')">Reopen Sales Follow-up</button>`):''}
        </div>`;
      const anchor=card.querySelector('.sectionTitle');if(anchor)card.insertBefore(state,anchor);else card.appendChild(state);
    });
  }

  function applyQueueFilter(){
    const list=q('fspList');if(!list)return;
    const children=[...list.children];
    children.forEach(el=>{if(el.hasAttribute?.('data-task')){const t=taskById(el.getAttribute('data-task'));el.style.display=(activeQueue==='all'||!workflowTasks.length)?'':(t&&inQueue(t,activeQueue)?'':'none')}});
    children.forEach((el,i)=>{
      if(!el.classList?.contains('sectionTitle'))return;let any=false;
      for(let j=i+1;j<children.length&&!children[j].classList?.contains('sectionTitle');j++)if(children[j].hasAttribute?.('data-task')&&children[j].style.display!=='none'){any=true;break}
      el.style.display=any?'':'none';
    });
    const visible=[...list.querySelectorAll('[data-task]')].filter(el=>el.style.display!=='none').length;
    let empty=q('fspWorkflowEmpty');
    if(!visible&&activeQueue!=='all'){
      if(!empty){empty=document.createElement('div');empty.id='fspWorkflowEmpty';empty.className='card';empty.innerHTML='<div class="empty"></div>';list.appendChild(empty)}
      empty.querySelector('.empty').textContent='No tasks are currently in this work queue.';
    }else empty?.remove();
  }

  function afterRender(){injectStyle();if(!q('fspWorkflowQueues'))injectQueueStrip();updateCounts();decorateCards();applyQueueFilter();paintQueueButtons()}
  async function loadWorkflowTasks(){
    try{
      const rows=await api('/rest/v1/flooring_supplier_tasks?select=*&environment=eq.'+ENV+'&order=requested_date.asc,created_at.asc',{json:false});workflowTasks=Array.isArray(rows)?rows:[];updateCounts();return workflowTasks;
    }catch(e){console.warn('[Build111] supplier workflow refresh:',e?.message||e);return workflowTasks}
  }

  window.confirmFlooringSupplierTask=async function(id){
    const t=taskById(id);if(!t)return;
    const proposed=prompt('Confirmed pickup date (YYYY-MM-DD). Leave blank if the supplier confirmed the PO but has not given a pickup date yet.',t.requested_date||'');if(proposed===null)return;
    const date=proposed.trim();if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!parseDateOnly(date))){alert('Use a valid YYYY-MM-DD pickup date, or leave it blank.');return}
    const note=prompt('Supplier confirmation note (optional).',t.supplier_confirmation_note||'');if(note===null)return;
    try{await api('/rest/v1/rpc/flooring_confirm_supplier_task',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:id,p_requested_date:date||null,p_confirmation_note:note.trim()||null})});await window.refreshFlooringSupplierTasks?.(false)}
    catch(e){alert('Supplier confirmation could not be saved: '+e.message)}
  };

  window.resolveFlooringSalesFollowup=async function(id){
    const t=taskById(id);if(!t)return;if(!confirm(`Mark Sales follow-up complete for PO #${t.po_number}?`))return;
    try{await api('/rest/v1/rpc/flooring_set_supplier_call',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:id,p_call_needed:false,p_call_reason:null})});await window.refreshFlooringSupplierTasks?.(false)}
    catch(e){alert('Sales follow-up could not be completed: '+e.message)}
  };

  window.reopenFlooringSalesFollowup=async function(id){
    const t=taskById(id);if(!t)return;
    const reason=prompt('Sales follow-up note (optional).',t.call_reason||'Sales follow-up after pickup / receiving complete');if(reason===null)return;
    try{await api('/rest/v1/rpc/flooring_set_supplier_call',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:id,p_call_needed:true,p_call_reason:reason.trim()||null})});await window.refreshFlooringSupplierTasks?.(false)}
    catch(e){alert('Sales follow-up could not be reopened: '+e.message)}
  };

  function wrapRender(){
    const old=window.renderFlooringSupplierTasks;if(typeof old!=='function'||old.__build111)return;
    const wrapped=function(){const r=old.apply(this,arguments);setTimeout(afterRender,0);return r};wrapped.__build111=true;window.renderFlooringSupplierTasks=wrapped;
  }
  function wrapRefresh(){
    const old=window.refreshFlooringSupplierTasks;if(typeof old!=='function'||old.__build111)return;
    const wrapped=async function(){const r=await old.apply(this,arguments);await loadWorkflowTasks();afterRender();return r};wrapped.__build111=true;window.refreshFlooringSupplierTasks=wrapped;
  }
  function install(){injectStyle();if(!q('fspWorkflowQueues'))injectQueueStrip();wrapRender();wrapRefresh()}
  function boot(){
    install();setTimeout(async()=>{await loadWorkflowTasks();afterRender()},700);
    const obs=new MutationObserver(()=>install());obs.observe(document.body,{childList:true,subtree:true});
    setInterval(()=>{if(!q('supplierPickupExec')?.classList.contains('hidden'))loadWorkflowTasks().then(afterRender)},60000);
    document.documentElement.setAttribute('data-runlu-build111','people-to-call-sales-followup');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('pageshow',()=>setTimeout(()=>{install();loadWorkflowTasks().then(afterRender)},200));
})();
