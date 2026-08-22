// RUNLU Warehouse OS Build095 · Stock Receiving → Inventory → Accounting guard.
// Training only. Stock receipts require an exact Warehouse inventory target before posting.
(() => {
  const ENV='training', PENDING_KEY='runlu_flooring_stock_post_pending_v095';
  let centralTasks=[];
  const q=id=>document.getElementById(id);
  const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
  const num=v=>{const m=String(v??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN};

  async function session(){return typeof cloudEnsureSession==='function'?cloudEnsureSession():null}
  async function api(path,options={}){
    const s=await session();if(!s)throw new Error('Warehouse Cloud sign-in is required. Open Settings → Cloud Sync and sign in first.');
    return cloudRequest(path,{...options,headers:options.headers||cloudHeaders(s.access_token,options.json!==false)});
  }
  function pending(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'{}')}catch{return {}}}
  function savePending(x){localStorage.setItem(PENDING_KEY,JSON.stringify(x))}
  function isOverdue(t){return !!(t.requested_date&&t.requested_date<new Date().toISOString().slice(0,10)&&['Scheduled','In Progress','Picked Up'].includes(t.status))}

  function inventoryRows(){
    try{return loadInventoryRecords().filter(r=>typeof isCurrentGeneralInventoryRecord==='function'?isCurrentGeneralInventoryRecord(r):true)}catch{return []}
  }
  function masterRows(){try{return loadMasters()}catch{return []}}
  function invLabel(r,masters){
    const m=masters.find(x=>String(x.id)===String(r.masterId))||{};
    return `${m.name||'Product'}${m.color?' · '+m.color:''}${m.sku?' · '+m.sku:''} — ${r.location||'No location'} — ${Number(r.quantity||0)} ${r.unit||''} — ID ${r.inventoryId||r.id||'—'}`;
  }
  function exactAutoTarget(item,inv,masters){
    const matches=inv.filter(r=>{const m=masters.find(x=>String(x.id)===String(r.masterId))||{};const style=norm(item.style),colour=norm(item.colour);const styleOk=style&&(norm(m.name)===style||norm(m.sku)===style);const colourOk=!colour||norm(m.color)===colour;return styleOk&&colourOk});
    return matches.length===1?String(inventoryRecordIdentity(matches[0])):'';
  }
  function targetOptions(selected,inv,masters){
    return '<option value="">— Choose exact Warehouse inventory record —</option>'+inv.map(r=>{const id=String(inventoryRecordIdentity(r));return `<option value="${safe(id)}" ${id===selected?'selected':''}>${safe(invLabel(r,masters))}</option>`}).join('');
  }

  function injectPostingPanel(){
    const page=q('supplierPickupExec');if(!page||q('fspStockPosting'))return;
    const wrap=document.createElement('div');wrap.id='fspStockPosting';wrap.innerHTML='<div class="sectionTitle">Stock Inventory Posting</div><div id="fspStockPostingList"></div>';
    page.appendChild(wrap);
  }

  function renderPosting(){
    injectPostingPanel();const el=q('fspStockPostingList');if(!el)return;
    const masters=masterRows(),inv=inventoryRows();
    const rows=centralTasks.filter(t=>t.purchase_type==='Stock'&&['Ready','Completed'].includes(t.status));
    if(!rows.length){el.innerHTML='<div class="card"><div class="empty">No received Stock Inventory is waiting for posting.</div></div>';return}
    el.innerHTML=rows.map(t=>{
      const posted=t.inventory_post_status==='Posted'||!!t.inventory_posted_at;
      const posting=t.inventory_post_status==='Posting'&&!posted;
      const received=Array.isArray(t.received_items)?t.received_items:[];
      const items=Array.isArray(t.items)?t.items:[];
      const lines=items.map((x,i)=>{const r=received[i]||{},auto=exactAutoTarget(x,inv,masters),amount=Number.isFinite(num(r.received_qty))?num(r.received_qty):'';return `<div class="item"><div class="name" style="font-size:15px">${safe(x.style||'Item')} ${x.colour?'· '+safe(x.colour):''}</div><div class="meta">Ordered: ${safe(x.qty||'—')} · Received: <b>${safe(r.received_qty||'—')}</b>${r.condition?' · '+safe(r.condition):''}</div>${posted?'':`<div class="formgrid"><div class="full"><label>Exact Warehouse Inventory Target</label><select id="stockTarget-${t.id}-${i}">${targetOptions(auto,inv,masters)}</select></div><div><label>Quantity to Add</label><input id="stockQty-${t.id}-${i}" type="number" step="0.01" min="0" value="${safe(amount)}"></div><div><label>Source PO</label><input value="${safe(t.po_number)}" disabled></div></div>`}</div>`}).join('');
      const state=posted?`<div class="notice" style="background:#e9f8ef;color:#176b40"><b>Posted to Warehouse Inventory</b><br>${t.inventory_posted_at?new Date(t.inventory_posted_at).toLocaleString():''}. Accounting may now move a matched receipt to Ready to Pay.</div>`:posting?'<div class="notice" style="background:#fff6e8;color:#8b5a00"><b>Posting is being finalized.</b> Do not add this receipt a second time.</div>':'<div class="notice"><b>Guarded posting:</b> choose the exact current Warehouse inventory record for every received line. No fuzzy product match is allowed.</div>';
      return `<div class="card"><div class="name">PO #${safe(t.po_number)} · ${safe(t.supplier)}</div><div class="meta">Stock Inventory · Warehouse ${safe(t.status)} · Accounting ${safe(t.accounting_status||'Pending')}</div>${state}<div class="sectionTitle">Received Lines</div>${lines}${posted?'':`<div class="actions"><button class="green" onclick="postFlooringStockReceipt('${t.id}')" ${posting?'disabled':''}>Post Received Stock to Inventory</button></div>`}</div>`;
    }).join('');
  }

  async function loadCentral(){
    try{
      await api('/rest/v1/rpc/flooring_flag_overdue_supplier_tasks',{method:'POST',body:JSON.stringify({p_environment:ENV})});
      centralTasks=await api('/rest/v1/flooring_supplier_tasks?select=*&environment=eq.'+ENV+'&order=requested_date.asc,created_at.asc',{json:false});
      if(!Array.isArray(centralTasks))centralTasks=[];
      decorateOverdue();renderPosting();await finalizePendingPosts();
    }catch(e){console.warn('Build095 central refresh:',e.message)}
  }

  function decorateOverdue(){
    centralTasks.filter(isOverdue).forEach(t=>{const card=document.querySelector(`[data-task="${CSS.escape(t.id)}"]`);if(!card||card.querySelector('.runluOverdueNotice'))return;const n=document.createElement('div');n.className='notice runluOverdueNotice';n.style.cssText='margin-top:8px;background:#fff0f1;color:#9f2633';n.innerHTML=`<b>OVERDUE · ${safe(t.requested_date)}</b><br>Requested date has passed. Update the Warehouse status now, or choose Delayed and enter the reason so Sales receives the explanation.`;card.insertBefore(n,card.querySelector('.sectionTitle'))})
  }

  function postingPayload(t){
    const inv=inventoryRows(),masters=masterRows(),received=Array.isArray(t.received_items)?t.received_items:[],items=Array.isArray(t.items)?t.items:[];
    return items.map((x,i)=>{
      const identity=q(`stockTarget-${t.id}-${i}`)?.value||'';const amount=Number(q(`stockQty-${t.id}-${i}`)?.value||0);
      const record=findInventoryRecordByIdentity(inv,identity);const count=inventoryRecordIdentityMatchCount(inv,identity);
      if(!identity||count!==1||!record)throw new Error(`Line ${i+1}: choose one exact, unique Warehouse inventory record.`);
      if(!Number.isFinite(amount)||amount<=0)throw new Error(`Line ${i+1}: enter a quantity greater than 0.`);
      const master=masters.find(m=>String(m.id)===String(record.masterId))||{};
      return {line:i+1,inventory_id:identity,master_id:record.masterId,product:master.name||x.style||'Item',colour:master.color||x.colour||'',location:record.location||'',unit:record.unit||'',quantity:Number(amount.toFixed(2)),received_qty:received[i]?.received_qty||'',before_quantity:Number(record.quantity||0)};
    });
  }

  async function finalizePendingPosts(){
    const p=pending();for(const [taskId,x] of Object.entries(p)){
      const t=centralTasks.find(r=>r.id===taskId);if(!t){continue}if(t.inventory_post_status==='Posted'||t.inventory_posted_at){delete p[taskId];savePending(p);continue}
      try{await api('/rest/v1/rpc/flooring_finish_inventory_post',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:taskId,p_claim:x.claim,p_postings:x.postings})});delete p[taskId];savePending(p)}catch(e){console.warn('Pending inventory finalization:',e.message)}
    }
  }

  window.postFlooringStockReceipt=async function(id){
    const t=centralTasks.find(x=>x.id===id);if(!t)return;
    const existing=pending()[id];if(existing){await finalizePendingPosts();await loadCentral();return}
    let postings;try{postings=postingPayload(t)}catch(e){alert(e.message);return}
    const summary=postings.map(x=>`${x.product}${x.colour?' · '+x.colour:''}: +${x.quantity} ${x.unit} → ${x.location} (ID ${x.inventory_id})`).join('\n');
    if(!confirm(`Post this received Stock Inventory?\n\nPO #${t.po_number} · ${t.supplier}\n\n${summary}\n\nThis adds quantity to the exact selected Warehouse records and cannot be posted twice.`))return;
    let claim='';
    try{
      const begin=await api('/rest/v1/rpc/flooring_begin_inventory_post',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:id})});claim=begin?.claim_id||begin?.[0]?.claim_id||'';if(!claim)throw new Error('Central posting claim was not returned.');
      const before=loadInventoryRecords(),inv=JSON.parse(JSON.stringify(before));
      postings.forEach(p=>{const r=findInventoryRecordByIdentity(inv,p.inventory_id);if(inventoryRecordIdentityMatchCount(inv,p.inventory_id)!==1||!r)throw new Error('Exact inventory target changed before posting. Nothing was posted.');p.before_quantity=Number(r.quantity||0);r.quantity=Number((p.before_quantity+p.quantity).toFixed(2));p.after_quantity=r.quantity;r.lastReceiptPoNumber=String(t.po_number);r.lastReceiptSupplier=t.supplier||'';r.lastReceiptTaskId=t.id;r.lastUpdatedAt=new Date().toISOString();r.updated=new Date().toLocaleString();r.lastAction='Stock received from Flooring Supplier Pickup';});
      if(!save(INVDB,inv))throw new Error('Warehouse inventory save failed.');
      const events=load(EVENTDB);postings.forEach(p=>events.unshift({id:Date.now()+Math.random(),time:new Date().toISOString(),type:'Supplier Stock Receipt Posted',reference:String(t.po_number),result:`PO #${t.po_number} · ${t.supplier} · ${p.product}${p.colour?' · '+p.colour:''} · +${p.quantity} ${p.unit} · ${p.before_quantity} → ${p.after_quantity} · ${p.location}`,inventoryId:p.inventory_id,masterId:p.master_id,supplierTaskId:t.id,poNumber:String(t.po_number)}));
      if(!save(EVENTDB,events)){save(INVDB,before);throw new Error('Audit history save failed; inventory was restored.');}
      const pend=pending();pend[id]={claim,postings,localPostedAt:new Date().toISOString()};savePending(pend);
      try{await api('/rest/v1/rpc/flooring_finish_inventory_post',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:id,p_claim:claim,p_postings:postings})});delete pend[id];savePending(pend)}catch(e){alert('Warehouse inventory was saved, but central confirmation is pending. Do NOT post this receipt again. The app will retry automatically.\n\n'+e.message);return}
      try{renderInventory();renderProducts();renderDashboard();renderMap();refreshMemory()}catch(_){ }
      alert('Stock receipt posted to Warehouse Inventory. Flooring OS / Accounting now shows Inventory Posted.');await loadCentral();
    }catch(e){if(claim){try{await api('/rest/v1/rpc/flooring_cancel_inventory_post',{method:'POST',body:JSON.stringify({p_environment:ENV,p_id:id,p_claim:claim})})}catch(_){ }}alert('Stock posting blocked: '+e.message)}
  };

  function wrapRefresh(){
    const old=window.refreshFlooringSupplierTasks;if(typeof old!=='function'||old.__build095)return;
    const wrapped=async function(){const r=await old.apply(this,arguments);await loadCentral();return r};wrapped.__build095=true;window.refreshFlooringSupplierTasks=wrapped;
  }
  function boot(){injectPostingPanel();wrapRefresh();setTimeout(loadCentral,500);const obs=new MutationObserver(()=>{injectPostingPanel();wrapRefresh()});obs.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();