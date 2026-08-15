// RUNLU Warehouse AI V6.11.1 Build084 — Carpet Used Up Ledger
(() => {
  if (window.__RUNLU_BUILD084__) return;
  window.__RUNLU_BUILD084__ = true;

  const CARPET='runlu_carpet_inventory_v52';
  const OPS='runlu_operations_log_v52';
  let observedLedger=null;
  let observer=null;
  let busy=false;

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const arr=k=>{const v=parse(localStorage.getItem(k)||'null');return Array.isArray(v)?v:[]};
  const localDate=(y,m,d)=>new Date(y,m,d,12,0,0,0);
  const addMonths=(d,n)=>localDate(d.getFullYear(),d.getMonth()+n,d.getDate());

  function dateOnly(v){
    const s=text(v);if(!s)return null;
    const m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m)return localDate(+m[1],+m[2]-1,+m[3]);
    const d=new Date(s);return isNaN(d)?null:localDate(d.getFullYear(),d.getMonth(),d.getDate());
  }

  function inventoryYear(now=new Date()){
    const y=now.getMonth()>=7?now.getFullYear():now.getFullYear()-1;
    return {start:localDate(y,7,1),end:localDate(y+1,7,1)};
  }

  function periodBounds(key,now=new Date()){
    const iy=inventoryYear(now);
    if(key==='month'){
      const start=localDate(now.getFullYear(),now.getMonth(),1);
      return {start,end:addMonths(start,1)};
    }
    if(key==='half'){
      const off=(now.getFullYear()-iy.start.getFullYear())*12+(now.getMonth()-iy.start.getMonth());
      const h=Math.max(0,Math.min(1,Math.floor(off/6)));
      const start=addMonths(iy.start,h*6);
      return {start,end:addMonths(start,6)};
    }
    return iy;
  }

  function rollOf(x){return text(x?.roll||x?.rollNumber||x?.carpetRoll||x?.sourceRoll)}
  function completedCut(o){
    const type=norm(o?.type),status=norm(o?.status),applied=o?.impactApplied;
    return type==='carpet cutting' && (status==='completed'||status==='partial') && applied!==false && text(applied)!=='false';
  }

  function operationsByRoll(){
    const map=new Map();
    for(const o of arr(OPS)){
      if(!completedCut(o))continue;
      const r=rollOf(o);if(!r)continue;
      const d=dateOnly(o?.date||o?.completedAt||o?.appliedAt||o?.createdAt);if(!d)continue;
      if(!map.has(r))map.set(r,[]);
      map.get(r).push({row:o,date:d});
    }
    for(const xs of map.values())xs.sort((a,b)=>a.date-b.date);
    return map;
  }

  function usedUpEventDate(c,byRoll){
    const explicit=dateOnly(c?.usedUpAt||c?.used_up_at);if(explicit)return explicit;
    const roll=rollOf(c),cuts=byRoll.get(roll)||[];
    if(cuts.length){
      const strong=cuts.filter(x=>/used\s*up|full\s*roll\s*finish|(?:→|->)\s*0(?:'|\b)/i.test(text(x.row?.impactResult)));
      return (strong.length?strong[strong.length-1]:cuts[cuts.length-1]).date;
    }
    return dateOnly(c?.completedAt||c?.updatedAt||c?.modifiedAt||c?.createdAt);
  }

  function usedUpEvents(){
    const byRoll=operationsByRoll(),seen=new Set(),out=[];
    for(const c of arr(CARPET)){
      if(!norm(c?.status).includes('used up'))continue;
      const roll=rollOf(c);if(!roll||seen.has(roll))continue;
      const date=usedUpEventDate(c,byRoll);if(!date)continue;
      seen.add(roll);out.push({roll,date});
    }
    return out;
  }

  function selectedPeriodKey(details){
    return details?.querySelector('.flow078Btns button.active')?.dataset?.p||'year';
  }

  function eventsForPeriod(key){
    const p=periodBounds(key),today=new Date();today.setHours(23,59,59,999);
    return usedUpEvents().filter(x=>x.date>=p.start&&x.date<p.end&&x.date<=today);
  }

  function ensureStyle(){
    if(document.getElementById('build084UsedUpStyle'))return;
    const s=document.createElement('style');s.id='build084UsedUpStyle';
    s.textContent=`
      #warehouseFlowLedger .usedUp084Head,#warehouseFlowLedger .usedUp084Cell{white-space:nowrap;text-align:left}
      #warehouseFlowLedger .usedUp084Cell b{color:#8b5a00}
      #warehouseFlowLedger .usedUp084Note{font-size:10px;color:#7b8491;line-height:1.4;margin-top:8px;padding-top:8px;border-top:1px dashed #e3e8ef}
      @media(max-width:560px){#warehouseFlowLedger .flow078Table{font-size:10px}#warehouseFlowLedger .flow078Table th,#warehouseFlowLedger .flow078Table td{padding-left:4px;padding-right:4px}.usedUp084Head,.usedUp084Cell{font-size:9.5px}}
    `;
    document.head.appendChild(s);
  }

  function majorDetails(){
    return [...document.querySelectorAll('#warehouseFlowLedger details.flow078Details')].find(d=>/major\s+category\s+summary/i.test(text(d.querySelector('summary')?.textContent)))||null;
  }

  function augment(){
    if(busy)return;busy=true;
    try{
      ensureStyle();
      const details=majorDetails();if(!details)return;
      const table=details.querySelector('table.flow078Table');if(!table)return;
      const key=selectedPeriodKey(details),events=eventsForPeriod(key),count=events.length;
      const head=table.querySelector('thead tr');
      if(head&&!head.querySelector('.usedUp084Head')){
        const th=document.createElement('th');th.className='usedUp084Head';th.textContent='Used Up';head.appendChild(th);
      }
      table.querySelectorAll('tbody tr').forEach(tr=>{
        let td=tr.querySelector('.usedUp084Cell');
        if(!td){td=document.createElement('td');td.className='usedUp084Cell';tr.appendChild(td)}
        const category=norm(tr.cells?.[0]?.textContent);
        const wanted=category==='carpet'?`${count} Roll`:'—';
        if(td.textContent!==wanted)td.innerHTML=category==='carpet'?`<b>${wanted}</b>`:'—';
        if(category==='carpet')td.title=events.map(x=>x.roll).join(' · ');else td.removeAttribute('title');
      });
      const noteText='Used Up counts unique carpet rolls whose lifecycle ended in the selected period. It is a roll-count KPI and does not add extra footage to OUT or Net.';
      let note=details.querySelector('.usedUp084Note');
      if(!note){note=document.createElement('div');note.className='usedUp084Note';details.appendChild(note)}
      if(note.textContent!==noteText)note.textContent=noteText;
    }finally{busy=false}
  }

  function watch(){
    const ledger=document.getElementById('warehouseFlowLedger');if(!ledger)return;
    if(observedLedger===ledger)return;
    observer?.disconnect();observedLedger=ledger;
    observer=new MutationObserver(()=>queueMicrotask(augment));
    observer.observe(ledger,{childList:true,subtree:true,characterData:true});
  }

  function install(){watch();augment()}
  function boot(){
    install();let n=0;const t=setInterval(()=>{install();if(++n>240)clearInterval(t)},250);
    window.addEventListener('pageshow',()=>setTimeout(install,80));
    window.addEventListener('storage',e=>{if([CARPET,OPS].includes(e.key))setTimeout(augment,100)});
  }

  window.runluCarpetUsedUpLedger={events:usedUpEvents,refresh:augment};
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
