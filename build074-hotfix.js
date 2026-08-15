// RUNLU Warehouse AI V6.8.2 Build074 — Cut Allowance Workbench Shortcut
(() => {
  if (window.__RUNLU_BUILD074__) return;
  window.__RUNLU_BUILD074__ = true;

  const VERSION='6.8.2', BUILD='074';

  function ensureStyle(){
    if(document.getElementById('build074AllowanceShortcutStyle')) return;
    const st=document.createElement('style');
    st.id='build074AllowanceShortcutStyle';
    st.textContent=`
      #cutAllowanceShortcutSection{margin-top:18px}
      .allowanceShortcutPanel{width:100%;display:block;text-align:left;border:1px solid #f0c978;background:linear-gradient(145deg,#fff8e8,#fffdf7);border-radius:18px;padding:15px;color:#182033;box-shadow:none}
      .allowanceShortcutPanel:active{transform:scale(.995)}
      .allowanceShortcutTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .allowanceShortcutTitle{font-size:19px;font-weight:900;line-height:1.15}.allowanceShortcutTitle span{margin-right:6px}
      .allowanceShortcutSub{font-size:12px;color:#6f7785;line-height:1.4;margin-top:5px;font-weight:650}
      .allowanceShortcutBadge{background:#fff0cf;color:#8d5900;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900;white-space:nowrap}
      .allowanceShortcutGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}
      .allowanceShortcutMetric{background:rgba(255,255,255,.88);border:1px solid #f1dfb7;border-radius:13px;padding:10px;min-width:0}
      .allowanceShortcutMetric .k{font-size:9px;letter-spacing:.08em;color:#8a7350;font-weight:900}.allowanceShortcutMetric .v{font-size:19px;line-height:1.1;font-weight:900;margin-top:4px}.allowanceShortcutMetric .l{font-size:10px;color:#6f7785;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .allowanceShortcutOpen{display:flex;justify-content:flex-end;margin-top:11px;color:#9a5a00;font-size:12px;font-weight:900}
      @media(max-width:600px){.allowanceShortcutGrid{grid-template-columns:1fr 1fr}.allowanceShortcutTitle{font-size:18px}}
    `;
    document.head.appendChild(st);
  }

  function mapSection(){
    const page=document.getElementById('carpetInventory');
    if(!page) return null;
    return [...page.querySelectorAll('.carpetActionSection')].find(s=>/Map,\s*scan and data protection/i.test(s.querySelector('.carpetActionTitle')?.textContent||''))||null;
  }

  function ensureShortcut(){
    ensureStyle();
    let wrap=document.getElementById('cutAllowanceShortcutSection');
    if(wrap) return wrap;
    const anchor=mapSection();
    if(!anchor?.parentNode) return null;
    wrap=document.createElement('div');
    wrap.id='cutAllowanceShortcutSection';
    wrap.className='carpetActionSection';
    wrap.innerHTML=`
      <div class="carpetActionTitle">Material efficiency</div>
      <button id="cutAllowanceShortcut" class="allowanceShortcutPanel" type="button" aria-label="Open 3 inch Cut Allowance analytics">
        <div class="allowanceShortcutTop"><div><div class="allowanceShortcutTitle"><span>📏</span>3″ Cut Allowance</div><div class="allowanceShortcutSub">Stock carpet waste tracking · month, quarter, half-year and inventory year</div></div><div class="allowanceShortcutBadge">Potential Waste</div></div>
        <div id="cutAllowanceShortcutGrid" class="allowanceShortcutGrid"><div class="allowanceShortcutMetric"><div class="k">MONTH</div><div class="v">—</div><div class="l">loading ledger</div></div><div class="allowanceShortcutMetric"><div class="k">QUARTER</div><div class="v">—</div><div class="l">loading ledger</div></div><div class="allowanceShortcutMetric"><div class="k">HALF-YEAR</div><div class="v">—</div><div class="l">loading ledger</div></div><div class="allowanceShortcutMetric"><div class="k">YEAR</div><div class="v">—</div><div class="l">loading ledger</div></div></div>
        <div class="allowanceShortcutOpen">Open Waste Analytics →</div>
      </button>`;
    anchor.insertAdjacentElement('afterend',wrap);
    document.getElementById('cutAllowanceShortcut')?.addEventListener('click',openLedger);
    return wrap;
  }

  function clean(s){return String(s||'').replace(/\s+/g,' ').trim()}
  function syncFromLedger(){
    const wrap=ensureShortcut();if(!wrap) return;
    const tiles=[...document.querySelectorAll('#cutAllowanceLedger .allowanceTile')];
    const grid=document.getElementById('cutAllowanceShortcutGrid');
    if(!grid||tiles.length<4) return;
    grid.innerHTML=tiles.slice(0,4).map((t,i)=>{
      const k=clean(t.querySelector('.allowanceKicker')?.textContent)||['MONTH','QUARTER','HALF-YEAR','YEAR'][i];
      const cuts=clean(t.querySelector('.allowanceBig')?.textContent)||'0 cuts';
      const metrics=[...t.querySelectorAll('.allowanceMetric b')].map(x=>clean(x.textContent));
      const len=metrics[0]||'0″',sy=metrics[1]||'0.0 SY';
      return `<div class="allowanceShortcutMetric"><div class="k">${k}</div><div class="v">${cuts}</div><div class="l">${len} · ${sy}</div></div>`;
    }).join('');
  }

  function openLedger(){
    const target=document.getElementById('cutAllowanceLedger');
    if(target){target.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>{target.style.outline='3px solid rgba(240,169,40,.35)';setTimeout(()=>target.style.outline='',1200)},500);return}
    try{window.renderCarpetInventory?.()}catch{}
    setTimeout(()=>document.getElementById('cutAllowanceLedger')?.scrollIntoView({behavior:'smooth',block:'start'}),180);
  }
  window.openCutAllowanceLedger=openLedger;

  function showVersion(){
    document.querySelectorAll('.version,#headerVersion').forEach(el=>el.textContent='V'+VERSION);
    document.documentElement.setAttribute('data-runlu-build',BUILD);
  }

  function install(){ensureShortcut();syncFromLedger();showVersion()}
  function boot(){
    install();
    let n=0;const timer=setInterval(()=>{install();if(++n>240)clearInterval(timer)},250);
    const obs=new MutationObserver(()=>syncFromLedger());
    setTimeout(()=>{const ledger=document.getElementById('cutAllowanceLedger');if(ledger)obs.observe(ledger,{childList:true,subtree:true,characterData:true})},700);
    window.addEventListener('storage',()=>setTimeout(syncFromLedger,80));
  }
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
