// RUNLU Warehouse OS V6.12.20 Build113 · General-product Sample Checkout authority.
// A boxed/material sample is an issue from one exact inventory record, not a
// location-to-location transfer. Carpet-roll sample checkout remains under Build108.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD113_GENERAL_SAMPLE_CHECKOUT__) return;
  window.__RUNLU_BUILD113_GENERAL_SAMPLE_CHECKOUT__ = true;

  function isGeneralSampleCheckout(r) {
    return !!r &&
      r.type === 'Sample Checkout' &&
      r.inventoryMode === 'Stock' &&
      !String(r.roll || '').trim();
  }

  function asMaterialIssue(r) {
    return {...r, type:'Return to Supplier', impactApplied:false};
  }

  function installValidation() {
    const base = window.validateOperationForImpact;
    if (typeof base !== 'function' || base.__build113Wrapped) return;
    const wrapped = function(r) {
      // Reuse the established one-location stock-issue validation. This retains
      // exact Product Master / inventory-record / quantity checks without asking
      // for a destination that is not part of a general-material sample issue.
      if (isGeneralSampleCheckout(r)) return base.call(this, asMaterialIssue(r));
      return base.apply(this, arguments);
    };
    wrapped.__build113Wrapped = true;
    window.validateOperationForImpact = wrapped;
  }

  function installPreview() {
    const base = window.operationCompletionEffect;
    if (typeof base !== 'function' || base.__build113Wrapped) return;
    const wrapped = function(type, item) {
      if (type === 'Sample Checkout' && isGeneralSampleCheckout({...item, type})) {
        return base.call(this, 'Return to Supplier', item);
      }
      return base.apply(this, arguments);
    };
    wrapped.__build113Wrapped = true;
    window.operationCompletionEffect = wrapped;
  }

  function installImpact() {
    const base = window.applySingleOperationImpact;
    if (typeof base !== 'function' || base.__build113Wrapped) return;
    const wrapped = function(r) {
      if (!isGeneralSampleCheckout(r)) return base.apply(this, arguments);
      if (r.impactApplied || r.status !== 'Completed') return true;

      const mapped = asMaterialIssue(r);
      const ok = base.call(this, mapped);
      if (!ok) return false;

      r.impactApplied = !!mapped.impactApplied;
      r.appliedAt = mapped.appliedAt;
      r.impactResult = String(mapped.impactResult || 'Inventory issued')
        .replace(/returned to supplier/gi, 'issued as a sample');
      r.impactResult = `Sample Checkout · ${r.impactResult}`;

      // The base path already wrote the audit event atomically with its normal
      // inventory update. Relabel that exact event to preserve truthful history.
      try {
        const events = load(EVENTDB);
        const event = events.find(x =>
          String(x.operationId) === String(mapped.id) &&
          x.type === 'Return to Supplier'
        );
        if (event) {
          event.type = 'Sample Checkout';
          event.result = r.impactResult;
          save(EVENTDB, events);
        }
      } catch (_) {}
      return true;
    };
    wrapped.__build113Wrapped = true;
    window.applySingleOperationImpact = wrapped;
  }

  function install() {
    if (typeof window.validateOperationForImpact !== 'function' ||
        typeof window.operationCompletionEffect !== 'function' ||
        typeof window.applySingleOperationImpact !== 'function') return false;
    installValidation();
    installPreview();
    installImpact();
    document.documentElement.setAttribute('data-runlu-build113', 'general-sample-checkout');
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
