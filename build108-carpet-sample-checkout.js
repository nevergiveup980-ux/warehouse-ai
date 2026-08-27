// RUNLU Warehouse OS V6.12.15 Build108 · Carpet Sample Checkout authority.
// When a Sample Checkout uses an exact carpet roll, Carpet Inventory is authoritative.
// Product Master / General Inventory linking is not required for that carpet path.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD108_CARPET_SAMPLE_CHECKOUT__) return;
  window.__RUNLU_BUILD108_CARPET_SAMPLE_CHECKOUT__ = true;

  const q = id => document.getElementById(id);
  const n = v => Number(v || 0);
  const norm = v => String(v || '').trim().toLowerCase();
  let installed = false;

  function isSampleCheckout(r) {
    return !!r && r.type === 'Sample Checkout' && !!String(r.roll || '').trim();
  }

  function carpetRoll(r) {
    try {
      const rows = typeof window.carpetRecords === 'function' ? window.carpetRecords() : [];
      if (typeof window.findCarpetRollForOperation === 'function') {
        return window.findCarpetRollForOperation(rows, r.carpetRecordId, r.roll) || null;
      }
      if (typeof window.findCarpetRoll === 'function') return window.findCarpetRoll(rows, r.roll) || null;
      return rows.find(x => norm(x.roll) === norm(r.roll)) || null;
    } catch (_) {
      return null;
    }
  }

  function feet(v) {
    try { return typeof window.feetLabel === 'function' ? window.feetLabel(v) : `${n(v).toFixed(2)} ft`; }
    catch (_) { return `${n(v).toFixed(2)} ft`; }
  }

  function samplePlan(r) {
    const roll = carpetRoll(r);
    const requested = n(r.quantity);
    // Warehouse carpet rule: every cut consumes requested length + 3 inches.
    const allowance = 0.25;
    const actual = requested > 0 ? requested + allowance : 0;
    const before = n(roll?.length);
    const after = Math.max(0, Number((before - actual).toFixed(4)));
    return {roll, requested, allowance, actual, before, after};
  }

  function installValidation() {
    const base = window.validateOperationForImpact;
    if (typeof base !== 'function' || base.__build108Wrapped) return;
    const wrapped = function(r) {
      if (!isSampleCheckout(r) || r.inventoryMode !== 'Stock') return base.apply(this, arguments);
      const p = samplePlan(r);
      if (!p.roll) return `Carpet Roll ${r.roll || '—'} was not found in Carpet Inventory.`;
      if (!(p.requested > 0)) return 'Enter a sample length greater than zero.';
      if (!String(r.location || '').trim() || !String(r.toLocation || '').trim()) return 'Enter both From Location and To Location.';
      if (norm(p.roll.location) !== norm(r.location)) return `Roll ${p.roll.roll} is currently at ${p.roll.location || 'an unknown location'}, not ${r.location}.`;
      if (p.actual > p.before + 0.011) return `This sample needs ${feet(p.actual)} including the 3-inch cutting allowance, but Roll ${p.roll.roll} has ${feet(p.before)} remaining.`;
      return '';
    };
    wrapped.__build108Wrapped = true;
    window.validateOperationForImpact = wrapped;
  }

  function installPreview() {
    const base = window.operationCompletionEffect;
    if (typeof base !== 'function' || base.__build108Wrapped) return;
    const wrapped = function(type, item) {
      if (type === 'Sample Checkout' && item?.roll && item.inventoryMode === 'Stock') {
        const p = samplePlan(item);
        if (!p.roll) return `Carpet Roll ${item.roll} not found — completion will be blocked`;
        return `Carpet sample ${feet(p.requested)} + 3\" cut allowance = ${feet(p.actual)} actual; Roll ${p.roll.roll}: ${feet(p.before)} → ${feet(p.after)}; ${item.location || p.roll.location || 'Warehouse'} → ${item.toLocation || 'Store'}`;
      }
      return base.apply(this, arguments);
    };
    wrapped.__build108Wrapped = true;
    window.operationCompletionEffect = wrapped;
  }

  function installImpact() {
    const base = window.applySingleOperationImpact;
    if (typeof base !== 'function' || base.__build108Wrapped) return;
    const wrapped = function(r) {
      if (!isSampleCheckout(r) || r.inventoryMode !== 'Stock') return base.apply(this, arguments);
      const p = samplePlan(r);
      const mapped = {
        ...r,
        type: 'Inventory Transfer',
        transferRoute: r.transferRoute || 'Warehouse → Store',
        transferMode: 'Cut Pieces Before Transfer',
        transferPieces: [p.requested],
        transferWholeRoll: false,
        impactApplied: false
      };
      const ok = base.call(this, mapped);
      if (ok) {
        r.impactApplied = !!mapped.impactApplied;
        r.appliedAt = mapped.appliedAt;
        r.impactResult = `Sample Checkout · ${mapped.impactResult || `Roll ${r.roll} checked out to ${r.toLocation || 'Store'}`}`;
        r.actualStockQuantity = p.actual;
        r.allowanceInches = 3;
      }
      return ok;
    };
    wrapped.__build108Wrapped = true;
    window.applySingleOperationImpact = wrapped;
  }

  function ensureCarpetNotice() {
    const productWrap = q('operationProductSearchWrap');
    if (!productWrap || q('build108CarpetSampleNotice')) return;
    const note = document.createElement('div');
    note.id = 'build108CarpetSampleNotice';
    note.className = 'notice';
    note.style.marginTop = '8px';
    note.style.display = 'none';
    productWrap.insertAdjacentElement('afterend', note);
  }

  function applyPresentation() {
    ensureCarpetNotice();
    const type = q('operationLineType')?.value || q('operationType')?.value || '';
    const roll = String(q('operationRoll')?.value || '').trim();
    const active = type === 'Sample Checkout' && !!roll;
    const productWrap = q('operationProductSearchWrap');
    const inventoryWrap = q('operationInventoryRecordWrap');
    const note = q('build108CarpetSampleNotice');
    if (active) {
      if (productWrap) productWrap.style.display = 'none';
      if (inventoryWrap) inventoryWrap.style.display = 'none';
      const row = carpetRoll({roll, carpetRecordId:q('operationRoll')?.dataset?.carpetRecordId || q('operationCarpetRollPicker')?.value || ''});
      if (note) {
        note.style.display = 'block';
        note.innerHTML = `<b>Carpet Inventory linked</b><br>Roll ${row?.roll || roll}${row?.location ? ` · ${row.location}` : ''}${row?.length != null ? ` · ${feet(row.length)} remaining` : ''}. Product Master is not required for this carpet Sample Checkout.`;
      }
    } else {
      if (note) note.style.display = 'none';
    }
  }

  function installPresentation() {
    const base = window.updateOperationForm;
    if (typeof base !== 'function' || base.__build108Wrapped) return;
    const wrapped = function() {
      const result = base.apply(this, arguments);
      applyPresentation();
      return result;
    };
    wrapped.__build108Wrapped = true;
    window.updateOperationForm = wrapped;

    ['operationRoll','operationCarpetRollPicker','operationCarpetTransfer','operationLineType','operationType'].forEach(id => {
      const el = q(id);
      if (!el || el.dataset.build108Bound) return;
      el.dataset.build108Bound = '1';
      el.addEventListener('change', () => setTimeout(applyPresentation, 0));
      if (id === 'operationRoll') el.addEventListener('input', () => setTimeout(applyPresentation, 0));
    });
    applyPresentation();
  }

  function install() {
    if (typeof window.validateOperationForImpact !== 'function' || typeof window.applySingleOperationImpact !== 'function' || typeof window.operationCompletionEffect !== 'function') return false;
    installValidation();
    installPreview();
    installImpact();
    installPresentation();
    document.documentElement.setAttribute('data-runlu-build108', 'carpet-sample-checkout');
    installed = true;
    return true;
  }

  function boot() {
    if (install()) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (install() || ++tries >= 30) clearInterval(timer);
    }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
  window.addEventListener('pageshow', () => setTimeout(() => {
    installValidation();
    installPreview();
    installImpact();
    installPresentation();
    applyPresentation();
  }, 100));
})();
