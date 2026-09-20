(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const state={api:null,overview:null,list:null,kind:'ALL',query:''};
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function banner(msg,kind=''){const el=$('#banner');el.textContent=msg;el.className='banner '+kind;}
  function qty(v){
    const s=String(v??'').trim();if(!s)return '—';
    const n=Number(s);if(!Number.isFinite(n))return s;
    return Number.isInteger(n)?String(n):String(Math.round(n*10000)/10000);
  }
  function renderOverview(){
    const s=state.overview?.summary||{};
    $('#carpetHero').textContent=s.carpet_physical_instances??0;
    $('#carpetCount').textContent=s.carpet_physical_instances??0;
    $('#stockCount').textContent=s.ordinary_stock_items??0;
    $('#distinctRolls').textContent=s.carpet_distinct_company_roll_numbers??0;
    $('#sharedCount').textContent=s.shared_legacy_roll_instances??0;
    $('#conflictCount').textContent=s.carpet_review_total??s.carpet_identity_conflicts??0;
  }
  function card(x){
    if(x.kind==='CONFLICT'||x.kind==='REVIEW'){
      const label=x.kind==='CONFLICT'?'Identity conflict':'Operational review';
      const detail=x.review_reason||(x.kind==='CONFLICT'?'Company roll number needs confirmation':'Carpet data needs confirmation');
      const dataset=x.kind==='CONFLICT'?'derived_carpet_identity_v7':'derived_carpet_review_v7';
      const href='/carpet-review-workbench.html?dataset='+encodeURIComponent(dataset)+'&record='+encodeURIComponent(x.source_id||'');
      return '<article class="card review"><div class="card-top"><span class="kind">REVIEW</span><span class="badge review">'+esc(label)+'</span></div>'+
        '<div class="title">'+esc(x.display_id||'Carpet review')+'</div>'+
        '<div class="product">'+esc(detail)+'</div>'+
        '<div class="details">'+
          (x.location_code?'<span class="detail">'+esc(x.location_code)+'</span>':'')+
          (x.quantity_text?'<span class="detail">'+esc(qty(x.quantity_text))+' ft</span>':'')+
          (x.measure_status?'<span class="detail">'+esc(x.measure_status)+'</span>':'')+
          '<span class="detail">'+esc(x.source_id||'')+'</span></div>'+
        '<div class="details"><a class="detail" href="'+href+'">Review details</a></div></article>';
    }
    if(x.kind==='CARPET'){
      const shared=x.shared_legacy_roll_number?'<span class="badge shared">Shared legacy number</span>':'<span class="badge">Carpet</span>';
      return '<article class="card"><div class="card-top"><span class="kind">CARPET</span>'+shared+'</div>'+
        '<div class="title">'+esc(x.display_id||'Unnumbered roll')+'</div>'+
        '<div class="product">'+esc(x.product_name||'Unnamed carpet')+(x.colour?' · '+esc(x.colour):'')+'</div>'+
        '<div class="details"><span class="detail">'+esc(x.location_code||'No location')+'</span><span class="detail">'+esc(qty(x.quantity_text))+' ft</span><span class="detail">'+esc(x.measure_status||'—')+'</span></div></article>';
    }
    return '<article class="card"><div class="card-top"><span class="kind">OTHER STOCK</span><span class="badge">Canonical</span></div>'+
      '<div class="title">'+esc(x.product_name||x.display_id||'Stock item')+'</div>'+
      (x.colour?'<div class="product">'+esc(x.colour)+'</div>':'')+
      '<div class="details"><span class="detail">'+esc(x.location_code||'No location')+'</span><span class="detail">'+esc(qty(x.quantity_text))+' '+esc(x.unit||'')+'</span></div></article>';
  }
  function renderList(){
    const d=state.list||{items:[],matching_count:0,returned_count:0};
    const items=d.items||[];
    $$('#filters .filter').forEach(b=>b.classList.toggle('active',b.dataset.kind===state.kind));
    const suffix=(d.returned_count??items.length)<(d.matching_count??items.length)?' · showing first '+String(d.returned_count):'';
    $('#listMeta').textContent=String(d.matching_count??items.length)+' matching · '+state.kind+(state.query?' · search “'+state.query+'”':'')+suffix;
    $('#inventoryList').innerHTML=items.length?items.map(card).join(''):'<div class="empty">No inventory matches this view.</div>';
  }
  async function refreshList(){
    state.list=await state.api.list({kind:state.kind,query:state.query||null,limit:50});
    renderList();
  }
  async function refresh(){
    $('#refreshBtn').disabled=true;
    try{
      const [overview,list]=await Promise.all([
        state.api.get(),
        state.api.list({kind:state.kind,query:state.query||null,limit:50})
      ]);
      state.overview=overview;state.list=list;renderOverview();renderList();
      banner('Inventory connected. Carpet Identity V2 is reconciled; review items stay quarantined and operational carpet cutover remains disabled.','success');
    }catch(err){banner('Inventory Command Center could not load: '+(err?.message||String(err)),'danger');}
    finally{$('#refreshBtn').disabled=false;}
  }
  async function setKind(kind){
    state.kind=kind;
    $$('#filters .filter').forEach(b=>b.disabled=true);
    try{await refreshList();}catch(err){banner('Inventory filter could not load: '+(err?.message||String(err)),'danger');}
    finally{$$('#filters .filter').forEach(b=>b.disabled=false);}
  }
  async function load(){
    try{
      if(!window.RUNLU_V7_INVENTORY_COMMAND_CENTER_LOCAL_CONFIG||typeof window.createRunluV7LocalInventoryCommandCenterApi!=='function')throw new Error('DISPOSABLE_INVENTORY_CONFIG_MISSING');
      state.api=window.createRunluV7LocalInventoryCommandCenterApi(window.RUNLU_V7_INVENTORY_COMMAND_CENTER_LOCAL_CONFIG);
      await refresh();
    }catch(err){banner('Inventory Command Center is not connected: '+(err?.message||String(err)),'danger');}
  }
  $('#refreshBtn').addEventListener('click',refresh);
  $('#searchForm').addEventListener('submit',async e=>{e.preventDefault();state.query=$('#searchInput').value.trim();await refreshList();});
  $('#clearBtn').addEventListener('click',async()=>{$('#searchInput').value='';state.query='';await refreshList();});
  $$('#filters .filter').forEach(b=>b.addEventListener('click',()=>setKind(b.dataset.kind)));
  load();
})();
