// RUNLU Warehouse AI V6.12.1 Build087 — Live Links Runtime Fix
(() => {
  if (window.__RUNLU_BUILD087__) return;
  window.__RUNLU_BUILD087__ = true;

  const PAGE = 'liveLowStockPage';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function go(id) {
    if (typeof window.showPage === 'function') window.showPage(id);
    else if (typeof showPage === 'function') showPage(id);
    setTimeout(() => window.scrollTo({top:0, behavior:'auto'}), 20);
  }

  function ensureStyle() {
    if (document.getElementById('build087LiveLinksStyle')) return;
    const s = document.createElement('style');
    s.id = 'build087LiveLinksStyle';
    s.textContent = `
      #home .dashboardMetric.live087{cursor:pointer;position:relative;border:1px solid #dfe7f2;transition:transform .12s,background .12s}
      #home .dashboardMetric.live087:active{transform:scale(.98);background:#eef4ff}
      #home .dashboardMetric.live087:focus{outline:2px solid #2563eb;outline-offset:2px}
      #home .dashboardMetric.live087::after{content:'›';position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:19px;font-weight:900;color:#7f8ba0}
      .live087Hint{font-size:10px;color:#667085;margin-top:9px;line-height:1.4}
      #${PAGE} .live087Head{border:1px solid #d9e4f2;background:linear-gradient(145deg,#f8fbff,#fff)}
      .live087Back{background:transparent;color:#2563eb;padding:2px 0 9px;font-size:14px;font-weight:850}
      .live087Title{font-size:24px;font-weight:900;margin:0}.live087Meta{font-size:12px;color:#667085;line-height:1.45;margin-top:5px}
      .live087Section{margin-top:12px}.live087Section h3{margin:0 0 7px;font-size:16px}
      .live087Row{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;text-align:left;background:#fff;border:0;border-top:1px solid #e7ebf1;border-radius:0;padding:12px 2px;color:#182033}
      .live087Row:first-of-type{border-top:0}.live087Row:active{background:#f4f7fb}
      .live087Name{font-size:17px;font-weight:900;line-height:1.2}.live087Sub{font-size:11px;color:#6f7785;line-height:1.45;margin-top:4px}
      .live087Qty{text-align:right;font-size:18px;font-weight:900;white-space:nowrap;color:#b42335}.live087Chevron{font-size:18px;color:#8490a3;margin-left:4px}
      .live087Empty{color:#6f7785;text-align:center;padding:22px 4px}
      @media(max-width:560px){.live087Title{font-size:21px}.live087Qty{font-size:16px}}
    `;
    document.head.appendChild(s);
  }

  function ensureLowPage() {
    let page = document.getElementById(PAGE);
    if (page) return page;
    const main = document.querySelector('main');
    if (!main) return null;
    page = document.createElement('section');
    page.id = PAGE;
    page.className = 'page hidden';
    page.innerHTML = `<div class="card live087Head"><button type="button" class="live087Back">‹ Back to Home</button><h2 class="live087Title">Low Stock</h2><div class="live087Meta">Uses the same Home thresholds: general inventory at or below 30, and active carpet rolls above 0 and at or below 50 ft. Tap any row to open the underlying inventory.</div></div><div id="live087LowBody"></div>`;
    main.appendChild(page);
    page.querySelector('.live087Back')?.addEventListener('click', () => go('home'));
    return page;
  }

  function masters() { return typeof window.loadMasters === 'function' ? window.loadMasters() : []; }
  function inventory() { return typeof window.loadInventoryRecords === 'function' ? window.loadInventoryRecords() : []; }
  function carpets() { return typeof window.carpetRecords === 'function' ? window.carpetRecords() : []; }

  function generalLow() {
    const byId = new Map(masters().map(m => [String(m.id), m]));
    let rows = inventory();
    if (typeof window.isCurrentGeneralInventoryRecord === 'function') rows = rows.filter(window.isCurrentGeneralInventoryRecord);
    return rows.filter(r => !r?.quantityPending && Number(r?.quantity || 0) <= 30)
      .map(r => ({r, m: byId.get(String(r.masterId)) || {}}))
      .sort((a,b) => Number(a.r.quantity || 0) - Number(b.r.quantity || 0) || String(a.m.name || '').localeCompare(String(b.m.name || '')));
  }

  function carpetLow() {
    let rows = carpets();
    if (typeof window.isCarpetWarehouseActive === 'function') rows = rows.filter(window.isCarpetWarehouseActive);
    return rows.filter(r => Number(r?.length) > 0 && Number(r?.length) <= 50)
      .sort((a,b) => Number(a.length || 0) - Number(b.length || 0) || String(a.roll || '').localeCompare(String(b.roll || ''), undefined, {numeric:true}));
  }

  function feet(v) {
    const inches = Math.round(Number(v || 0) * 12), f = Math.floor(inches / 12), i = inches % 12;
    return `${f}'${i ? i + '"' : ''}`;
  }

  function renderLowStock() {
    ensureStyle();
    const page = ensureLowPage();
    if (!page) return;
    const body = page.querySelector('#live087LowBody');
    const general = generalLow(), carpet = carpetLow();
    const generalHtml = general.length ? general.map(({r,m}) => `<button class="live087Row" data-kind="inventory" data-master="${esc(r.masterId)}"><div><div class="live087Name">${esc(m.name || 'Unknown Product')}${m.color ? ' · ' + esc(m.color) : ''}</div><div class="live087Sub">${esc(r.location || 'No location')}${r.lotNumber ? ' · Lot ' + esc(r.lotNumber) : ''}${r.poNumber ? ' · PO ' + esc(r.poNumber) : ''} · ${esc(m.category || 'Other')}</div></div><div class="live087Qty">${esc(Number(r.quantity || 0))} ${esc(r.unit || '')} <span class="live087Chevron">›</span></div></button>`).join('') : '<div class="live087Empty">No low-stock general inventory.</div>';
    const carpetHtml = carpet.length ? carpet.map(r => `<button class="live087Row" data-kind="carpet" data-id="${esc(r.id)}"><div><div class="live087Name">${esc(r.collection || r.product || 'Carpet')}${(r.colour || r.color) ? ' · ' + esc(r.colour || r.color) : ''}</div><div class="live087Sub">Roll ${esc(r.roll || '—')} · ${esc(r.location || 'No location')} · ${esc(r.status || r.measure || 'Active')}</div></div><div class="live087Qty">${esc(feet(r.length))} <span class="live087Chevron">›</span></div></button>`).join('') : '<div class="live087Empty">No carpet rolls at or below 50 ft.</div>';
    body.innerHTML = `<div class="card live087Section"><h3>📦 General Inventory · ${general.length}</h3>${generalHtml}</div><div class="card live087Section"><h3>🧶 Carpet · ${carpet.length}</h3>${carpetHtml}</div>`;
  }

  function openLowStock() { renderLowStock(); go(PAGE); }

  function activateCards() {
    ensureStyle();
    const ids = ['dashProducts','dashUnits','dashLocations','dashLowStock'];
    ids.forEach(id => {
      const card = document.getElementById(id)?.closest('.dashboardMetric');
      if (!card) return;
      card.classList.add('live087');
      card.tabIndex = 0;
      card.setAttribute('role','button');
    });
    const stats = document.querySelector('#home .dashboardStats');
    if (stats && !stats.parentElement.querySelector('.live087Hint')) {
      const h = document.createElement('div');
      h.className = 'live087Hint';
      h.textContent = 'Live Links · tap an Inventory Summary number to open the underlying view.';
      stats.insertAdjacentElement('afterend', h);
    }
  }

  function routeMetric(card) {
    const id = card?.querySelector('b')?.id || '';
    if (id === 'dashProducts') go('products');
    else if (id === 'dashUnits') go('inventory');
    else if (id === 'dashLocations') go('warehouseMap');
    else if (id === 'dashLowStock') openLowStock();
  }

  document.addEventListener('click', e => {
    const card = e.target.closest?.('#home .dashboardMetric');
    if (!card) return;
    routeMetric(card);
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest?.('#home .dashboardMetric.live087');
    if (!card) return;
    e.preventDefault();
    routeMetric(card);
  }, true);

  document.addEventListener('click', e => {
    const row = e.target.closest?.(`#${PAGE} .live087Row`);
    if (!row) return;
    if (row.dataset.kind === 'inventory') {
      if (typeof window.openInventoryManager === 'function') window.openInventoryManager(row.dataset.master);
      else go('inventory');
    } else if (row.dataset.kind === 'carpet') {
      if (typeof window.openCarpetDetail === 'function') window.openCarpetDetail(row.dataset.id);
      else go('carpetInventory');
    }
  }, true);

  window.openRunluLowStock = openLowStock;
  function boot() {
    activateCards();
    let tries = 0;
    const timer = setInterval(() => {
      activateCards();
      if (++tries >= 80 || document.querySelectorAll('#home .dashboardMetric.live087').length >= 4) clearInterval(timer);
    }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
  window.addEventListener('pageshow', () => setTimeout(activateCards, 80));
})();
