(() => {
'use strict';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const state={api:null,status:'open',data:null,focus:null,single:false,query:''};
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const reasons=c=>(c.reasons||[]).map(x=>String(x).toUpperCase());
function banner(msg,kind=''){const e=$('#banner');e.textContent=msg;e.className='banner '+kind;}
function field(name,label,value='',type='text',options=[]){
  if(type==='select')return '<div class="field"><label>'+esc(label)+'</label><select data-field="'+name+'"><option value="">Choose…</option>'+options.map(x=>'<option value="'+x+'"'+(String(value).toUpperCase()===x?' selected':'')+'>'+x+'</option>').join('')+'</select></div>';
  return '<div class="field"><label>'+esc(label)+'</label><input data-field="'+name+'" value="'+esc(value||'')+'"></div>';
}
function helpText(r){
  const map={
    LOCATION_MISSING:'Confirm the physical rack/location.',
    MEASURE_REVIEW:'Confirm FULL, CAL, or TM.',
    MEASURE_INVALID:'Confirm measure status and physical remaining length.',
    FULL_MISMATCH:'Confirm whether the roll is FULL or CAL/TM.',
    PRODUCT_NAME_MISSING:'Confirm the carpet collection/product name.',
    PRODUCT_LABEL_HISTORY_VARIANT:'Confirm the canonical carpet product label.',
    LEGACY_INSTANCE_ROLL_NUMBER_DIVERGENCE:'Confirm the company roll number from the physical label.',
    COMPANY_ROLL_REUSED_ACROSS_PHYSICAL_INSTANCES:'Confirm the correct company roll number for each physical roll.'
  };return map[r]||'Confirm this field from physical inventory or trusted evidence.';
}
function caseMatches(c){
  const q=state.query.trim().toUpperCase();if(!q)return true;
  return [
    c.company_roll_display,c.product_name,c.colour,c.location_code,c.measure_status,c.source_record_id,
    ...(c.reasons||[])
  ].some(v=>String(v??'').toUpperCase().includes(q));
}
function filteredCases(){return (state.data?.cases||[]).filter(caseMatches);}
function focusIndex(list=filteredCases()){
  if(!list.length)return -1;
  if(state.focus){
    const i=list.findIndex(c=>c.source_dataset===state.focus.dataset&&c.source_record_id===state.focus.record);
    if(i>=0)return i;
  }
  return 0;
}
function setFocus(c,{updateUrl=true}={}){
  if(!c){state.focus=null;return;}
  state.focus={dataset:c.source_dataset,record:c.source_record_id};
  state.single=true;
  if(updateUrl&&history?.replaceState){
    const u=new URL(location.href);u.searchParams.set('dataset',c.source_dataset);u.searchParams.set('record',c.source_record_id);u.searchParams.set('single','1');history.replaceState(null,'',u);
  }
}
function leaveSingle(){
  state.single=false;state.focus=null;
  if(history?.replaceState){const u=new URL(location.href);u.searchParams.delete('dataset');u.searchParams.delete('record');u.searchParams.delete('single');history.replaceState(null,'',u);}
}
function card(c){
  const rs=reasons(c),resolved=c.review_status==='resolved';
  const needsRoll=rs.some(x=>x.includes('ROLL_NUMBER')||x.includes('COMPANY_ROLL'));
  const needsLoc=rs.includes('LOCATION_MISSING');
  const needsMeasure=rs.some(x=>['MEASURE_REVIEW','MEASURE_INVALID','FULL_MISMATCH'].includes(x));
  const needsProduct=rs.some(x=>['PRODUCT_NAME_MISSING','PRODUCT_LABEL_HISTORY_VARIANT'].includes(x));
  let fields='';
  if(needsRoll)fields+=field('company_roll_number','Confirmed company roll number','');
  if(needsLoc)fields+=field('location_code','Confirmed location','');
  if(needsMeasure)fields+=field('measure_status','Confirmed measure','', 'select',['FULL','CAL','TM']);
  if(needsProduct)fields+=field('product_name','Confirmed product / collection','');
  fields+='<div class="field full"><label>Review note (optional)</label><input data-field="note" value=""></div>';
  const focused=state.focus&&state.focus.dataset===c.source_dataset&&state.focus.record===c.source_record_id;
  return '<article class="card '+(resolved?'resolved ':'')+(focused?'focus':'')+'" data-dataset="'+esc(c.source_dataset)+'" data-record="'+esc(c.source_record_id)+'">'+
    '<div class="top"><span class="eyebrow">'+esc(c.review_kind)+'</span><span class="badge '+(resolved?'done':'')+'">'+(resolved?'Resolved':'Needs review')+'</span></div>'+
    '<div class="title">'+esc(c.company_roll_display)+'</div>'+
    '<div class="reason">'+esc(rs.join(' · ')||'Review required')+'</div>'+
    '<div class="help">'+esc(rs.map(helpText).join(' '))+'</div>'+
    '<div class="meta">'+esc(c.product_name||'Unnamed product')+(c.colour?' · '+esc(c.colour):'')+'<br>'+
      'Location: '+esc(c.location_code||'—')+' · Length: '+esc(c.length_text||'—')+' ft · Measure: '+esc(c.measure_status||'—')+'<br>'+
      'Source: '+esc(c.source_record_id)+'</div>'+
    (resolved?
      '<div class="meta">Saved v'+esc(c.resolution_version)+': '+esc(JSON.stringify(c.resolution_payload||{}))+'</div><div class="promotion" data-promotion>Checking promotion gate…</div><div class="actions"><button class="btn reopen">Reopen</button><button class="btn secondary focusone">Review one</button></div>':
      '<div class="fields">'+fields+'</div><div class="actions"><button class="btn primary save">Save Resolution</button><button class="btn primary single-only save-next">Save & Next</button><button class="btn secondary focusone">Review one</button></div>')+
    '</article>';
}
async function refreshPromotionCards(){
  const cards=$$('#grid .card.resolved');
  await Promise.all(cards.map(async el=>{
    const c=(state.data?.cases||[]).find(x=>x.source_dataset===el.dataset.dataset&&x.source_record_id===el.dataset.record);
    const box=el.querySelector('[data-promotion]');if(!c||!box)return;
    try{
      const p=await state.api.preview(c.source_dataset,c.source_record_id);
      box.textContent=p?.status==='promoted'?'Already promoted':p?.ready?'Promotion gate: ready after explicit promotion approval':'Promotion gate blocked: '+((p?.blockers||[]).join(' · ')||'not ready');
      box.classList.toggle('ready',!!p?.ready);
    }catch{box.textContent='Promotion preview unavailable';}
  }));
}
function render(){
  const d=state.data||{summary:{},cases:[]},s=d.summary||{},list=filteredCases();
  $('#total').textContent=s.total??0;$('#open').textContent=s.open??0;$('#resolved').textContent=s.resolved??0;$('#identity').textContent=s.identity??0;$('#operational').textContent=s.operational??0;
  $('[data-status]').forEach(b=>b.classList.toggle('active',b.dataset.status===state.status));
  let shown=list;
  const i=focusIndex(list);
  if(state.single&&list.length){
    const chosen=list[Math.max(0,i)];setFocus(chosen,{updateUrl:false});shown=[chosen];
  }
  $('#grid').classList.toggle('single',state.single);
  $('#grid').innerHTML=shown.length?shown.map(card).join(''):'<div class="empty">No '+esc(state.status)+(state.query?' review cases match “'+esc(state.query)+'”.':' carpet review cases.')+'</div>';
  $('#queueView').hidden=!state.single;
  $('#previousReview').hidden=!state.single||list.length<2;
  $('#nextReview').hidden=!state.single||list.length<2;
  $('#previousReview').disabled=state.single&&(i<=0||list.length<2);
  $('#nextReview').disabled=state.single&&(i<0||i>=list.length-1||list.length<2);
  $('#progress').textContent=state.single&&list.length?'Review '+String(i+1)+' of '+String(list.length):String(list.length)+' '+state.status+' review case'+(list.length===1?'':'s')+(state.query?' matching search':'');
  refreshPromotionCards();
  if(state.focus){
    const el=$('#grid .card').find(x=>x.dataset.dataset===state.focus.dataset&&x.dataset.record===state.focus.record);
    if(el)el.scrollIntoView({block:'center',behavior:'smooth'});
  }
}
async function load(){
  try{state.data=await state.api.list(state.status);render();banner('Review queue connected. Human confirmations remain separate from inventory promotion.','success');}
  catch(e){banner('Carpet Review Workbench could not load: '+(e?.message||String(e)),'danger');}
}
function moveFocus(delta){
  const list=filteredCases();if(!list.length)return;
  const i=focusIndex(list),next=Math.max(0,Math.min(list.length-1,(i<0?0:i)+delta));
  setFocus(list[next]);render();
}
function caseFor(card){
  const c=(state.data?.cases||[]).find(x=>x.source_dataset===card.dataset.dataset&&x.source_record_id===card.dataset.record);
  if(!c)throw new Error('REVIEW_CASE_NOT_FOUND');return c;
}
$('#grid').addEventListener('click',async e=>{
  const btn=e.target.closest('button');if(!btn)return;
  const card=btn.closest('.card');if(!card)return;
  btn.disabled=true;
  try{
    const c=caseFor(card);
    if(btn.classList.contains('save')||btn.classList.contains('save-next')){
      const resolution={};
      card.querySelectorAll('[data-field]').forEach(el=>{const v=el.value.trim();if(v)resolution[el.dataset.field]=v;});
      const before=filteredCases(),oldIndex=Math.max(0,before.findIndex(x=>x.source_dataset===c.source_dataset&&x.source_record_id===c.source_record_id));
      await state.api.resolve(c,resolution);
      state.data=await state.api.list(state.status);
      const after=filteredCases();
      if(btn.classList.contains('save-next')&&state.single&&after.length){
        setFocus(after[Math.min(oldIndex,after.length-1)]);
      }
      render();banner('Resolution saved. Operational inventory is unchanged.','success');
    }else if(btn.classList.contains('reopen')){
      await state.api.reopen(c);await load();
    }else if(btn.classList.contains('focusone')){
      setFocus(c);render();
    }
  }catch(err){banner('Review action failed: '+(err?.message||String(err)),'danger');}
  finally{btn.disabled=false;}
});
$('[data-status]').forEach(b=>b.addEventListener('click',async()=>{state.status=b.dataset.status;leaveSingle();await load();}));
$('#refresh').addEventListener('click',load);
$('#queueView').addEventListener('click',()=>{leaveSingle();render();});
$('#previousReview').addEventListener('click',()=>moveFocus(-1));
$('#nextReview').addEventListener('click',()=>moveFocus(1));
$('#queueSearch').addEventListener('input',e=>{state.query=e.target.value.trim();if(state.single){const list=filteredCases();if(list.length)setFocus(list[0],{updateUrl:false});}render();});
$('#queueClear').addEventListener('click',()=>{$('#queueSearch').value='';state.query='';render();});
(async()=>{try{
  const qs=new URLSearchParams(location.search),dataset=qs.get('dataset'),record=qs.get('record');
  if(dataset&&record){state.focus={dataset,record};state.single=true;}
  if(qs.get('single')==='1')state.single=true;
  if(!window.RUNLU_V7_CARPET_REVIEW_LOCAL_CONFIG||typeof window.createRunluV7LocalCarpetReviewApi!=='function')throw new Error('DISPOSABLE_CARPET_REVIEW_CONFIG_MISSING');
  state.api=window.createRunluV7LocalCarpetReviewApi(window.RUNLU_V7_CARPET_REVIEW_LOCAL_CONFIG);
  await load();
}catch(e){banner('Carpet Review Workbench is not connected: '+(e?.message||String(e)),'danger');}})();
})();
