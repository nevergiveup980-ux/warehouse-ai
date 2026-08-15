// RUNLU Warehouse AI V6.8.3 Build075 — Database Integrity Guard
(() => {
  if (window.__RUNLU_BUILD075__) return;
  window.__RUNLU_BUILD075__ = true;

  const VERSION='6.8.3', BUILD='075';
  const PMDB='runlu_product_master_v21', INVDB='runlu_inventory_records_v21';

  const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
  const arr=v=>Array.isArray(v)?v:[];
  function safeLoad(key){try{const v=JSON.parse(localStorage.getItem(key)||'[]');return arr(v)}catch{return[]}}
  function masters(){try{return typeof window.loadMasters==='function'?arr(window.loadMasters()):safeLoad(PMDB)}catch{return safeLoad(PMDB)}}
  function inventory(){try{return typeof window.loadInventoryRecords==='function'?arr(window.loadInventoryRecords()):safeLoad(INVDB)}catch{return safeLoad(INVDB)}}

  // Strong identity only: SKU wins; otherwise require at least product + colour.
  function productIdentity(m){
    const name=norm(m?.name),color=norm(m?.color),sku=norm(m?.sku);
    if(!name)return '';
    if(sku)return `sku|${sku}|${color}`;
    if(color)return `name|${name}|${color}`;
    return '';
  }
  function inventoryFingerprint(r){
    return [r?.masterId,r?.unit,r?.location,r?.poNumber,r?.lotNumber,r?.quantity,r?.lifecycleStatus,!!r?.quantityPending,r?.pailSize]
      .map(norm).join('|');
  }
  function currentInventory(r){
    const s=norm(r?.lifecycleStatus||'active');
    return !['used_up','used up','archived','transferred_out','transferred out','deleted'].includes(s);
  }
  function statusLocation(v){return /physical count|required|pending|receiving\s*\/\s*put-away/i.test(String(v||''))}

  // These stock programs have a warehouse-standard unit. Other products are deliberately left flexible.
  function strictUnitKind(m){
    const cat=norm(m?.category),name=norm(m?.name),sku=norm(m?.sku);
    if(cat==='platinum'||cat==='heather choice'||cat==='spill blocker'||/platinum-stock/.test(sku)||/heather-choice/.test(sku)||/cloud\s*9\s*spill\s*blocker/.test(name))return 'roll';
    return '';
  }
  function unitCompatible(m,r){
    const kind=strictUnitKind(m);if(!kind)return true;
    return norm(r?.unit)===kind;
  }
  function displayUnit(m,r){
    if(strictUnitKind(m)==='roll')return 'Roll';
    const u=String(r?.unit||m?.coverageUnit||'unit').trim();
    return u||'unit';
  }

  function localIntegrityScan(){
    const pm=masters(),inv=inventory().filter(currentInventory),pmById=new Map(pm.map(x=>[String(x.id),x]));

    const productGroups=new Map();
    for(const p of pm){const k=productIdentity(p);if(!k)continue;const a=productGroups.get(k)||[];a.push(p);productGroups.set(k,a)}
    const duplicateProducts=[...productGroups.values()].filter(g=>new Set(g.map(x=>String(x.id))).size>1);

    const invGroups=new Map();
    for(const r of inv){if(r?.quantityPending)continue;const k=inventoryFingerprint(r);const a=invGroups.get(k)||[];a.push(r);invGroups.set(k,a)}
    const duplicateInventory=[...invGroups.values()].filter(g=>g.length>1);

    const orphanInventory=inv.filter(r=>r?.masterId&&!pmById.has(String(r.masterId)));
    const unitAnomalies=inv.filter(r=>{
      const m=pmById.get(String(r?.masterId));
      return m&&Number(r?.quantity||0)>0&&!r?.quantityPending&&!unitCompatible(m,r);
    });
    const confirmedMasters=new Set(inv.filter(r=>Number(r?.quantity||0)>0&&!r?.quantityPending).map(r=>String(r.masterId)));
    const stalePlaceholders=inv.filter(r=>r?.quantityPending&&Number(r?.quantity||0)===0&&confirmedMasters.has(String(r.masterId))&&statusLocation(r?.location));

    return {
      duplicateProducts,duplicateInventory,orphanInventory,unitAnomalies,stalePlaceholders,
      counts:{
        duplicateProducts:duplicateProducts.length,
        duplicateInventory:duplicateInventory.length,
        orphanInventory:orphanInventory.length,
        review:unitAnomalies.length+stalePlaceholders.length
      }
    };
  }
  window.runluIntegrityScanLocal=localIntegrityScan;

  function installVoiceGuard(){
    const current=window.voiceInventorySummaryForMaster;
    if(typeof current!=='function'||current.__build075)return;
    function guarded(master){
      const base=current(master)||{};
      const source=arr(base.rows);
      const compatible=[],unitExcluded=[];
      for(const r of source){(unitCompatible(master,r)?compatible:unitExcluded).push(r)}

      const positiveConfirmed=compatible.filter(r=>!r?.quantityPending&&!statusLocation(r?.location)&&Number(r?.quantity||0)>0);
      const confirmedRows=[],pendingRows=[],staleExcluded=[];
      for(const r of compatible){
        const qty=Number(r?.quantity||0);
        const pending=!!r?.quantityPending||statusLocation(r?.location)||!Number.isFinite(Number(r?.quantity));
        if(pending){
          if(positiveConfirmed.length&&qty<=0&&statusLocation(r?.location))staleExcluded.push(r);else pendingRows.push(r);
          continue;
        }
        if(qty>0)confirmedRows.push(r);
      }
      const byUnit={};let total=0;
      for(const r of confirmedRows){const u=displayUnit(master,r),q=Number(r.quantity||0);byUnit[u]=(byUnit[u]||0)+q;total+=q}
      const rows=[...confirmedRows,...pendingRows];
      const locations=[...new Set(rows.map(r=>r?.location).filter(x=>x&&!statusLocation(x)))];
      return {...base,rows,confirmedRows,pendingRows,total,byUnit,locations,hasPending:pendingRows.length>0,excludedRows:[...unitExcluded,...staleExcluded],integrityExcludedCount:unitExcluded.length+staleExcluded.length};
    }
    guarded.__build075=true;
    window.voiceInventorySummaryForMaster=guarded;

    const quantityAnswer=window.voiceQuantityAnswer;
    if(typeof quantityAnswer==='function'&&!quantityAnswer.__build075){
      const wrapped=function(a,zh){
        let text=quantityAnswer(a,zh);
        if(a?.integrityExcludedCount>0){
          text+=zh?`（另有 ${a.integrityExcludedCount} 条身份/单位异常记录已排除，未计入库存。）`:` ${a.integrityExcludedCount} identity/unit anomaly record(s) were excluded from the inventory total.`;
        }
        return text;
      };
      wrapped.__build075=true;window.voiceQuantityAnswer=wrapped;
    }
  }

  function ensureStyle(){
    if(document.getElementById('build075IntegrityStyle'))return;
    const s=document.createElement('style');s.id='build075IntegrityStyle';s.textContent=`
      #build075IntegrityPanel{margin:12px 0 4px;padding:14px;border:1px solid #cfe8d9;background:#f4fbf7;border-radius:16px}
      #build075IntegrityPanel.review{border-color:#f0cf8a;background:#fff9ed}
      .integrity075Top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.integrity075Title{font-weight:900;font-size:17px}.integrity075Badge{padding:5px 9px;border-radius:999px;background:#dff4e7;color:#176b40;font-size:10px;font-weight:900;white-space:nowrap}.review .integrity075Badge{background:#fff0cf;color:#8d5900}
      .integrity075Grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:11px}.integrity075Metric{background:#fff;border:1px solid #e3e9ef;border-radius:11px;padding:9px;text-align:center}.integrity075Metric b{display:block;font-size:19px}.integrity075Metric span{font-size:9px;color:#6f7785;font-weight:800}
      .integrity075Note{font-size:11px;color:#647084;line-height:1.45;margin-top:9px}.integrity075Actions{margin-top:10px}.integrity075Actions button{padding:8px 11px;font-size:12px}
      @media(max-width:600px){.integrity075Grid{grid-template-columns:1fr 1fr}}
    `;document.head.appendChild(s);
  }
  function ensurePanel(){
    ensureStyle();
    let p=document.getElementById('build075IntegrityPanel');if(p)return p;
    const settings=document.getElementById('settings');const h=settings?.querySelector('h2');if(!h)return null;
    p=document.createElement('div');p.id='build075IntegrityPanel';p.className='settingRow';
    h.insertAdjacentElement('afterend',p);return p;
  }
  function renderPanel(){
    const p=ensurePanel();if(!p)return;
    const r=localIntegrityScan(),c=r.counts,total=c.duplicateProducts+c.duplicateInventory+c.orphanInventory+c.review;
    p.classList.toggle('review',total>0);
    p.innerHTML=`<div class="integrity075Top"><div><div class="integrity075Title">🛡️ Database Integrity Guard</div><div class="meta">Cloud Master identity, duplicate and Voice inventory protection</div></div><div class="integrity075Badge">${total?'Review '+total:'Healthy ✓'}</div></div>
      <div class="integrity075Grid"><div class="integrity075Metric"><b>${c.duplicateProducts}</b><span>DUP PRODUCT</span></div><div class="integrity075Metric"><b>${c.duplicateInventory}</b><span>DUP INVENTORY</span></div><div class="integrity075Metric"><b>${c.orphanInventory}</b><span>ORPHAN LINK</span></div><div class="integrity075Metric"><b>${c.review}</b><span>UNIT / PLACEHOLDER</span></div></div>
      <div class="integrity075Note">Build075 checks the device cache against the cleaned Cloud Master rules. Stock-program Voice totals count confirmed, identity-compatible inventory only. A non-zero result is a review signal — nothing is auto-deleted.</div>
      <div class="integrity075Actions"><button type="button" onclick="runluRenderIntegrityPanel()">Run Health Check</button></div>`;
  }
  window.runluRenderIntegrityPanel=renderPanel;

  function showVersion(){
    document.querySelectorAll('.version,#headerVersion').forEach(el=>el.textContent='V'+VERSION);
    document.documentElement.setAttribute('data-runlu-build',BUILD);
  }
  function install(){installVoiceGuard();renderPanel();showVersion()}
  function boot(){
    install();let n=0;const t=setInterval(()=>{install();if(++n>240)clearInterval(t)},250);
    window.addEventListener('storage',()=>setTimeout(renderPanel,100));
    window.addEventListener('pageshow',()=>setTimeout(install,80));
  }
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
