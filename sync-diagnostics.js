// RUNLU Warehouse OS — read-only terminal synchronization diagnostics.
// Does not mutate localStorage, queue contents, or cloud records.
(() => {
  'use strict';
  if (window.RUNLUSyncDiagnostics) return;
  const KEYS = {
    queue: 'runlu_cloud_master_offline_queue_v680',
    conflicts: 'runlu_cloud_master_record_conflicts_v680'
  };
  const readCount = key => {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(data) ? data.length : null;
    } catch (_) { return null; }
  };
  const snapshot = () => ({
    timestamp: new Date().toISOString(),
    online: navigator.onLine,
    loadedRelease: window.__RUNLU_LOADED_RELEASE__ || null,
    declaredBuild: document.documentElement.getAttribute('data-runlu-build'),
    versionLabel: document.getElementById('headerVersion')?.textContent?.trim() || null,
    queueCount: readCount(KEYS.queue),
    conflictCount: readCount(KEYS.conflicts),
    cloudSyncAvailable: typeof window.runluCloudMasterSync === 'function',
    cloudSessionAvailable: typeof window.cloudSession === 'function',
    mobileCacheDrainLoaded: !!window.RUNLUMobileCacheDrainBuild142,
    cloudMasterAuthorityLoaded: !!window.__RUNLU_BUILD138_CLOUD_MASTER_AUTHORITY__,
    location: location.origin + location.pathname
  });
  window.RUNLUSyncDiagnostics = Object.freeze({ snapshot });
})();
