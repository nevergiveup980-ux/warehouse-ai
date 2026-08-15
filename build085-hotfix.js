// RUNLU Warehouse AI V6.11.2 Build085 — Warehouse Ledger Drill-down
(() => {
  if (window.__RUNLU_BUILD085__) return;
  window.__RUNLU_BUILD085__ = true;

  const PAGE='warehouseLedgerDetailPage';
  const OPS='runlu_operations_log_v52';
  const RCV='runlu_receiving_v50';
  const PM='runlu_product_master_v21';
  let active={category:'CARPET',metric:'out',period:'year'};
  let observer=null;

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/\s+/g,' ').trim();
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const arr=k=>{const v=parse(localStorage.getItem(k)||'null');return Array.isArray(v)?v:[]};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localDate=(y,m,d)=>new Date(y,m,d,12,0,0,0);
  const addMonths=(d,n)=>localDate(d.getFullYear(),d.getMonth()+n,d.getDate());
  const today=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999)};
  const fmtDate=d=>d?.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})||'—';

  function dateOnly(v){
    const s=text(v);if(!s)return null;
    const m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return localDate(+m[1],+m[2]-1,+m[3]);
    const d=new Date(s);return isNaN(d)?null:localDate(d.getFullYear(),d.getMonth(),d.getDate());
  }
  function inventoryYear(now=new Date()){
    const y=now.getMonth()>=7?now.getFullYear():now.getFullYear()-1;
    return {start:localDate(y,7,1),end:localDate(y+1,7,1),label:`${y}–${String(y+1).slice(-2)}`};
  }
  function periodBounds(key,now=new Date()){
    const iy=inventoryYear(now);
    if(key==='month'){
      const start=localDate(now.getFullYear(),now.getMonth(),1);
      return {start,end:addMonths(start,1),label:start.toLocaleDateString(undefined,{month:'long',year:'numeric'})};
    }
    if(key==='half'){
      const off=(now.getFullYear()-iy.start.getFullYear())*12+(now.getMonth()-iy.start.getMonth());
      const h=Math.max(0,Math.min(1,Math.floor(off/6))),start=addMonths(iy.start,h*6),end=addMonths(start,6);
      return {start,end,label:`H${h+1} · ${start.toLocaleDateString(undefined,{month:'short',year:'numeric'})}–${new Date(end.getFullYear(),end.getMonth(),0,12).toLocaleDateString(undefined,{month:'short',year:'numeric'})}`};
    }
    return {...iy,label:`FY ${iy.label}`};
  }
  function canonicalUnit(v){
    const s=norm(v),map={carton:'Box',cartons:'Box',ctn:'Box',ctns:'Box',box:'Box',boxes:'Box',roll:'Roll',rolls:'Roll',pail:'Pail',pails:'Pail',bucket:'Bucket',buckets:'Bucket',piece:'Piece',pieces:'Piece',pc:'Piece',pcs:'Piece',tube:'Tube',tubes:'Tube',each:'Each',foot:'Foot',feet:'Foot',ft:'Foot',sy:'SY','sq yd':'SY','sqyd':'SY'};
    return map[s]||text(v)||'Unit';
  }
  function masterMaps(){
    const byId=new Map(),byName=new Map();
    for(const m of arr(PM)){
      if(text(m?.id))byId.set(text(m.id),m);
      for(const n of [m?.name,m?.sku].map(norm).filter(Boolean))if(!byName.has(n))byName.set(n,m);
    }
    return {byId,byName};
  }
  function masterFor(x,maps){
    const id=text(x?.productId||x?.masterId);if(id&&maps.byId.has(id))return maps.byId.get(id);
    for(const n of [x?.product,x?.collection].map(norm).filter(Boolean))if(maps.byName.has(n))return maps.byName.get(n);
    return null;
  }
  function categoryFor(x,maps){
    const t=norm(x?.type),unit=canonicalUnit(x?.stockUnit||x?.unit),hasRoll=!!text(x?.roll||x?.carpetRecordId);
    if(t.includes('carpet')||t==='rem / remnant transfer'||(t==='inventory transfer'&&(hasRoll||unit==='Foot')))return 'CARPET';
    const m=masterFor(x,maps),cat=norm(m?.category),name=norm(m?.name),hay=norm([m?.name,m?.category,m?.series,x?.product,x?.collection].filter(Boolean).join(' '));
    if(cat==='heather choice'||hay.includes('heather choice'))return 'Heather Choice';
    if(cat==='platinum'||name==='platinum'||hay.includes('platinum'))return 'Platinum';
    if(cat==='spill blocker'||hay.includes('spill blocker')||hay.includes('spillblocker'))return 'Spill Blocker';
    if(cat==='vinyl plank')return 'Vinyl Plank';
    if(cat==='carpet tile')return 'Carpet Tile';
    return 'Other';
  }
  function completed(item,parent){
    if(norm(parent?.status)==='cancelled')return false;
    const s=norm(item?.itemStatus||parent?.itemStatus||parent?.status);
    return ['completed','received'].includes(s)||norm(parent?.status)==='completed';
  }
  function stock(item,parent){return norm(item?.inventoryMode||parent?.inventoryMode)==='stock'}
  function transferDirection(x,parent){
    const route=norm(x?.transferRoute||parent?.transferRoute||x?.route||parent?.route).replace(/->/g,'→');
    if(route){const p=route.split('→').map(v=>v.trim()).filter(Boolean);if(p.length>=2){if(p[0]==='warehouse'&&p[1]!=='warehouse')return'out';if(p[1]==='warehouse'&&p[0]!=='warehouse')return'in'}}
    const from=norm(x?.location||parent?.location),to=norm(x?.toLocation||parent?.toLocation),external=/store|installer|branch|customer|supplier/;
    if(external.test(to)&&!external.test(from))return'out';if(external.test(from)&&to)return'in';return'';
  }
  function direction(x,parent){
    const t=norm(x?.type||parent?.type);
    if(t==='carpet cutting')return'out';
    if(['carpet receiving','carpet customer return','cut piece return','installer return'].includes(t))return'in';
    if(t==='rem / remnant transfer')return'out';
    if(!stock(x,parent))return'';
    if(t==='inventory transfer')return transferDirection(x,parent);
    if(['supplier pickup / receiving / put-away','customer return','sample return'].includes(t))return'in';
    if(['shipping','order picking & preparation','order picking','return to supplier','sample checkout'].includes(t))return'out';
    return'';
  }
  function qtyFor(x){
    const t=norm(x?.type);
    if(t==='carpet cutting'){
      const actual=Number(x?.actualStockQuantity);if(actual>0)return actual;
      const req=Number(x?.requestedQuantity??x?.quantity),allow=Number(x?.allowanceInches);
      if(req>0)return Number((req+(Number.isFinite(allow)?allow/12:Math.max(1,Number(x?.numberOfCuts||1))*0.25)).toFixed(4));
    }
    try{if(typeof window.operationStockQuantity==='function'){const q=Number(window.operationStockQuantity(x));if(q>0)return q}}catch{}
    for(const v of [x?.stockQuantity,x?.actualStockQuantity,x?.quantity]){const q=Number(v);if(q>0)return q}return 0;
  }
  function unitFor(x){
    try{if(typeof window.operationStockUnit==='function'){const u=text(window.operationStockUnit(x));if(u)return canonicalUnit(u)}}catch{}
    return canonicalUnit(x?.stockUnit||x?.unit);
  }
  function detailRows(){
    const out=[],maps=masterMaps();
    for(const o of arr(OPS)){
      const d=dateOnly(o?.date||o?.completedAt||o?.appliedAt||o?.createdAt);if(!d||d>today())continue;
      const items=Array.isArray(o?.items)&&o.items.length?o.items:[o];
      items.forEach((raw,i)=>{
        const x=raw===o?o:{...raw,type:raw?.type||o?.type,inventoryMode:raw?.inventoryMode||o?.inventoryMode};
        if(!completed(x,o))return;const dir=direction(x,o);if(!dir)return;
        const q=qtyFor(x);if(!(q>0))return;
        out.push({date:d,direction:dir,qty:q,unit:unitFor(x),category:categoryFor(x,maps),source:'Operations',type:text(x?.type||o?.type),product:text(x?.collection||x?.product||o?.collection||o?.product),colour:text(x?.colour||x?.color||o?.colour||o?.color),roll:text(x?.roll||o?.roll),po:text(x?.po||x?.poNumber||o?.po||o?.poNumber),customer:text(x?.customer||o?.customer),supplier:text(x?.supplier||o?.supplier),location:text(x?.location||o?.location),opId:Number(o?.id)||null,itemIndex:i});
      });
    }
    const seen=new Set(),receiving=arr(RCV).slice().sort((a,b)=>String(a?.date||a?.created||'').localeCompare(String(b?.date||b?.created||'')));
    for(const r of receiving){
      if(!(r?.inventoryPosted===true||norm(r?.inventoryPosted)==='true'))continue;
      const d=dateOnly(r?.date||r?.created);if(!d||d>today())continue;
      const q=Number(r?.quantity);if(!(q>0))continue;
      const m=maps.byId.get(text(r?.masterId||r?.productId));if(!m)continue;
      const rp=norm(r?.product),mn=norm(m?.name),cat=norm(m?.category),generic=['','adhesive','product','material'].includes(rp);
      if(generic?(rp==='adhesive'&&cat!=='adhesive'):!(rp===mn||rp.includes(mn)||mn.includes(rp)))continue;
      const unit=canonicalUnit(r?.unit),strict=cat==='heather choice'||cat==='platinum'||cat==='spill blocker'||norm(m?.name)==='heather choice'||norm(m?.name)==='platinum'||norm(m?.name).includes('spill blocker');
      if(strict&&unit!=='Roll')continue;
      const dedupe=[norm(r?.poNumber),norm(r?.product||m?.name),q,unit,fmtDate(d)].join('|');if(seen.has(dedupe))continue;seen.add(dedupe);
      out.push({date:d,direction:'in',qty:q,unit,category:categoryFor({...r,productId:m?.id,type:'Receiving'},maps),source:'Receiving',type:'Receiving',product:text(r?.product||m?.name),colour:text(r?.colour||r?.color),roll:text(r?.roll),po:text(r?.poNumber||r?.po),customer:text(r?.customer),supplier:text(r?.supplier),location:text(r?.location),opId:null});
    }
    return out;
  }
  function within(x,p){return x.date>=p.start&&x.date<p.end&&x.date<=today()}
  function selectedPeriod(){return document.querySelector('#warehouseFlowLedger .flow078Btns button.active')?.dataset?.p||'year'}
  const num=n=>Number.isInteger(Number(n))?String(Number(n)):String(Number(Number(n).toFixed(2)));
  function feet(v){const i=Math.round(Math.abs(Number(v||0))*12),f=Math.floor(i/12),r=i%12;return `${f}'${r?r+'"':''}`}
  function qtyText(q,u){return u==='Foot'?feet(q):`${num(q)} ${u}`}
  function signedQty(row){return `${row.direction==='in'?'+':'-'}${qtyText(row.qty,row.unit)}`}
  function totals(rows,metric){
    if(metric==='usedup')return `${rows.length} Roll`;
    const map={};rows.forEach(r=>map[r.unit]=(map[r.unit]||0)+(metric==='net'?(r.direction==='in'?r.qty:-r.qty):r.qty));
    const parts=Object.keys(map).sort().filter(k=>Math.abs(map[k])>.0001).map(k=>{
      const v=map[k],sign=metric==='net'?(v>0?'+':'-'):'';
      return `${sign}${k==='Foot'?feet(v):num(Math.abs(v))+' '+k}`;
    });
    return parts.join(' · ')||'0';
  }

  function ensureStyle(){
    if(document.getElementById('build085DrillStyle'))return;
    const s=document.createElement('style');s.id='build085DrillStyle';s.textContent=`
      #warehouseFlowLedger td.drill085{cursor:pointer;position:relative;border-radius:10px;transition:background .12s}
      #warehouseFlowLedger td.drill085:active{background:#edf4ff}
      #warehouseFlowLedger td.drill085::after{content:'›';display:inline-block;margin-left:5px;color:#7a8ba5;font-weight:900}
      #warehouseFlowLedger td.drill085.usedUp084Cell b{color:#8b5a00}
      .drill085Hint{font-size:10px;color:#667085;margin:6px 0 2px;line-height:1.4}
      #${PAGE} .drill085Head{border:1px solid #d9e4f2;background:linear-gradient(145deg,#f8fbff,#fff)}
      .drill085Back{background:transparent;color:#2563eb;padding:2px 0 9px;font-size:14px;font-weight:850}
      .drill085Title{font-size:24px;font-weight:900;margin:0}.drill085Meta{font-size:12px;color:#667085;line-height:1.45;margin-top:5px}
      .drill085Total{margin-top:12px;border-radius:14px;background:#f4f7fb;padding:12px}.drill085Total small{display:block;font-size:10px;color:#6f7785;text-transform:uppercase;font-weight:850}.drill085Total b{display:block;font-size:22px;margin-top:4px}
      .drill085List{padding:0 15px}.drill085Row{border-top:1px solid #e7ebf1;padding:13px 0}.drill085Row:first-child{border-top:0}.drill085Top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.drill085Date{font-size:12px;color:#687385}.drill085Type{font-size:17px;font-weight:900;margin-top:2px}.drill085Qty{font-size:18px;font-weight:900;white-space:nowrap}.drill085Qty.in{color:#176b40}.drill085Qty.out{color:#a52232}.drill085Product{font-size:15px;font-weight:800;margin-top:6px}.drill085Sub{font-size:11px;color:#6f7785;line-height:1.45;margin-top:4px}.drill085Open{margin-top:8px;padding:7px 9px;background:#eef4ff;color:#244da0;font-size:11px;font-weight:850}
      @media(max-width:560px){#warehouseFlowLedger td.drill085::after{margin-left:2px}.drill085Title{font-size:21px}.drill085Qty{font-size:16px}}
    `;document.head.appendChild(s);
  }
  function go(id){
    try{if(typeof window.showPage==='function')window.showPage(id);else{document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));document.getElementById(id)?.classList.remove('hidden')}}catch{}
    setTimeout(()=>window.scrollTo({top:0,behavior:'auto'}),20);
  }
  function ensurePage(){
    let p=document.getElementById(PAGE);if(p)return p;
    const main=document.querySelector('main');if(!main)return null;
    p=document.createElement('section');p.id=PAGE;p.className='page hidden';
    p.innerHTML=`<div class="card drill085Head"><button type="button" class="drill085Back">‹ Back to Warehouse Ledger</button><h2 class="drill085Title">Ledger Detail</h2><div class="drill085Meta"></div><div class="drill085Total"><small>Total</small><b>—</b></div></div><div id="drill085List" class="card drill085List"></div>`;
    main.appendChild(p);p.querySelector('.drill085Back')?.addEventListener('click',()=>go('warehouseLedgerPage'));return p;
  }
  function usedUpRows(period){
    const api=window.runluCarpetUsedUpLedger,events=api?.events?.()||[],p=periodBounds(period);
    return events.filter(x=>x?.date&&x.date>=p.start&&x.date<p.end&&x.date<=today()).map(x=>({date:x.date,roll:text(x.roll),direction:'usedup',qty:1,unit:'Roll',category:'CARPET',source:'Carpet Lifecycle',type:'Used Up',product:'Carpet Roll'}));
  }
  function rowsFor(category,metric,period){
    if(metric==='usedup')return category==='CARPET'?usedUpRows(period):[];
    const p=periodBounds(period);let rows=detailRows().filter(r=>r.category===category&&within(r,p));
    if(metric==='in')rows=rows.filter(r=>r.direction==='in');
    if(metric==='out')rows=rows.filter(r=>r.direction==='out');
    return rows.sort((a,b)=>b.date-a.date);
  }
  function renderDetail(){
    ensureStyle();const page=ensurePage();if(!page)return;
    const rows=rowsFor(active.category,active.metric,active.period),p=periodBounds(active.period),label={in:'IN',out:'OUT',net:'Net',usedup:'Used Up'}[active.metric]||active.metric;
    page.querySelector('.drill085Title').textContent=`${active.category} · ${label}`;
    page.querySelector('.drill085Meta').textContent=`${p.label} · ${rows.length} record${rows.length===1?'':'s'} · tap values in the summary table to switch drill-down.`;
    page.querySelector('.drill085Total b').textContent=totals(rows,active.metric);
    const list=page.querySelector('#drill085List');
    if(!rows.length){list.innerHTML='<div class="empty">No matching stock-movement records in this period.</div>';return}
    list.innerHTML=rows.map(r=>{
      const meta=[r.roll&&`Roll ${r.roll}`,r.po&&`PO ${r.po}`,r.customer&&`Customer: ${r.customer}`,r.supplier&&`Supplier: ${r.supplier}`,r.location&&`Location ${r.location}`].filter(Boolean).join(' · ');
      const q=active.metric==='net'?signedQty(r):(active.metric==='usedup'?'1 Roll':qtyText(r.qty,r.unit));
      const cls=r.direction==='in'?'in':r.direction==='out'?'out':'';
      const open=r.source==='Operations'&&r.opId?`<button class="drill085Open" data-op="${r.opId}" data-date="${esc(r.date.toISOString().slice(0,10))}">Open work record</button>`:'';
      return `<div class="drill085Row"><div class="drill085Top"><div><div class="drill085Date">${esc(fmtDate(r.date))}</div><div class="drill085Type">${esc(r.type)}</div></div><div class="drill085Qty ${cls}">${esc(q)}</div></div><div class="drill085Product">${esc([r.product,r.colour].filter(Boolean).join(' · ')||r.roll||active.category)}</div>${meta?`<div class="drill085Sub">${esc(meta)}</div>`:''}${open}</div>`;
    }).join('');
    list.querySelectorAll('.drill085Open').forEach(b=>b.addEventListener('click',()=>{const id=Number(b.dataset.op),date=b.dataset.date;if(typeof window.openOperationsDay==='function'&&id){window.openOperationsDay(date,[id])}}));
  }
  function openDetail(category,metric,period){active={category,metric,period};renderDetail();go(PAGE)}
  function majorDetails(){return [...document.querySelectorAll('#warehouseFlowLedger details.flow078Details')].find(d=>/major\s+category\s+summary/i.test(text(d.querySelector('summary')?.textContent)))||null}
  function augment(){
    ensureStyle();ensurePage();const details=majorDetails();if(!details)return;
    const table=details.querySelector('table.flow078Table');if(!table)return;
    table.querySelectorAll('tbody tr').forEach(tr=>{
      const category=text(tr.cells?.[0]?.textContent);if(!category)return;
      [['in',tr.cells?.[1]],['out',tr.cells?.[2]],['net',tr.cells?.[3]]].forEach(([metric,cell])=>{if(!cell)return;cell.classList.add('drill085');cell.dataset.metric=metric;cell.dataset.category=category;cell.tabIndex=0;cell.setAttribute('role','button')});
      const used=tr.querySelector('.usedUp084Cell');if(used&&category==='CARPET'){used.classList.add('drill085');used.dataset.metric='usedup';used.dataset.category=category;used.tabIndex=0;used.setAttribute('role','button')}
    });
    let hint=details.querySelector('.drill085Hint');if(!hint){hint=document.createElement('div');hint.className='drill085Hint';hint.textContent='Tap IN, OUT, Net or CARPET Used Up to see the underlying records.';details.querySelector('.flow078Btns')?.insertAdjacentElement('afterend',hint)}
    const ledger=document.getElementById('warehouseFlowLedger');
    if(ledger&&!ledger.dataset.drill085Bound){ledger.dataset.drill085Bound='1';ledger.addEventListener('click',e=>{const c=e.target.closest('td.drill085');if(!c)return;openDetail(c.dataset.category,c.dataset.metric,selectedPeriod())});ledger.addEventListener('keydown',e=>{const c=e.target.closest('td.drill085');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDetail(c.dataset.category,c.dataset.metric,selectedPeriod())}})}
  }
  function watch(){const ledger=document.getElementById('warehouseFlowLedger');if(!ledger||observer)return;observer=new MutationObserver(()=>queueMicrotask(augment));observer.observe(ledger,{childList:true,subtree:true})}
  function install(){augment();watch()}
  function boot(){install();let n=0;const t=setInterval(()=>{install();if(++n>240)clearInterval(t)},250);window.addEventListener('pageshow',()=>setTimeout(install,80));window.addEventListener('storage',()=>setTimeout(augment,100))}

  window.openWarehouseLedgerDetail=openDetail;
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
