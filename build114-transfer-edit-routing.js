// RUNLU Warehouse OS V6.12.21 Build114 · Inventory Transfer edit routing.
// Restores the transfer-specific line type when an older single-item transfer is
// edited, so the required From/To controls are visible before completion.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD114_TRANSFER_EDIT_ROUTING__) return;
  window.__RUNLU_BUILD114_TRANSFER_EDIT_ROUTING__ = true;

  const q = id => document.getElementById(id);

  function recordFor(id) {
    try {
      return typeof window.operationRecords === 'function'
        ? window.operationRecords().find(x => String(x.id) === String(id)) || null
        : null;
    } catch (_) {
      return null;
    }
  }

  function isSingleInventoryTransfer(record) {
    return !!record &&
      record.type === 'Inventory Transfer' &&
      (!Array.isArray(record.items) || record.items.length === 0);
  }

  function restoreTransferEditor(record) {
    if (!isSingleInventoryTransfer(record)) return;
    const lineType = q('operationLineType');
    if (lineType) lineType.value = 'Inventory Transfer';
    const lineMode = q('operationLineInventoryMode');
    if (lineMode) lineMode.value = record.inventoryMode || 'Stock';
    if (typeof window.operationLineTypeChanged === 'function') {
      window.operationLineTypeChanged();
    } else if (typeof window.updateOperationForm === 'function') {
      window.updateOperationForm();
    }
    // Re-apply persisted locations after presentation refresh. No stock data is
    // changed; this only makes the required route fields visible and editable.
    if (q('operationLocation')) q('operationLocation').value = record.location || '';
    if (q('operationToLocation')) q('operationToLocation').value = record.toLocation || '';
  }

  function installEditRouting() {
    const base = window.editOperation;
    if (typeof base !== 'function' || base.__build114Wrapped) return;
    const wrapped = function(id) {
      const record = recordFor(id);
      const result = base.apply(this, arguments);
      restoreTransferEditor(record);
      return result;
    };
    wrapped.__build114Wrapped = true;
    window.editOperation = wrapped;
  }

  function installCompletionPreflight() {
    const base = window.setOperationStatus;
    if (typeof base !== 'function' || base.__build114Wrapped) return;
    const wrapped = function(id, status) {
      const record = recordFor(id);
      if (status === 'Completed' &&
          isSingleInventoryTransfer(record) &&
          record.inventoryMode === 'Stock' &&
          (!String(record.location || '').trim() || !String(record.toLocation || '').trim())) {
        window.editOperation(id);
        alert('Enter both From Location and To Location, then review and complete this Inventory Transfer.');
        q('operationToLocation')?.focus();
        return;
      }
      return base.apply(this, arguments);
    };
    wrapped.__build114Wrapped = true;
    window.setOperationStatus = wrapped;
  }

  function install() {
    if (typeof window.editOperation !== 'function' ||
        typeof window.setOperationStatus !== 'function') return false;
    installEditRouting();
    installCompletionPreflight();
    document.documentElement.setAttribute('data-runlu-build114', 'transfer-edit-routing');
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
})();
