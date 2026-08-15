// RUNLU Warehouse AI V6.9.0 Build076 — Warehouse Inbound / Outbound Flow Ledger
(() => {
  if (window.__RUNLU_BUILD076__) return;
  window.__RUNLU_BUILD076__ = true;

  const VERSION='6.9.0', BUILD='076';
  const OPS='runlu_operations_log_v52';
  const RCV='runlu_receiving_v50';
  const COUNT='runlu_count_sessions_v30';

  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const arr=k=>{const v=parse(localStorage.getItem(k)||'null');return Array.isArray(v)?v:[]};
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/\s+/g,' ');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function localDate(y,m,d){return new Date(y,m,d,12,0,0,0)}
  function dateOnly(v){
    if(v instanceof Date&&!isNaN(v))return localDate(v.getFullYear(),v.getMonth(),v.getDate());
    const s=text(v);if(!s)return null;
    let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return localDate(+m[1],+m[2]-1,+m[3]);
    const d=new Date(s);return isNaN(d)?null:localDate(d.getFullYear(),d.getMonth(),d.getDate());
  }
  function addMonths(d,n){return localDate(d.getFullYear(),d.getMonth()+n,d.getDate())}
  function fmtMonth(d){return d.toLocaleDateString(undefined,{month:'short',year:'numeric'})}
  function fmtDate(d){return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
  function rangeLabel(a,b){const last=new Date(b.getFullYear(),b.getMonth(),b.getDate()-1,12);return `${fmtDate(a)} – ${fmtDate(last)}`}

  function inventoryYear(now=new Date()){
    const y=now.getMonth()>=7?now.getFullYear():now.getFullYear()-1;
    return {start:localDate(y,7,1),end:localDate(y+1,7,1),label:`${y}–${String(y+1).slice(-2)}`};
  }
  function periodBounds(now=new Date()){
    const iy=inventoryYear(now),monthStart=localDate(now.getFullYear(),now.getMonth(),1),monthEnd=addMonths(monthStart,1);
    const offset=(now.getFullYear()-iy.start.getFullYear())*12+(now.getMonth()-iy.start.getMonth());
    const h=Math.max(0,Math.min(1,Math.floor(offset/6))),hStart=addMonths(iy.start,h*6),hEnd=addMonths(hStart,6);
    return {
      month:{key:'month',title:'MONTH',name:fmtMonth(monthStart),start:monthStart,end:monthEnd},
      half:{key:'half',title:'HALF-YEAR',name:`H${h+1} · ${fmtMonth(hStart)}–${fmtMonth(new Date(hEnd.getFullYear(),hEnd.getMonth(),0,12))}`,start:hStart,end:hEnd},
      year:{key:'year',title:'INVENTORY YEAR',name:`${iy.label} · Aug 1–Jul 31`,start:iy.start,end:iy.end}
    };
  }

  function canonicalUnit(v){
    const s=norm(v);
    const map={roll:'Roll',rolls:'Roll',carton:'Carton',cartons:'Carton',ctn:'Carton',ctns:'Carton',box:'Box',boxes:'Box',pail:'Pail',pails:'Pail',bucket:'Bucket',buckets:'Bucket',tube:'Tube',tubes:'Tube',pallet:'Pallet',pallets:'Pallet',piece:'Piece',pieces:'Piece',pc:'Piece',pcs:'Piece',foot:'Foot',feet:'Foot',ft:'Foot',sy:'SY','sq yd':'SY','sqyd':'SY','square yard':'SY','square yards':'SY'};
    return map[s]||text(v)||'Unit';
  }
  function qtyFor(x){
    try{if(typeof window.operationStockQuantity==='function'){const q=Number(window.operationStockQuantity(x));if(Number.isFinite(q)&&q>0)return q}}catch{}
    for(const v of [x?.stockQuantity,x?.actualStockQuantity,x?.quantity]){const q=Number(v);if(Number.isFinite(q)&&q>0)return q}
    return 0;
  }
  function unitFor(x){
    try{if(typeof window.operationStockUnit==='function'){const u=text(window.operationStockUnit(x));if(u)return canonicalUnit(u)}}catch{}
    return canonicalUnit(x?.stockUnit||x?.unit||'Unit');
  }
  function completedLine(item,parent){
    if(norm(parent?.status)==='cancelled')return false;
    const s=norm(item?.itemStatus||parent?.itemStatus||parent?.status);
    if(['completed','received'].includes(s))return true;
    return norm(parent?.status)==='completed';
  }
  function transferDirection(route,item,parent){
    const r=norm(route).replace(/->/g,'→');
    if(r){
      const parts=r.split('→').map(x=>x.trim()).filter(Boolean);
      if(parts.length>=2){if(parts[0]==='warehouse'&&parts[1]!=='warehouse')return 'out';if(parts[1]==='warehouse'&&parts[0]!=='warehouse')return 'in'}
    }
    const from=norm(item?.location||parent?.location),to=norm(item?.toLocation||parent?.toLocation),external=/store|installer|branch|customer|supplier/;
    if(external.test(to)&&!external.test(from))return 'out';
    if(external.test(from)&&to)return 'in';
    return '';
  }
  function directionFor(item,parent){
    const type=text(item?.type||parent?.type),t=norm(type);
    if(t==='inventory transfer')return transferDirection(item?.transferRoute||parent?.transferRoute||item?.route||parent?.route,item,parent);
    if(['carpet receiving','supplier pickup / receiving / put-away','customer return','carpet customer return','cut piece return','installer return','sample return'].includes(t))return 'in';
    if(['shipping','return to supplier','rem / remnant transfer','sample checkout'].includes(t))return 'out';
    return '';
  }
  function operationLines(){
    const out=[];
    for(const o of arr(OPS)){
      const d=dateOnly(o?.date||o?.completedAt||o?.appliedAt||o?.createdAt);if(!d)continue;
      const items=Array.isArray(o?.items)&&o.items.length?o.items:[o];
      items.forEach((item,i)=>{
        if(!completedLine(item,o))return;
        const direction=directionFor(item,o);if(!direction)return;
        const qty=qtyFor(item),unit=unitFor(item);if(!(qty>0))return;
        out.push({date:d,direction,qty,unit,type:text(item?.type||o?.type),source:'Operations',id:`op:${o?.id||''}:${i}`,ref:text(o?.po||o?.roll||item?.roll||item?.product||o?.product),product:text(item?.collection||item?.product||o?.collection||o?.product)});
      });
    }
    return out;
  }
  function receivingLines(){
    const out=[];
    for(const r of arr(RCV)){
      const status=norm(r?.status),posted=!!r?.inventoryPosted||['received','put away','completed'].includes(status);
      if(!posted)continue;
      const d=dateOnly(r?.date||r?.created);if(!d)continue;
      const qty=Number(r?.quantity);if(!(Number.isFinite(qty)&&qty>0))continue;
      out.push({date:d,direction:'in',qty,unit:canonicalUnit(r?.unit),type:'Receiving',source:'Receiving',id:`rcv:${r?.id||''}`,ref:text(r?.poNumber||r?.linkedOrder),product:text(r?.product)});
    }
    return out;
  }
  function scanLines(){
    const out=[];
    for(const r of arr(COUNT)){
      const mode=norm(r?.mode);if(!['add','subtract'].includes(mode))continue;
      const d=dateOnly(r?.date||r?.createdAt||r?.created||r?.savedAt);if(!d)continue;
      const qty=Number(r?.quantity);if(!(Number.isFinite(qty)&&qty>0))continue;
      out.push({date:d,direction:mode==='add'?'in':'out',qty,unit:canonicalUnit(r?.unit),type:mode==='add'?'Scan Receiving':'Scan Shipping / Usage',source:'Scan',id:`scan:${r?.id||''}`,ref:text(r?.poNumber),product:text(r?.productName||r?.product)});
    }
    return out;
  }
  function ledgerRows(){return [...operationLines(),...receivingLines(),...scanLines()]}

  function addUnit(map,unit,qty){map[unit]=(map[unit]||0)+Number(qty||0)}
  function summarize(rows,p){
    const xs=rows.filter(x=>x.date>=p.start&&x.date<p.end),incoming={},outgoing={};let inLines=0,outLines=0;
    for(const x of xs){if(x.direction==='in'){inLines++;addUnit(incoming,x.unit,x.qty)}else if(x.direction==='out'){outLines++;addUnit(outgoing,x.unit,x.qty)}}
    return {rows:xs,inLines,outLines,incoming,outgoing};
  }
  function sortedUnits(a,b){return [...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].sort((x,y)=>x.localeCompare(y))}
  function numLabel(n){const v=Number(n||0);return Number.isInteger(v)?String(v):String(Number(v.toFixed(2)))}
  function unitsLabel(map,empty='—'){
    const keys=Object.keys(map||{}).filter(k=>Math.abs(Number(map[k]||0))>0.0001).sort((a,b)=>a.localeCompare(b));
    return keys.length?keys.map(k=>`${numLabel(map[k])} ${k}`).join(' · '):empty;
  }
  function netLabel(s){
    const parts=[];for(const u of sortedUnits(s.incoming,s.outgoing)){const n=Number(s.incoming[u]||0)-Number(s.outgoing[u]||0);if(Math.abs(n)<0.0001)continue;parts.push(`${n>0?'+':''}${numLabel(n)} ${u}`)}return parts.join(' · ')||'0';
  }
  function tile(p,s){
    return `<div class="flow076Tile"><div class="flow076Kicker">${esc(p.title)}</div><div class="flow076Name">${esc(p.name)}</div><div class="flow076Counts"><span class="in">↓ IN <b>${s.inLines}</b></span><span class="out">↑ OUT <b>${s.outLines}</b></span></div><div class="flow076Metric in"><span>Inbound quantity</span><b>${esc(unitsLabel(s.incoming))}</b></div><div class="flow076Metric out"><span>Outbound quantity</span><b>${esc(unitsLabel(s.outgoing))}</b></div><div class="flow076Net"><span>Net by unit</span><b>${esc(netLabel(s))}</b></div><div class="flow076Range">${esc(rangeLabel(p.start,p.end))}</div></div>`;
  }
  function monthlyRows(rows,iy){
    let html='';for(let i=0;i<12;i++){
      const start=addMonths(iy.start,i),end=addMonths(start,1),s=summarize(rows,{start,end});
      html+=`<tr><td>${esc(fmtMonth(start))}</td><td><b>${s.inLines}</b><br><span>${esc(unitsLabel(s.incoming))}</span></td><td><b>${s.outLines}</b><br><span>${esc(unitsLabel(s.outgoing))}</span></td><td>${esc(netLabel(s))}</td></tr>`;
    }return html;
  }
  function sourceSummary(rows,p){
    const xs=rows.filter(x=>x.date>=p.start&&x.date<p.end),g={};
    for(const x of xs){const k=x.source||'Other';g[k]??={in:0,out:0};g[k][x.direction]++}
    return Object.entries(g).sort((a,b)=>(b[1].in+b[1].out)-(a[1].in+a[1].out)).map(([k,v])=>`${esc(k)}: ${v.in} in / ${v.out} out`).join(' · ')||'No flow records yet.';
  }

  function ensureStyle(){
    if(document.getElementById('build076FlowStyle'))return;
    const st=document.createElement('style');st.id='build076FlowStyle';st.textContent=`
      #warehouseFlowLedger{border:1px solid #d9e4f2;background:linear-gradient(145deg,#f8fbff,#fff)}
      .flow076Head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.flow076Head h2{margin:0;font-size:24px}.flow076Intro{font-size:13px;color:#667085;line-height:1.5;margin-top:5px}.flow076Badge{background:#e9f8ef;color:#176b40;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:850;white-space:nowrap}.flow076Grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:13px}.flow076Tile{border:1px solid #e1e7ef;border-radius:15px;padding:13px;background:#fff;min-width:0}.flow076Kicker{font-size:10px;letter-spacing:.08em;font-weight:900;color:#6f7785}.flow076Name{font-size:12px;color:#4d596a;min-height:34px;margin:5px 0 8px}.flow076Counts{display:flex;gap:8px;flex-wrap:wrap;margin:3px 0 8px}.flow076Counts span{padding:5px 8px;border-radius:999px;font-size:11px;font-weight:850}.flow076Counts .in{background:#e9f8ef;color:#176b40}.flow076Counts .out{background:#fff0f1;color:#a52232}.flow076Metric{border-top:1px solid #eef1f5;padding-top:8px;margin-top:8px}.flow076Metric span,.flow076Net span{display:block;font-size:9px;color:#7b8491;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.flow076Metric b,.flow076Net b{display:block;font-size:13px;line-height:1.35;margin-top:3px}.flow076Metric.in b{color:#176b40}.flow076Metric.out b{color:#a52232}.flow076Net{border-top:1px solid #eef1f5;padding-top:8px;margin-top:8px}.flow076Range{font-size:9px;color:#9299a4;margin-top:8px;line-height:1.35}.flow076Details{margin-top:12px;border-top:1px solid #e5eaf1;padding-top:10px}.flow076Details summary{cursor:pointer;font-size:12px;font-weight:850;color:#2563eb}.flow076Table{width:100%;border-collapse:collapse;margin-top:9px;font-size:11px}.flow076Table th,.flow076Table td{padding:7px 5px;border-bottom:1px solid #edf0f4;text-align:left;vertical-align:top}.flow076Table td span{color:#6f7785;line-height:1.35}.flow076Source{margin-top:10px;padding:10px 11px;background:#f7f9fc;border-radius:12px;font-size:11px;color:#687385;line-height:1.45}
      @media(max-width:760px){.flow076Grid{grid-template-columns:1fr}.flow076Name{min-height:0}.flow076Head{display:block}.flow076Badge{display:inline-block;margin-top:8px}}
    `;document.head.appendChild(st);
  }
  function ensureCard(){
    let card=document.getElementById('warehouseFlowLedger');if(card)return card;
    const days=document.getElementById('operationsDaysList');if(!days?.parentNode)return null;
    card=document.createElement('div');card.id='warehouseFlowLedger';card.className='card';days.parentNode.insertBefore(card,days);return card;
  }
  function renderLedger(){
    ensureStyle();const card=ensureCard();if(!card)return;
    const rows=ledgerRows(),p=periodBounds(new Date()),iy=inventoryYear(new Date());
    const m=summarize(rows,p.month),h=summarize(rows,p.half),y=summarize(rows,p.year);
    card.innerHTML=`<div class="flow076Head"><div><h2>📦 Warehouse In / Out Ledger</h2><div class="flow076Intro">Starts every inventory year on Aug 1. Counts completed physical inbound/outbound records already captured by Operations, Receiving and reviewed Scan add/subtract history. Different units stay separate instead of being incorrectly added together.</div></div><div class="flow076Badge">FY ${esc(iy.label)}</div></div><div class="flow076Grid">${tile(p.month,m)}${tile(p.half,h)}${tile(p.year,y)}</div><div class="flow076Source">Current inventory-year sources · ${sourceSummary(rows,p.year)}</div><details class="flow076Details"><summary>Monthly breakdown · Inventory Year ${esc(iy.label)}</summary><table class="flow076Table"><thead><tr><th>Month</th><th>Inbound</th><th>Outbound</th><th>Net by unit</th></tr></thead><tbody>${monthlyRows(rows,iy)}</tbody></table></details>`;
  }
  window.renderWarehouseFlowLedger=renderLedger;

  function setVersion(){
    document.querySelectorAll('.version,#headerVersion').forEach(el=>el.textContent='V'+VERSION);
    document.documentElement.setAttribute('data-runlu-build',BUILD);
  }
  function install(){
    setVersion();ensureStyle();
    const prior=window.renderOperationsDays;
    if(typeof prior==='function'&&!prior.__build076){const wrapped=function(){const r=prior.apply(this,arguments);setTimeout(renderLedger,0);return r};wrapped.__build076=true;wrapped.__original=prior;window.renderOperationsDays=wrapped}
    renderLedger();
  }
  function boot(){
    install();let n=0;const t=setInterval(()=>{install();if(++n>240)clearInterval(t)},250);
    window.addEventListener('storage',e=>{if([OPS,RCV,COUNT].includes(e.key))setTimeout(renderLedger,80)});
    window.addEventListener('pageshow',()=>setTimeout(install,80));
  }
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
