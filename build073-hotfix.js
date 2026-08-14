// RUNLU Warehouse AI V6.8.1 Build073 — 3-inch Cut Allowance Ledger / Material Waste Analytics
(() => {
  if (window.__RUNLU_BUILD073__) return;
  window.__RUNLU_BUILD073__ = true;

  const VERSION='6.8.1', BUILD='073';
  const CUT='runlu_cutting_log_v52';
  const CARPET='runlu_carpet_inventory_v52';
  const OPS='runlu_operations_log_v52';

  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const arr=k=>{const v=read(k);return Array.isArray(v)?v:[]};
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function localDate(y,m,d){return new Date(y,m,d,12,0,0,0)}
  function dateOnly(v){
    if(v instanceof Date&&!isNaN(v))return localDate(v.getFullYear(),v.getMonth(),v.getDate());
    const s=text(v);if(!s)return null;
    let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return localDate(+m[1],+m[2]-1,+m[3]);
    const d=new Date(s);return isNaN(d)?null:localDate(d.getFullYear(),d.getMonth(),d.getDate());
  }
  function cutDate(c,op){return dateOnly(c?.date)||dateOnly(c?.createdAt)||dateOnly(op?.date)||dateOnly(op?.completedAt)||dateOnly(op?.createdAt)}
  function addMonths(d,n){return localDate(d.getFullYear(),d.getMonth()+n,d.getDate())}
  function addYears(d,n){return localDate(d.getFullYear()+n,d.getMonth(),d.getDate())}
  function fmtDate(d){return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
  function fmtMonth(d){return d.toLocaleDateString(undefined,{month:'short',year:'numeric'})}
  function rangeLabel(a,b){const last=new Date(b.getFullYear(),b.getMonth(),b.getDate()-1,12);return `${fmtDate(a)} – ${fmtDate(last)}`}

  function inventoryYear(now=new Date()){
    const y=now.getMonth()>=7?now.getFullYear():now.getFullYear()-1;
    const start=localDate(y,7,1),end=localDate(y+1,7,1);
    return {start,end,label:`${y}–${String(y+1).slice(-2)}`};
  }
  function periodBounds(now=new Date()){
    const iy=inventoryYear(now),monthStart=localDate(now.getFullYear(),now.getMonth(),1),monthEnd=addMonths(monthStart,1);
    const offset=(now.getFullYear()-iy.start.getFullYear())*12+(now.getMonth()-iy.start.getMonth());
    const q=Math.max(0,Math.min(3,Math.floor(offset/3))),h=Math.max(0,Math.min(1,Math.floor(offset/6)));
    const qStart=addMonths(iy.start,q*3),qEnd=addMonths(qStart,3),hStart=addMonths(iy.start,h*6),hEnd=addMonths(hStart,6);
    return {
      month:{key:'month',title:'MONTH',name:fmtMonth(monthStart),start:monthStart,end:monthEnd},
      quarter:{key:'quarter',title:'QUARTER',name:`Q${q+1} · ${fmtMonth(qStart)}–${fmtMonth(new Date(qEnd.getFullYear(),qEnd.getMonth(),0,12))}`,start:qStart,end:qEnd},
      half:{key:'half',title:'HALF-YEAR',name:`H${h+1} · ${fmtMonth(hStart)}–${fmtMonth(new Date(hEnd.getFullYear(),hEnd.getMonth(),0,12))}`,start:hStart,end:hEnd},
      year:{key:'year',title:'INVENTORY YEAR',name:`${iy.label} · Aug 1–Jul 31`,start:iy.start,end:iy.end}
    };
  }

  function parseWidthFeet(v){
    if(typeof v==='number'&&Number.isFinite(v)&&v>0)return v;
    const s=text(v).replace(/[×x].*$/,'').trim();if(!s)return 0;
    let m=s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|')?$/i);if(m)return Number(m[1]);
    m=s.match(/^(\d+)\s*['′]\s*(\d+)?\s*(?:["″])?/);if(m)return Number(m[1])+(Number(m[2]||0)/12);
    const n=Number(s);return Number.isFinite(n)&&n>0?n:0;
  }
  function operationMap(){const m=new Map();for(const o of arr(OPS)){const id=text(o.id||o.operationId);if(id)m.set(id,o)}return m}
  function carpetMaps(){
    const byId=new Map(),byRoll=new Map();
    for(const r of arr(CARPET)){const id=text(r.id);if(id)byId.set(id,r);const roll=norm(r.roll);if(roll&&!byRoll.has(roll))byRoll.set(roll,r)}
    return {byId,byRoll};
  }
  function effectiveAllowance(c,op){
    const explicit=Number(c?.allowanceInches);if(Number.isFinite(explicit)&&explicit>0)return {inches:explicit,inferred:false};
    if(op&&norm(op.type)==='CARPET CUTTING'&&norm(op.inventoryMode)==='STOCK'){
      const n=Math.max(1,Math.floor(Number(c?.numberOfCuts||op.numberOfCuts||1)||1));return {inches:n*3,inferred:true};
    }
    return {inches:0,inferred:false};
  }
  function widthFor(c,op,maps){
    const direct=parseWidthFeet(c?.width)||parseWidthFeet(op?.width);if(direct)return {width:direct,estimated:false};
    const r=maps.byId.get(text(c?.carpetRecordId||op?.carpetRecordId))||maps.byRoll.get(norm(c?.roll||op?.roll));
    const width=parseWidthFeet(r?.width);return width?{width,estimated:false}:{width:12,estimated:true};
  }
  function ledgerRows(){
    const ops=operationMap(),maps=carpetMaps(),out=[];
    for(const c of arr(CUT)){
      const op=ops.get(text(c.operationId)),a=effectiveAllowance(c,op);if(!(a.inches>0))continue;
      const d=cutDate(c,op);if(!d)continue;
      const w=widthFor(c,op,maps),physicalCuts=(a.inches>0&&Math.abs((a.inches/3)-Math.round(a.inches/3))<0.001)?Math.round(a.inches/3):Math.max(1,Math.floor(Number(c.numberOfCuts||op?.numberOfCuts||1)||1));
      out.push({date:d,inches:a.inches,cuts:physicalCuts,events:1,width:w.width,estimatedWidth:w.estimated,inferredAllowance:a.inferred,sy:(a.inches/12)*w.width/9,roll:text(c.roll||op?.roll),collection:text(c.collection||op?.collection),colour:text(c.colour||op?.colour)});
    }
    return out;
  }
  function summarize(rows,p){
    const xs=rows.filter(x=>x.date>=p.start&&x.date<p.end),sum=(key)=>xs.reduce((a,x)=>a+Number(x[key]||0),0);
    return {events:xs.length,cuts:sum('cuts'),inches:sum('inches'),sy:sum('sy'),estimated:xs.filter(x=>x.estimatedWidth).length,inferred:xs.filter(x=>x.inferredAllowance).length};
  }
  function inchesLabel(n){
    const total=Math.max(0,Math.round(Number(n)||0)),ft=Math.floor(total/12),inch=total%12;
    return ft?`${ft}'${inch?inch+'"':''}`:`${inch}"`;
  }
  function syLabel(v){return `${Number(v||0).toFixed(1)} SY`}
  function tile(p,s){return `<div class="allowanceTile"><div class="allowanceKicker">${esc(p.title)}</div><div class="allowanceName">${esc(p.name)}</div><div class="allowanceBig">${s.cuts} <span>cuts</span></div><div class="allowanceMetric"><b>${inchesLabel(s.inches)}</b><span>extra length</span></div><div class="allowanceMetric"><b>${syLabel(s.sy)}</b><span>gross allowance area${s.estimated?'*':''}</span></div><div class="allowanceRange">${esc(rangeLabel(p.start,p.end))}</div></div>`}
  function monthlyBreakdown(rows,iy){
    let html='';for(let i=0;i<12;i++){const start=addMonths(iy.start,i),end=addMonths(start,1),s=summarize(rows,{start,end});html+=`<tr><td>${esc(fmtMonth(start))}</td><td>${s.cuts}</td><td>${inchesLabel(s.inches)}</td><td>${syLabel(s.sy)}${s.estimated?'*':''}</td></tr>`}
    return html;
  }

  function ensureStyle(){if(document.getElementById('build073AllowanceStyle'))return;const st=document.createElement('style');st.id='build073AllowanceStyle';st.textContent=`
    #cutAllowanceLedger{border:1px solid #d9e4f2;background:linear-gradient(145deg,#f8fbff,#fff)}
    .allowanceHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.allowanceHead h2{margin:0;font-size:24px}.allowanceHead .allowanceBadge{background:#fff1dd;color:#9a5a00;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:850;white-space:nowrap}
    .allowanceIntro{font-size:13px;color:#667085;line-height:1.5;margin-top:5px}.allowanceGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.allowanceTile{border:1px solid #e1e7ef;border-radius:15px;padding:13px;background:#fff;min-width:0}.allowanceKicker{font-size:10px;letter-spacing:.08em;font-weight:900;color:#6f7785}.allowanceName{font-size:12px;color:#4d596a;min-height:34px;margin:5px 0 8px}.allowanceBig{font-size:25px;font-weight:900;color:#182033}.allowanceBig span{font-size:12px;color:#6f7785;font-weight:750}.allowanceMetric{display:flex;justify-content:space-between;gap:7px;align-items:baseline;margin-top:7px;padding-top:7px;border-top:1px solid #eef1f5}.allowanceMetric b{font-size:15px}.allowanceMetric span{font-size:10px;color:#7b8491;text-align:right}.allowanceRange{font-size:9px;color:#9299a4;margin-top:8px;line-height:1.35}.allowanceNote{margin-top:11px;padding:10px 11px;border-radius:12px;background:#fff8e8;color:#765315;font-size:11px;line-height:1.45}.allowanceDetails{margin-top:10px;border-top:1px solid #e5eaf1;padding-top:10px}.allowanceDetails summary{cursor:pointer;font-size:12px;font-weight:850;color:#2563eb}.allowanceTable{width:100%;border-collapse:collapse;margin-top:9px;font-size:11px}.allowanceTable th,.allowanceTable td{padding:7px 5px;border-bottom:1px solid #edf0f4;text-align:right}.allowanceTable th:first-child,.allowanceTable td:first-child{text-align:left}
    @media(max-width:850px){.allowanceGrid{grid-template-columns:1fr 1fr}}@media(max-width:480px){.allowanceHead{display:block}.allowanceHead .allowanceBadge{display:inline-block;margin-top:8px}.allowanceTile{padding:11px}.allowanceBig{font-size:22px}}
  `;document.head.appendChild(st)}

  function ensureCard(){
    let card=document.getElementById('cutAllowanceLedger');if(card)return card;
    const log=document.getElementById('cuttingLogList'),logCard=log?.closest('.card');if(!logCard?.parentNode)return null;
    card=document.createElement('div');card.id='cutAllowanceLedger';card.className='card';logCard.parentNode.insertBefore(card,logCard);return card;
  }
  function renderLedger(){
    ensureStyle();const card=ensureCard();if(!card)return;
    const rows=ledgerRows(),p=periodBounds(new Date()),iy=inventoryYear(new Date()),summaries={month:summarize(rows,p.month),quarter:summarize(rows,p.quarter),half:summarize(rows,p.half),year:summarize(rows,p.year)};
    const est=summaries.year.estimated,inf=summaries.year.inferred;
    card.innerHTML=`<div class="allowanceHead"><div><h2>📏 3″ Cut Allowance Ledger</h2><div class="allowanceIntro">Stock carpet only · gross extra material caused by the 3″ allowance per physical cut. Inventory year follows the July 31 count and runs Aug 1–Jul 31.</div></div><div class="allowanceBadge">Potential Waste</div></div><div class="allowanceGrid">${tile(p.month,summaries.month)}${tile(p.quarter,summaries.quarter)}${tile(p.half,summaries.half)}${tile(p.year,summaries.year)}</div>${est||inf?`<div class="allowanceNote">${est?`* ${est} current-year cut record(s) had no stored roll width, so area uses a 12′ fallback. `:''}${inf?`${inf} record(s) had allowance safely inferred from a linked Stock Carpet Cutting operation.`:''}</div>`:''}<details class="allowanceDetails"><summary>Monthly breakdown for Inventory Year ${esc(iy.label)}</summary><table class="allowanceTable"><thead><tr><th>Month</th><th>Cuts</th><th>Extra length</th><th>Allowance area</th></tr></thead><tbody>${monthlyBreakdown(rows,iy)}</tbody></table></details>`;
  }
  function setVersion(){document.querySelectorAll('.version').forEach(el=>el.textContent='V'+VERSION);const title=document.querySelector('title');if(title)title.textContent=`RUNLU Warehouse AI V${VERSION} Build${BUILD}`}
  function install(){
    setVersion();ensureStyle();
    const prior=window.renderCarpetInventory;if(typeof prior==='function'&&!prior.__build073){const wrapped=function(){const r=prior.apply(this,arguments);setTimeout(renderLedger,0);return r};wrapped.__build073=true;wrapped.__original=prior;window.renderCarpetInventory=wrapped}
    renderLedger();
  }
  function boot(){let n=0;const t=setInterval(()=>{n++;install();if(typeof window.renderCarpetInventory==='function'&&document.getElementById('cuttingLogList')){clearInterval(t);setTimeout(renderLedger,120)}} ,120);setTimeout(()=>clearInterval(t),18000)}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
  window.addEventListener('storage',e=>{if([CUT,CARPET,OPS].includes(e.key))setTimeout(renderLedger,50)});
})();
