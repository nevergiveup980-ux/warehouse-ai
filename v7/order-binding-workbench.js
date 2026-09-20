(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const state={api:null,status:'unbound',data:null,detail:null,pendingCommands:{}};
  const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const displayId=o=>o.purchase_order_number || o.sales_order_number || o.recovery_key || o.order_id.slice(0,8);
  function banner(message,kind=''){const b=$('#banner');b.textContent=message;b.className='banner '+kind;}
  function summary(){const s=state.data?.summary||{};$('#unboundCount').textContent=s.unbound??0;$('#boundCount').textContent=s.bound??0;$('#archivedCount').textContent=s.archived_unbound??0;}
  function render(){
    summary();const host=$('#grid');host.innerHTML='';const orders=state.data?.orders||[];
    if(!orders.length){host.innerHTML='<div class="empty">No orders match this binding filter.</div>';return;}
    for(const o of orders){
      const b=document.createElement('button');b.type='button';b.className='order '+(o.binding_status==='bound'?'bound':'');
      b.innerHTML=`<div class="top"><span class="pill">${o.binding_status==='bound'?'BOUND':'NEEDS BINDING'}</span><span class="muted">${esc(o.order_lifecycle)}</span></div>
        <div class="title">${esc(o.source_product_label || 'Canonical order')}</div>
        <div class="meta"><span>${esc(displayId(o))}</span><span>${esc(o.customer_label || '')}</span></div>
        <div class="source">Source evidence: ${esc(o.source_location_label || 'no location label')} · ${esc(o.source_quantity ?? '—')} ${esc(o.source_unit || '')}</div>
        <div class="foot"><span>${esc(o.fulfillment_status)}</span><span>${o.binding_status==='bound'?'Review binding →':'Choose canonical IDs →'}</span></div>`;
      b.addEventListener('click',()=>openOrder(o.order_id));host.appendChild(b);
    }
  }
  async function refresh(){
    $('#refreshBtn').disabled=true;
    try{state.data=await state.api.list(state.status);render();banner('Disposable binding queue connected. Source labels remain display-only.','success');}
    catch(err){banner('Binding queue could not load: '+(err?.message||String(err)),'danger');}
    finally{$('#refreshBtn').disabled=false;}
  }
  function sourceCell(label,value){return '<div class="source-cell"><label>'+esc(label)+'</label><b>'+esc(value??'—')+'</b></div>';}
  function option(value,label){return '<option value="'+esc(value)+'">'+esc(label)+'</option>';}
  function updateStocks(){
    const d=state.detail;if(!d)return;
    const flow=$('#flow').value,product=$('#product').value,location=$('#location').value,unit=$('#unit').value.trim().toUpperCase();
    $('#stockField').style.display=flow==='OUTBOUND'?'flex':'none';
    const candidates=(d.stock_items||[]).filter(s=>(!product||s.product_id===product)&&(!location||s.location_id===location)&&(!unit||String(s.unit).toUpperCase()===unit));
    $('#stock').innerHTML='<option value="">Choose stock…</option>'+candidates.map(s=>option(s.stock_item_id,(s.product_name||'Stock')+' · '+(s.location_code||'No location')+' · '+s.quantity+' '+s.unit+' · v'+s.version)).join('');
    validate();
  }
  function validate(){
    const d=state.detail;if(!d)return;
    const flow=$('#flow').value,product=$('#product').value,location=$('#location').value,qty=Number($('#quantity').value),unit=$('#unit').value.trim();
    const stock=$('#stock').value;
    const ok=d.can_bind===true && d.binding_status==='unbound' && (flow==='INBOUND'||flow==='OUTBOUND') && product && location && Number.isFinite(qty) && qty>0 && unit && (flow!=='OUTBOUND'||stock);
    $('#bindBtn').disabled=!ok;
    $('#hint').textContent=d.binding_status==='bound'?'This order already has an immutable execution identity binding.'
      : d.can_bind!==true?'Current role may review but cannot bind.'
      : flow==='OUTBOUND'&&!stock?'Outbound requires an explicit stock item matching the selected product, location, and unit.'
      : 'Binding creates identity only. It does not change inventory quantity.';
  }
  function renderDetail(d){
    state.detail=d;$('#drawerTitle').textContent='Bind · '+displayId(d);
    $('#sourceGrid').innerHTML=sourceCell('Source product label',d.source_product_label)+sourceCell('Source location label',d.source_location_label)+sourceCell('Source quantity',d.source_quantity)+sourceCell('Source unit',d.source_unit);
    $('#flow').value=d.flow||'';$('#quantity').value=d.expected_quantity??d.source_quantity??'';$('#unit').value=d.binding_unit||d.source_unit||'';
    $('#product').innerHTML='<option value="">Choose product…</option>'+(d.products||[]).map(p=>option(p.product_id,(p.name||'Product')+(p.sku?' · '+p.sku:'')+' · '+p.base_unit)).join('');
    $('#location').innerHTML='<option value="">Choose location…</option>'+(d.locations||[]).map(l=>option(l.location_id,l.code+' · '+l.kind)).join('');
    if(d.product_id)$('#product').value=d.product_id;if(d.location_id)$('#location').value=d.location_id;
    updateStocks();if(d.stock_item_id)$('#stock').value=d.stock_item_id;validate();
    $('#drawer').classList.add('open');$('#backdrop').hidden=false;
  }
  async function openOrder(id){try{const d=await state.api.get(id);if(!d)throw new Error('Order not found');renderDetail(d);}catch(err){banner('Order could not load: '+(err?.message||String(err)),'danger');}}
  function close(){state.detail=null;$('#drawer').classList.remove('open');$('#backdrop').hidden=true;}
  async function bind(){
    const d=state.detail;if(!d)return;const flow=$('#flow').value,qty=Number($('#quantity').value),unit=$('#unit').value.trim().toUpperCase();
    const product=$('#product').value,location=$('#location').value,stock=flow==='OUTBOUND'?$('#stock').value:null;
    if(!product||!location||!flow||!unit||!Number.isFinite(qty)||qty<=0||(flow==='OUTBOUND'&&!stock)){banner('Complete every required canonical binding field.','danger');return;}
    const commandId=state.pendingCommands[d.order_id]||crypto.randomUUID();state.pendingCommands[d.order_id]=commandId;
    if(!window.confirm('Bind this order to the selected canonical product/location'+(flow==='OUTBOUND'?' / stock':'')+'?\n\nOld source labels will NOT be used as identity.'))return;
    $('#bindBtn').disabled=true;
    try{
      const result=await state.api.bind(d.order_id,{command_id:commandId,expected_order_version:Number(d.order_version),flow,product_id:product,location_id:location,stock_item_id:stock,expected_quantity:qty,unit});
      if(result?.status!=='committed')throw new Error(result?.code||'Binding was not committed');
      delete state.pendingCommands[d.order_id];close();await refresh();banner('Order bound by explicit canonical IDs. It is now available in Execution.','success');
    }catch(err){if(err?.status===409)delete state.pendingCommands[d.order_id];banner('Binding failed: '+(err?.message||String(err)),'danger');$('#bindBtn').disabled=false;}
  }
  async function load(){try{if(!window.RUNLU_V7_ORDER_BINDING_LOCAL_CONFIG||typeof window.createRunluV7LocalOrderBindingApi!=='function')throw new Error('DISPOSABLE_BINDING_CONFIG_MISSING');state.api=window.createRunluV7LocalOrderBindingApi(window.RUNLU_V7_ORDER_BINDING_LOCAL_CONFIG);await refresh();}catch(err){banner('Binding workbench is not connected: '+(err?.message||String(err)),'danger');}}
  $('#refreshBtn').addEventListener('click',refresh);$('#closeBtn').addEventListener('click',close);$('#backdrop').addEventListener('click',close);$('#bindBtn').addEventListener('click',bind);
  for(const id of ['#flow','#product','#location','#stock'])$(id).addEventListener('change',()=>id==='#stock'?validate():updateStocks());
  for(const id of ['#quantity','#unit'])$(id).addEventListener('input',()=>id==='#unit'?updateStocks():validate());
  $$('#filters button').forEach(btn=>btn.addEventListener('click',async()=>{state.status=btn.dataset.status;$$('#filters button').forEach(x=>x.classList.toggle('active',x===btn));await refresh();}));
  load();
})();
