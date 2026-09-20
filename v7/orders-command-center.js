(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const state={api:null,data:null};
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function banner(message,kind=''){const b=$('#banner');b.textContent=message;b.className='banner '+kind;}
  function item(title,meta,href){
    return '<a class="item" href="'+esc(href)+'"><div class="item-title">'+esc(title)+'</div><div class="item-meta">'+meta.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></a>';
  }
  function renderLane(id,items,formatter,empty='Nothing waiting in this lane.'){
    const host=$(id);host.innerHTML=items.length?items.map(formatter).join(''):'<div class="empty">'+esc(empty)+'</div>';
  }
  function ageText(hours){
    const h=Number(hours||0);if(h<24)return h+'h';const d=Math.floor(h/24),r=h%24;return d+'d'+(r?' '+r+'h':'');
  }
  function renderToday(items){
    const host=$('#todayList');
    if(!items.length){host.innerHTML='<div class="empty">No attention work is waiting.</div>';return;}
    host.innerHTML=items.map(x=>'<a class="today-item" href="'+esc(x.target_path)+'">'+
      '<div class="today-top"><span class="priority-chip '+esc(String(x.priority||'p3').toLowerCase())+'">'+esc(x.priority||'P3')+'</span><span class="muted">'+esc(ageText(x.age_hours))+' waiting</span></div>'+
      '<div class="today-title">'+esc(x.display_id||x.title||x.work_type)+'</div>'+
      '<div class="today-reason">'+esc(x.priority_reason||'Open operational work')+'</div>'+
      '<div class="today-meta"><span>'+esc(x.work_type)+'</span><span>'+esc(x.title||'')+'</span><span>'+esc(x.subtitle||'')+'</span></div></a>').join('');
  }
  function render(){
    const d=state.data||{},s=d.summary||{},p=d.priority||{},a=d.aging||{},lanes=d.lanes||{};
    $('#attention').textContent=s.attention_total??0;$('#exceptions').textContent=s.exceptions??0;$('#binding').textContent=s.needs_binding??0;
    $('#receive').textContent=s.ready_receive??0;$('#ship').textContent=s.ready_ship??0;$('#completed').textContent=s.completed??0;
    $('#p1').textContent=p.p1??0;$('#p2').textContent=p.p2??0;$('#p3').textContent=p.p3??0;$('#aged24').textContent=a.aged_24h??0;$('#oldest').textContent=ageText(a.oldest_hours??0);
    renderToday(d.today||[]);
    renderLane('#exceptionLane',lanes.exceptions||[],x=>{
      const c=x.display_context||{};const title=c.purchase_order_number||c.sales_order_number||c.recovery_key||x.reason||'Exception';
      return item(title,[x.reason,String(x.evidence_count||0)+' evidence'],'/order-exception-workbench.html');
    });
    renderLane('#bindingLane',lanes.needs_binding||[],x=>item(x.display_id||x.source_product_label||'Order',[x.source_product_label||'No product label',x.source_location_label||'No location',String(x.source_quantity??'—')+' '+(x.source_unit||'')],'/order-binding-workbench.html'));
    renderLane('#receiveLane',lanes.ready_receive||[],x=>item(x.display_id||x.canonical_product_name||'Inbound',[x.canonical_product_name||'',x.canonical_location_code||'',String(x.remaining_quantity)+' '+x.unit+' remaining'],'/order-execution-workbench.html'));
    renderLane('#shipLane',lanes.ready_ship||[],x=>item(x.display_id||x.canonical_product_name||'Outbound',[x.canonical_product_name||'',x.canonical_location_code||'',String(x.remaining_quantity)+' '+x.unit+' remaining'],'/order-execution-workbench.html'));
    renderLane('#completedLane',lanes.completed||[],x=>item(x.display_id||x.canonical_product_name||'Completed',[x.flow,x.canonical_product_name||'',String(x.expected_quantity)+' '+x.unit],'/order-execution-workbench.html'));
    const actions=d.recent_actions||[];
    $('#recentActions').innerHTML=actions.length?actions.map(a=>'<div class="action"><div class="action-type">'+esc(a.action_type)+'</div><div><b>'+esc(a.display_id)+'</b><div class="muted">'+esc(a.canonical_product_name||'')+' · '+esc(a.canonical_location_code||'')+'</div></div><div class="action-qty">'+esc(a.quantity)+' '+esc(a.unit)+'</div></div>').join(''):'<div class="empty">No execution actions yet.</div>';
  }
  async function refresh(){
    $('#refreshBtn').disabled=true;
    try{state.data=await state.api.get();render();banner('Orders Command Center connected. Today priority is transparent, read-only, and does not invent due dates.','success');}
    catch(err){banner('Command Center could not load: '+(err?.message||String(err)),'danger');}
    finally{$('#refreshBtn').disabled=false;}
  }
  async function load(){
    try{
      if(!window.RUNLU_V7_ORDERS_COMMAND_CENTER_LOCAL_CONFIG||typeof window.createRunluV7LocalOrdersCommandCenterApi!=='function')throw new Error('DISPOSABLE_COMMAND_CENTER_CONFIG_MISSING');
      state.api=window.createRunluV7LocalOrdersCommandCenterApi(window.RUNLU_V7_ORDERS_COMMAND_CENTER_LOCAL_CONFIG);
      await refresh();
    }catch(err){banner('Command Center is not connected: '+(err?.message||String(err)),'danger');}
  }
  $('#refreshBtn').addEventListener('click',refresh);load();
})();
