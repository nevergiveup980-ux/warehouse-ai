// RUNLU Warehouse AI V6.9.2 Build078 — Stock-only Flow Ledger + Unit Normalization
(() => {
  if (window.__RUNLU_BUILD078__) return;
  window.__RUNLU_BUILD078__ = true;

  const VERSION='6.9.2', BUILD='078';
  const OPS='runlu_operations_log_v52';
  const RCV='runlu_receiving_v50';
  const PM='runlu_product_master_v21';
  const PRIMARY=['CARPET','Heather Choice','Platinum','Spill Blocker','Vinyl Plank','Carpet Tile'];
  let categoryPeriod='year';

  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const arr=k=>{const v=parse(localStorage.getItem(k)||'null');return Array.isArray(v)?v:[]};
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/\s+/g,' ').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999)};
  const localDate=(y,m,d)=>new Date(y,m,d,12,0,0,0);
  const addMonths=(d,n)=>localDate(d.getFullYear(),d.getMonth()+n,d.getDate());
  const fmtMonth=d=>d.toLocaleDateString(undefined,{month:'short',year:'numeric'});
  const fmtDate=d=>d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  function dateOnly(v){
    const s=text(v);if(!s)return null;
    let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return localDate(+m[1],+m[2]-1,+m[3]);
    const d=new Date(s);return isNaN(d)?null:localDate(d.getFullYear(),d.getMonth(),d.getDate());
  }
  function inventoryYear(now=new Date()){
    const y=now.getMonth()>=7?now.getFullYear():now.getFullYear()-1;
    return {start:localDate(y,7,1),end:localDate(y+1,7,1),label:`${y}–${String(y+1).slice(-2)}`};
  }
  function periods(now=new Date()){
    const iy=inventoryYear(now),ms=localDate(now.getFullYear(),now.getMonth(),1),me=addMonths(ms,1);
    const off=(now.getFullYear()-iy.start.getFullYear())*12+(now.getMonth()-iy.start.getMonth());
    const h=Math.max(0,Math.min(1,Math.floor(off/6))),hs=addMonths(iy.start,h*6),he=addMonths(hs,6);
    return {
      month:{title:'MONTH',name:fmtMonth(ms),start:ms,end:me},
      half:{title:'HALF-YEAR',name:`H${h+1} · ${fmtMonth(hs)}–${fmtMonth(new Date(he.getFullYear(),he.getMonth(),0,12))}`,start:hs,end:he},
      year:{title:'INVENTORY YEAR',name:`${iy.label} · Aug 1–Jul 31`,start:iy.start,end:iy.end}
    };
  }
  function canonicalUnit(v){
    const s=norm(v);
    const map={carton:'Box',cartons:'Box',ctn:'Box',ctns:'Box',box:'Box',boxes:'Box',roll:'Roll',rolls:'Roll',pail:'Pail',pails:'Pail',bucket:'Bucket',buckets:'Bucket',piece:'Piece',pieces:'Piece',pc:'Piece',pcs:'Piece',tube:'Tube',tubes:'Tube',each:'Each',foot:'Foot',feet:'Foot',ft:'Foot',sy:'SY','sq yd':'SY','sqyd':'SY'};
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
  function operationLines(){
    const out=[],maps=masterMaps();
    for(const o of arr(OPS)){
      const d=dateOnly(o?.date||o?.completedAt||o?.appliedAt||o?.createdAt);if(!d||d>today())continue;
      const items=Array.isArray(o?.items)&&o.items.length?o.items:[o];
      items.forEach((raw,i)=>{
        const x=raw===o?o:{...raw,type:raw?.type||o?.type,inventoryMode:raw?.inventoryMode||o?.inventoryMode};
        if(!completed(x,o))return;const dir=direction(x,o);if(!dir)return;
        const q=qtyFor(x);if(!(q>0))return;
        out.push({date:d,direction:dir,qty:q,unit:unitFor(x),category:categoryFor(x,maps),source:'Operations',id:`op:${o?.id||''}:${i}`,type:text(x?.type||o?.type),product:text(x?.collection||x?.product||o?.collection||o?.product)});
      });
    }
    return out;
  }
  function genericProductName(v){return ['','adhesive','product','material'].includes(norm(v))}
  function validReceivingIdentity(r,m){
    if(!m)return false;
    const rp=norm(r?.product),mn=norm(m?.name),cat=norm(m?.category);
    if(genericProductName(rp))return rp!=='adhesive'||cat==='adhesive';
    return rp===mn||rp.includes(mn)||mn.includes(rp);
  }
  function strictRollProgram(m){const c=norm(m?.category),n=norm(m?.name);return c==='heather choice'||c==='platinum'||c==='spill blocker'||n==='heather choice'||n==='platinum'||n.includes('spill blocker')}
  function receivingLines(){
    const maps=masterMaps(),out=[],seen=new Set();
    const rows=arr(RCV).slice().sort((a,b)=>String(a?.date||a?.created||'').localeCompare(String(b?.date||b?.created||'')));
    for(const r of rows){
      if(!(r?.inventoryPosted===true||norm(r?.inventoryPosted)==='true'))continue;
      const d=dateOnly(r?.date||r?.created);if(!d||d>today())continue;
      const q=Number(r?.quantity);if(!(q>0))continue;
      const m=maps.byId.get(text(r?.masterId||r?.productId));if(!validReceivingIdentity(r,m))continue;
      const unit=canonicalUnit(r?.unit);if(strictRollProgram(m)&&unit!=='Roll')continue;
      const dedupe=[norm(r?.poNumber),norm(r?.product||m?.name),q,unit,fmtDate(d)].join('|');if(seen.has(dedupe))continue;seen.add(dedupe);
      out.push({date:d,direction:'in',qty:q,unit,category:categoryFor({...r,productId:m?.id,type:'Receiving'},maps),source:'Receiving',id:`rcv:${r?.id||''}`,type:'Receiving',product:text(r?.product||m?.name)});
    }
    return out;
  }
  function ledgerRows(){return [...operationLines(),...receivingLines()]}
  function add(map,u,q){map[u]=(map[u]||0)+Number(q||0)}
  function summarize(rows,p){
    const cap=today(),xs=rows.filter(x=>x.date>=p.start&&x.date<p.end&&x.date<=cap),incoming={},outgoing={};let inLines=0,outLines=0;
    xs.forEach(x=>{if(x.direction==='in'){inLines++;add(incoming,x.unit,x.qty)}else{outLines++;add(outgoing,x.unit,x.qty)}});return{rows:xs,inLines,outLines,incoming,outgoing};
  }
  const num=n=>Number.isInteger(Number(n))?String(Number(n)):String(Number(Number(n).toFixed(2)));
  function feet(v){const i=Math.round(Math.abs(Number(v||0))*12),f=Math.floor(i/12),r=i%12;return `${f}'${r?r+'"':''}`}
  function units(map){const ks=Object.keys(map||{}).filter(k=>Math.abs(map[k])>.0001).sort();return ks.length?ks.map(k=>k==='Foot'?feet(map[k]):`${num(map[k])} ${k}`).join(' · '):'—'}
  function net(s){const ks=[...new Set([...Object.keys(s.incoming),...Object.keys(s.outgoing)])].sort(),a=[];for(const k of ks){const n=Number(s.incoming[k]||0)-Number(s.outgoing[k]||0);if(Math.abs(n)<.0001)continue;a.push(`${n>0?'+':'-'}${k==='Foot'?feet(n):num(Math.abs(n))+' '+k}`)}return a.join(' · ')||'0'}
  function range(p){const end=new Date(Math.min(p.end.getTime()-86400000,today().getTime()));return `${fmtDate(p.start)} – ${fmtDate(end)}`}
  function tile(p,s){return `<div class="flow078Tile"><div class="flow078K">${esc(p.title)}</div><div class="flow078N">${esc(p.name)}</div><div class="flow078C"><span class="in">↓ IN <b>${s.inLines}</b></span><span class="out">↑ OUT <b>${s.outLines}</b></span></div><div class="flow078M in"><small>Inbound quantity</small><b>${esc(units(s.incoming))}</b></div><div class="flow078M out"><small>Outbound quantity</small><b>${esc(units(s.outgoing))}</b></div><div class="flow078M"><small>Net by unit</small><b>${esc(net(s))}</b></div><div class="flow078R">${esc(range(p))}</div></div>`}
  function catRows(rows,p){return PRIMARY.map(c=>{const s=summarize(rows.filter(x=>x.category===c),p);return `<tr><td><b>${esc(c)}</b></td><td>${s.inLines}<br><span>${esc(units(s.incoming))}</span></td><td>${s.outLines}<br><span>${esc(units(s.outgoing))}</span></td><td>${esc(net(s))}</td></tr>`}).join('')}
  function monthRows(rows,iy){let h='';for(let i=0;i<12;i++){const s=addMonths(iy.start,i),e=addMonths(s,1),z=summarize(rows,{start:s,end:e});h+=`<tr><td>${esc(fmtMonth(s))}</td><td>${z.inLines}<br><span>${esc(units(z.incoming))}</span></td><td>${z.outLines}<br><span>${esc(units(z.outgoing))}</span></td><td>${esc(net(z))}</td></tr>`}return h}
  function ensureStyle(){if(document.getElementById('build078Style'))return;const s=document.createElement('style');s.id='build078Style';s.textContent=`#warehouseFlowLedger{border:1px solid #d9e4f2;background:linear-gradient(145deg,#f8fbff,#fff)}.flow078Head{display:flex;justify-content:space-between;gap:12px}.flow078Head h2{margin:0;font-size:24px}.flow078Intro{font-size:13px;color:#667085;line-height:1.5;margin-top:5px}.flow078Badge{background:#e9f8ef;color:#176b40;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:850;height:max-content}.flow078Grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:13px}.flow078Tile{border:1px solid #e1e7ef;border-radius:15px;padding:13px;background:#fff}.flow078K{font-size:10px;letter-spacing:.08em;font-weight:900;color:#6f7785}.flow078N{font-size:12px;color:#4d596a;margin:5px 0 8px}.flow078C{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.flow078C span{padding:5px 8px;border-radius:999px;font-size:11px;font-weight:850}.flow078C .in{background:#e9f8ef;color:#176b40}.flow078C .out{background:#fff0f1;color:#a52232}.flow078M{border-top:1px solid #eef1f5;padding-top:8px;margin-top:8px}.flow078M small{display:block;font-size:9px;color:#7b8491;font-weight:800;text-transform:uppercase}.flow078M b{display:block;font-size:13px;line-height:1.35;margin-top:3px}.flow078M.in b{color:#176b40}.flow078M.out b{color:#a52232}.flow078R{font-size:9px;color:#9299a4;margin-top:8px}.flow078Details{margin-top:12px;border-top:1px solid #e5eaf1;padding-top:10px}.flow078Table{width:100%;border-collapse:collapse;margin-top:9px;font-size:11px}.flow078Table th,.flow078Table td{padding:7px 5px;border-bottom:1px solid #edf0f4;text-align:left;vertical-align:top}.flow078Table td span{color:#6f7785}.flow078Btns{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.flow078Btns button{border:1px solid #d7deea;background:#fff;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800}.flow078Btns button.active{background:#14264a;color:#fff}.flow078Note{margin-top:10px;padding:10px 11px;background:#f7f9fc;border-radius:12px;font-size:11px;color:#687385;line-height:1.45}@media(max-width:760px){.flow078Grid{grid-template-columns:1fr}.flow078Head{display:block}.flow078Badge{display:inline-block;margin-top:8px}}`;document.head.appendChild(s)}
  function ensureCard(){let c=document.getElementById('warehouseFlowLedger');if(c)return c;const d=document.getElementById('operationsDaysList');if(!d?.parentNode)return null;c=document.createElement('div');c.id='warehouseFlowLedger';c.className='card';d.parentNode.insertBefore(c,d);return c}
  function render(){ensureStyle();const c=ensureCard();if(!c)return;const rows=ledgerRows(),p=periods(),iy=inventoryYear(),sel=p[categoryPeriod]||p.year;c.innerHTML=`<div class="flow078Head"><div><h2>📦 Warehouse In / Out Ledger</h2><div class="flow078Intro">Stock-only cumulative flow from Aug 1. Non-stock / Customer Order, Record Only and physical-count corrections are excluded. Carpet Cutting uses actual stock deduction including the 3″ allowance. Box and Carton are normalized to one unit: Box. Future-dated records are not counted early.</div></div><div class="flow078Badge">FY ${esc(iy.label)} · Stock only</div></div><div class="flow078Grid">${tile(p.month,summarize(rows,p.month))}${tile(p.half,summarize(rows,p.half))}${tile(p.year,summarize(rows,p.year))}</div><details class="flow078Details" open><summary><b>Major category summary</b></summary><div class="flow078Btns"><button data-p="month" class="${categoryPeriod==='month'?'active':''}">Month</button><button data-p="half" class="${categoryPeriod==='half'?'active':''}">Half-Year</button><button data-p="year" class="${categoryPeriod==='year'?'active':''}">Inventory Year</button></div><table class="flow078Table"><thead><tr><th>Category</th><th>IN</th><th>OUT</th><th>Net</th></tr></thead><tbody>${catRows(rows,sel)}</tbody></table></details><details class="flow078Details"><summary>12-month breakdown · FY ${esc(iy.label)}</summary><table class="flow078Table"><thead><tr><th>Month</th><th>IN</th><th>OUT</th><th>Net</th></tr></thead><tbody>${monthRows(rows,iy)}</tbody></table></details><div class="flow078Note">Counting rule: completed physical Carpet movements + completed Stock product movements + inventory-posted Receiving records that pass Product Identity / unit checks. Piece remains valid for genuine sheet/plywood inventory; Tube remains available for non-stock customer-order records but is excluded from this Stock ledger.</div>`;c.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{categoryPeriod=b.dataset.p;render()})}
  function normalizeUnitSelects(){
    document.querySelectorAll('select').forEach(sel=>{
      const opts=[...sel.options],cartons=opts.filter(o=>norm(o.value)==='carton'||norm(o.textContent)==='carton'),box=opts.find(o=>norm(o.value)==='box'||norm(o.textContent)==='box');
      if(!cartons.length)return;
      const was=norm(sel.value)==='carton';
      if(box){cartons.forEach(o=>o.remove());if(was)sel.value=box.value}else{const o=cartons[0];o.value='Box';o.textContent='Box';cartons.slice(1).forEach(x=>x.remove());if(was)sel.value='Box'}
    });
  }
  function setVersion(){document.querySelectorAll('.version,#headerVersion').forEach(e=>e.textContent='V'+VERSION);document.documentElement.setAttribute('data-runlu-build',BUILD)}
  function install(){setVersion();normalizeUnitSelects();render()}
  function boot(){install();let n=0;const t=setInterval(()=>{install();if(++n>240)clearInterval(t)},250);window.addEventListener('storage',e=>{if([OPS,RCV,PM].includes(e.key))setTimeout(render,80)});window.addEventListener('pageshow',()=>setTimeout(install,80))}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();