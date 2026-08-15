// RUNLU Warehouse AI V6.11.0 Build083 — Dedicated Warehouse Ledger Page
(() => {
  if (window.__RUNLU_BUILD083__) return;
  window.__RUNLU_BUILD083__ = true;

  const PAGE_ID='warehouseLedgerPage';
  const ENTRY_ID='warehouseLedgerEntry';
  let observer=null;

  function ensureStyle(){
    if(document.getElementById('build083LedgerPageStyle')) return;
    const s=document.createElement('style');
    s.id='build083LedgerPageStyle';
    s.textContent=`
      #${ENTRY_ID}{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;text-align:left;border:1px solid #cfe0f4;background:linear-gradient(145deg,#eef6ff,#fff);border-radius:16px;padding:13px 14px;margin:14px 0 4px;color:#182033;box-shadow:none}
      #${ENTRY_ID}:active{transform:scale(.995);background:#e9f3ff}
      .ledger083Icon{width:42px;height:42px;border-radius:13px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:25px;border:1px solid #dce8f6}
      .ledger083Copy{min-width:0}.ledger083Title{font-size:17px;font-weight:900;line-height:1.15}.ledger083Sub{font-size:11px;color:#667085;line-height:1.35;margin-top:4px}
      .ledger083Mini{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.ledger083Mini span{display:inline-block;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:850}.ledger083Mini .in{background:#e9f8ef;color:#176b40}.ledger083Mini .out{background:#fff0f1;color:#a52232}.ledger083Mini .fy{background:#eef2f7;color:#566273}
      .ledger083Arrow{font-size:30px;line-height:1;color:#3568a8;font-weight:500}
      #${PAGE_ID} .ledger083PageHead{border:1px solid #d9e4f2;background:linear-gradient(145deg,#f8fbff,#fff)}
      .ledger083Back{background:transparent;color:#2563eb;padding:3px 0 9px;font-size:14px;font-weight:800}
      .ledger083PageTitle{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ledger083PageTitle h2{font-size:25px;margin:0}.ledger083PageTitle p{font-size:12px;color:#667085;line-height:1.45;margin:6px 0 0}
      .ledger083Actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ledger083Actions button{font-size:12px;font-weight:800;padding:9px 11px}.ledger083Actions .allow{background:#fff5df;color:#8b5a00}.ledger083Actions .records{background:#eef4ff;color:#244da0}
      #warehouseLedgerMount #warehouseFlowLedger{margin-bottom:12px}
      #warehouseLedgerMount .flow078Grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      @media(max-width:760px){#warehouseLedgerMount .flow078Grid{grid-template-columns:1fr}.ledger083PageTitle{display:block}}
      @media(max-width:520px){#${ENTRY_ID}{grid-template-columns:auto minmax(0,1fr) auto;padding:12px}.ledger083Icon{width:39px;height:39px}.ledger083Title{font-size:16px}.ledger083Sub{font-size:10px}.ledger083Arrow{font-size:26px}}
    `;
    document.head.appendChild(s);
  }

  function fallbackShow(id){
    document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
    const p=document.getElementById(id);if(p)p.classList.remove('hidden');
    window.scrollTo({top:0,behavior:'auto'});
  }

  function go(id){
    try{if(typeof window.showPage==='function')window.showPage(id);else fallbackShow(id)}catch{fallbackShow(id)}
    setTimeout(()=>window.scrollTo({top:0,behavior:'auto'}),20);
  }

  function openLedger(){ensureAll();go(PAGE_ID);setTimeout(syncMini,80)}
  function backOperations(){go('operations')}
  function openRecords(){go('operations');setTimeout(()=>document.getElementById('operationsDaysList')?.scrollIntoView({behavior:'smooth',block:'start'}),120)}
  function openAllowance(){go('carpetInventory');setTimeout(()=>{try{window.openCutAllowanceLedger?.()}catch{}},180)}

  function ensurePage(){
    let page=document.getElementById(PAGE_ID);
    if(page)return page;
    const main=document.querySelector('main');if(!main)return null;
    page=document.createElement('section');
    page.id=PAGE_ID;page.className='page hidden';
    page.innerHTML=`
      <div class="card ledger083PageHead">
        <button type="button" class="ledger083Back">‹ Back to Operations</button>
        <div class="ledger083PageTitle"><div><h2>📦 Warehouse Ledger</h2><p>Stock movement analytics in one place. The underlying numbers still come from the existing Stock-only Warehouse In / Out Ledger, so there is only one calculation source.</p></div></div>
        <div class="ledger083Actions"><button type="button" class="allow">📏 3″ Cut Allowance</button><button type="button" class="records">📋 View Work Records</button></div>
      </div>
      <div id="warehouseLedgerMount"></div>`;
    main.appendChild(page);
    page.querySelector('.ledger083Back')?.addEventListener('click',backOperations);
    page.querySelector('.allow')?.addEventListener('click',openAllowance);
    page.querySelector('.records')?.addEventListener('click',openRecords);
    return page;
  }

  function ensureEntry(){
    let entry=document.getElementById(ENTRY_ID);if(entry)return entry;
    const filter=document.getElementById('operationsFilter');
    const toolbar=filter?.closest('.listToolbar');
    if(!toolbar?.parentNode)return null;
    entry=document.createElement('button');
    entry.id=ENTRY_ID;entry.type='button';
    entry.setAttribute('aria-label','Open Warehouse In / Out Ledger');
    entry.innerHTML=`<div class="ledger083Icon">📦</div><div class="ledger083Copy"><div class="ledger083Title">Warehouse In / Out Ledger</div><div class="ledger083Sub">Stock-only flow · month, half-year, inventory year and major categories</div><div class="ledger083Mini"><span class="fy">FY ledger</span></div></div><div class="ledger083Arrow">›</div>`;
    toolbar.parentNode.insertBefore(entry,toolbar);
    entry.addEventListener('click',openLedger);
    return entry;
  }

  function moveLedger(){
    const page=ensurePage(),mount=page?.querySelector('#warehouseLedgerMount');
    const ledger=document.getElementById('warehouseFlowLedger');
    if(!mount||!ledger)return false;
    if(ledger.parentNode!==mount)mount.appendChild(ledger);
    return true;
  }

  function clean(s){return String(s||'').replace(/\s+/g,' ').trim()}
  function syncMini(){
    const entry=ensureEntry();if(!entry)return;
    const first=document.querySelector('#warehouseFlowLedger .flow078Tile');
    const badge=document.querySelector('#warehouseFlowLedger .flow078Badge');
    if(!first)return;
    const inTxt=clean(first.querySelector('.flow078C .in')?.textContent)||'IN —';
    const outTxt=clean(first.querySelector('.flow078C .out')?.textContent)||'OUT —';
    const fy=clean(badge?.textContent)||'FY ledger';
    const mini=entry.querySelector('.ledger083Mini');
    if(mini)mini.innerHTML=`<span class="in">${inTxt}</span><span class="out">${outTxt}</span><span class="fy">${fy}</span>`;
  }

  function ensureAll(){ensureStyle();ensurePage();ensureEntry();moveLedger();syncMini()}

  function boot(){
    ensureAll();
    let n=0;const t=setInterval(()=>{ensureAll();if(++n>240)clearInterval(t)},250);
    observer=new MutationObserver(()=>{moveLedger();syncMini()});
    setTimeout(()=>{const root=document.querySelector('main');if(root)observer.observe(root,{childList:true,subtree:true,characterData:true})},400);
    window.addEventListener('pageshow',()=>setTimeout(ensureAll,80));
    window.addEventListener('storage',()=>setTimeout(syncMini,120));
  }

  window.openWarehouseLedger=openLedger;
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
