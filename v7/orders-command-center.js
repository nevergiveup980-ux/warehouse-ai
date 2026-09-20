(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const state={api:null,data:null,today:null,completedRecent:null,filter:'all'};
  const FILTERS={
    all:{label:'All',args:{}},
    p1:{label:'P1',args:{priority:'P1'}},
    p2:{label:'P2',args:{priority:'P2'}},
    p3:{label:'P3',args:{priority:'P3'}},
    receive:{label:'Receive',args:{work_type:'RECEIVE'}},
    ship:{label:'Ship',args:{work_type:'SHIP'}},
    aged24:{label:'24h+',args:{min_age_hours:24}},
  };
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
  function renderToday(){
    const result=state.today||{items:[],matching_count:0,returned_count:0};
    const items=result.items||[];const host=$('#todayList');
    $$('#todayFilters .filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===state.filter));
    const label=FILTERS[state.filter]?.label||'All';
    $('#todayFilterMeta').textContent='Filter: '+label+' · '+String(result.matching_count??items.length)+' matching'+((result.returned_count??items.length)<(result.matching_count??items.length)?' · showing first '+String(result.returned_count):'');
    if(!items.length){host.innerHTML='<div class="empty">No attention work matches this filter.</div>';return;}
    host.innerHTML=items.map(x=>'<a class="today-item" href="'+esc(x.target_path)+'">'+
      '<div class="today-top"><span class="priority-chip '+esc(String(x.priority||'p3').toLowerCase())+'">'+esc(x.priority||'P3')+'</span><span class="muted">'+esc(ageText(x.age_hours))+' waiting</span></div>'+
      '<div class="today-title">'+esc(x.display_id||x.title||x.work_type)+'</div>'+
      '<div class="today-reason">'+esc(x.priority_reason||'Open operational work')+'</div>'+
      '<div class="today-meta"><span>'+esc(x.work_type)+'</span><span>'+esc(x.title||'')+'</span><span>'+esc(x.subtitle||'')+'</span></div></a>').join('');
  }
  function renderCompletedRecent(){
    const r=state.completedRecent||{items:[],matching_count:0,hours:24};
    $('#completed24Count').textContent=r.matching_count??0;
    const items=r.items||[];
    $('#completed24List').innerHTML=items.length?items.map(x=>item(x.display_id||x.canonical_product_name||'Completed',[x.flow,x.canonical_product_name||'',String(x.expected_quantity)+' '+x.unit,'completed in rolling '+String(r.hours||24)+'h'],'/order-execution-workbench.html')).join(''):'<div class="empty">No tasks completed in the last '+esc(r.hours||24)+' hours.</div>';
  }
  function renderOverview(){
    const d=state.data||{},s=d.summary||{},p=d.priority||{},a=d.aging||{},lanes=d.lanes||{};
    $('#attention').textContent=s.attention_total??0;$('#exceptions').textContent=s.exceptions??0;$('#binding').textContent=s.needs_binding??0;
    $('#receive').textContent=s.ready_receive??0;$('#ship').textContent=s.ready_ship??0;$('#completed').textContent=s.completed??0;
    $('#p1').textContent=p.p1??0;$('#p2').textContent=p.p2??0;$('#p3').textContent=p.p3??0;$('#aged24').textContent=a.aged_24h??0;$('#oldest').textContent=ageText(a.oldest_hours??0);
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
  async function refreshToday(){
    const cfg=FILTERS[state.filter]||FILTERS.all;
    state.today=await state.api.getToday({...cfg.args,limit:50});
    renderToday();
  }
  async function refresh(){
    $('#refreshBtn').disabled=true;
    try{
      const cfg=FILTERS[state.filter]||FILTERS.all;
      const [overview,today,recent]=await Promise.all([
        state.api.get(),
        state.api.getToday({...cfg.args,limit:50}),
        state.api.getCompletedRecent({hours:24,limit:12}),
      ]);
      state.data=overview;state.today=today;state.completedRecent=recent;
      renderOverview();renderToday();renderCompletedRecent();
      banner('Orders Command Center connected. Today filters are read-only; completed uses a rolling 24-hour window, not an invented calendar cutoff.','success');
    }catch(err){banner('Command Center could not load: '+(err?.message||String(err)),'danger');}
    finally{$('#refreshBtn').disabled=false;}
  }
  async function applyFilter(key){
    if(!FILTERS[key])return;state.filter=key;
    $$('#todayFilters .filter').forEach(b=>b.disabled=true);
    try{await refreshToday();}catch(err){banner('Today filter could not load: '+(err?.message||String(err)),'danger');}
    finally{$$('#todayFilters .filter').forEach(b=>b.disabled=false);}
  }
  async function load(){
    try{
      if(!window.RUNLU_V7_ORDERS_COMMAND_CENTER_LOCAL_CONFIG||typeof window.createRunluV7LocalOrdersCommandCenterApi!=='function')throw new Error('DISPOSABLE_COMMAND_CENTER_CONFIG_MISSING');
      state.api=window.createRunluV7LocalOrdersCommandCenterApi(window.RUNLU_V7_ORDERS_COMMAND_CENTER_LOCAL_CONFIG);
      await refresh();
    }catch(err){banner('Command Center is not connected: '+(err?.message||String(err)),'danger');}
  }
  $('#refreshBtn').addEventListener('click',refresh);
  $$('#todayFilters .filter').forEach(b=>b.addEventListener('click',()=>applyFilter(b.dataset.filter)));
  load();
})();
