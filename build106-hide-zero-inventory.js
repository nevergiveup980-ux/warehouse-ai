// RUNLU Warehouse OS V6.12.13 Build106 · Hide zero-quantity current inventory.
// Zero balances remain stored for audit/history, but are not shown or counted as
// current general inventory. Records awaiting a physical count remain visible.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD106_HIDE_ZERO_INVENTORY__) return;
  window.__RUNLU_BUILD106_HIDE_ZERO_INVENTORY__ = true;
  let installed = false;

  function refreshVisibleInventory() {
    try { window.renderProducts?.(); } catch (_) {}
    try { window.renderInventory?.(); } catch (_) {}
    try { window.renderDashboard?.(); } catch (_) {}
    try { window.renderMap?.(); } catch (_) {}
    try {
      if (window.managedProductId) window.renderInventoryManager?.();
    } catch (_) {}
  }

  function install() {
    if (installed) return true;
    const baseCurrentGeneralInventoryRecord = window.isCurrentGeneralInventoryRecord;
    if (typeof baseCurrentGeneralInventoryRecord !== 'function') return false;

    window.isCurrentGeneralInventoryRecord = function(record) {
      if (!baseCurrentGeneralInventoryRecord.call(this, record)) return false;
      if (record?.quantityPending) return true;
      return Number(record?.quantity || 0) > 0;
    };
    installed = true;
    refreshVisibleInventory();
    return true;
  }

  function boot() {
    if (install()) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (install() || ++tries >= 20) clearInterval(timer);
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
  window.addEventListener('pageshow', () => setTimeout(() => {
    install();
    refreshVisibleInventory();
  }, 80));
})();
