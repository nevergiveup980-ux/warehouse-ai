(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const state={api:null,status:'open',data:null,detail:null,pendingCommands:{},pendingStockIds:{}};

  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num=v=>Number(v || 0);
  const displayId=t=>t.purchase_order_number || t.sales_order_number || t.recovery_key || t.order_id.slice(0,8);
  function banner(message,kind=''){const b=$('#banner');b.textContent=message;b.className='banner '+kind;}
  function summary(){
    const s=state.data?.summary || {};
    $('#openCount').textContent=s.open ?? 0; $('#inCount').textContent=s.inbound_open ?? 0;
    $('#outCount').textContent=s.outbound_open ?? 0; $('#doneCount').textContent=s.completed ?? 0;
  }
  function render(){
    summary();
    const host=$('#grid'); host.innerHTML='';
    const tasks=state.data?.tasks || [];
    if(!tasks.length){host.innerHTML='<div class="empty">No execution tasks match this filter.</div>';return;}
    for(const t of tasks){
      const remaining=num(t.remaining_quantity), expected=num(t.expected_quantity), executed=num(t.executed_quantity);
      const pct=expected>0?Math.max(0,Math.min(100,(executed/expected)*100)):0;
      const b=document.createElement('button'); b.type='button';
      b.className='task '+(t.flow==='INBOUND'?'receive':'ship');
      b.innerHTML=`
        <div class="top"><span class="pill">${t.flow==='INBOUND'?'RECEIVE':'SHIP'}</span><span class="muted">${esc(t.task_status)}</span></div>
        <div class="title">${esc(t.canonical_product_name || t.source_product_label || 'Order task')}</div>
        <div class="meta"><span>${esc(displayId(t))}</span><span>${esc(t.canonical_location_code || '—')}</span><span>${esc(t.customer_label || '')}</span></div>
        <div class="progress-label"><span>${executed} / ${expected} ${esc(t.unit)}</span><span>${remaining} remaining</span></div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="foot"><span>${esc(t.order_lifecycle)} · ${esc(t.fulfillment_status)}</span><span>Open task →</span></div>`;
      b.addEventListener('click',()=>openTask(t.order_id)); host.appendChild(b);
    }
  }
  async function refresh(){
    $('#refreshBtn').disabled=true;
    try{state.data=await state.api.list(state.status);render();banner('Disposable engineering task queue connected. Production is unreachable from this mode.','success');}
    catch(err){banner('Task queue could not load: '+(err?.message || String(err)),'danger');}
    finally{$('#refreshBtn').disabled=false;}
  }
  function detailCell(label,value){return '<div class="detail"><label>'+esc(label)+'</label><b>'+esc(value ?? '—')+'</b></div>';}
  function renderDetail(t){
    state.detail=t;
    $('#drawerFlow').textContent=t.flow==='INBOUND'?'RECEIVE ORDER':'SHIP ORDER';
    $('#drawerTitle').textContent=(t.canonical_product_name || t.source_product_label || 'Order task')+' · '+displayId(t);
    $('#detailGrid').innerHTML=
      detailCell('Canonical location',t.canonical_location_code)+
      detailCell('Expected',String(t.expected_quantity)+' '+t.unit)+
      detailCell('Executed',String(t.executed_quantity)+' '+t.unit)+
      detailCell('Remaining',String(t.remaining_quantity)+' '+t.unit)+
      detailCell('Stock item',t.stock_item_id || (t.flow==='INBOUND'?'Created on first receive':'—'))+
      detailCell('Stock now',t.stock_item_id ? String(t.stock_quantity)+' '+t.unit+' · v'+String(t.stock_version) : 'Not created yet')+
      detailCell('Order lifecycle',t.order_lifecycle)+
      detailCell('Fulfillment',t.fulfillment_status);
    const actions=t.actions || [];
    $('#history').innerHTML=actions.length ? actions.map(a=>'<div class="history"><b>'+esc(a.action_type)+'</b> · '+esc(a.quantity)+' '+esc(a.unit)+'<div class="muted">'+esc(a.command_id)+'</div></div>').join('') : '<div class="muted">No execution actions yet.</div>';
    $('#qty').value=String(t.remaining_quantity);
    const open=t.task_status==='open' && t.can_execute===true;
    $('#executeBtn').disabled=!open;
    $('#executeBtn').textContent=t.flow==='INBOUND'?'Receive':'Ship';
    $('#hint').textContent=!open ? 'This task is completed or the current role cannot execute it.'
      : t.flow==='INBOUND' && !t.stock_item_id ? 'First receive creates one canonical stock identity, then later receives reuse it.'
      : 'Execution uses the bound canonical stock identity and preserves command idempotency.';
    $('#drawer').classList.add('open'); $('#backdrop').hidden=false;
  }
  async function openTask(id){
    try{const d=await state.api.get(id);if(!d)throw new Error('Task not found');renderDetail(d);}
    catch(err){banner('Task could not load: '+(err?.message || String(err)),'danger');}
  }
  function close(){state.detail=null;$('#drawer').classList.remove('open');$('#backdrop').hidden=true;}
  async function execute(){
    const t=state.detail;if(!t)return;
    const quantity=Number($('#qty').value);
    if(!Number.isFinite(quantity)||quantity<=0){banner('Quantity must be greater than zero.','danger');$('#qty').focus();return;}
    if(quantity>num(t.remaining_quantity)){banner('Quantity cannot exceed the remaining task quantity.','danger');$('#qty').focus();return;}
    const orderId=t.order_id;
    const commandId=state.pendingCommands[orderId] || crypto.randomUUID();
    state.pendingCommands[orderId]=commandId;
    let stockId=t.stock_item_id;
    if(t.flow==='INBOUND' && !stockId){
      stockId=state.pendingStockIds[orderId] || crypto.randomUUID();
      state.pendingStockIds[orderId]=stockId;
    }
    if(!window.confirm((t.flow==='INBOUND'?'Receive ':'Ship ')+quantity+' '+t.unit+' for this bound order?'))return;
    $('#executeBtn').disabled=true;
    try{
      const result=await state.api.execute(orderId,{
        command_id:commandId,
        stock_item_id:stockId,
        expected_order_version:Number(t.order_version),
        expected_stock_version:t.stock_item_id ? Number(t.stock_version) : 0,
        quantity,
      });
      if(result?.status!=='committed')throw new Error(result?.code || 'Execution was not committed');
      delete state.pendingCommands[orderId]; delete state.pendingStockIds[orderId];
      close(); await refresh();
      banner((t.flow==='INBOUND'?'Receive':'Ship')+' committed. Inventory movement and order fulfillment action are linked.','success');
    }catch(err){
      if(err?.status===409){delete state.pendingCommands[orderId];delete state.pendingStockIds[orderId];}
      banner('Execution failed: '+(err?.message || String(err)),'danger'); $('#executeBtn').disabled=false;
    }
  }

  async function load(){
    try{
      if(!window.RUNLU_V7_ORDER_EXECUTION_LOCAL_CONFIG || typeof window.createRunluV7LocalOrderExecutionApi!=='function') throw new Error('DISPOSABLE_EXECUTION_CONFIG_MISSING');
      state.api=window.createRunluV7LocalOrderExecutionApi(window.RUNLU_V7_ORDER_EXECUTION_LOCAL_CONFIG);
      await refresh();
    }catch(err){banner('Execution workbench is not connected: '+(err?.message || String(err)),'danger');}
  }
  $('#refreshBtn').addEventListener('click',refresh); $('#closeBtn').addEventListener('click',close); $('#backdrop').addEventListener('click',close); $('#executeBtn').addEventListener('click',execute);
  $$('#filters button').forEach(btn=>btn.addEventListener('click',async()=>{state.status=btn.dataset.status;$$('#filters button').forEach(x=>x.classList.toggle('active',x===btn));await refresh();}));
  load();
})();
