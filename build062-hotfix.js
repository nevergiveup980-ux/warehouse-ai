// RUNLU Warehouse AI V6.6.1 Build062 — Carpet Cloud Reconciliation + Desktop Workbench
(() => {
  if (window.__RUNLU_BUILD062__) return;
  window.__RUNLU_BUILD062__ = true;

  const BUILD062_VERSION = '6.6.1';
  const BUILD062_BUILD = '062';
  const BUILD062_STYLE_ID = 'runlu-build062-desktop-css';
  const CARPET_MERGE_AUDIT_KEY = 'runlu_build062_carpet_merge_audit';

  const byId = id => document.getElementById(id);
  const txt = v => String(v ?? '').trim();
  const normRoll = v => txt(v).toUpperCase().replace(/\s+/g,'').replace(/^RC[-\s]?/,'');
  const parseMs = v => {
    if (!v) return 0;
    const n = new Date(v).getTime();
    return Number.isFinite(n) ? n : 0;
  };
  const recordMs = r => Math.max(
    parseMs(r?.updatedAt),
    parseMs(r?.lastUpdatedAt),
    parseMs(r?.updated),
    parseMs(r?.transferredAt),
    parseMs(r?.createdAt),
    parseMs(r?.created)
  );
  const carpetKey = r => {
    const roll = normRoll(r?.roll || r?.sourceRoll);
    if (roll) return 'ROLL:' + roll;
    const id = txt(r?.id);
    if (id) return 'ID:' + id;
    return 'FALLBACK:' + [r?.collection,r?.colour,r?.location,r?.manufacturerRoll,r?.lot].map(x=>txt(x).toUpperCase()).join('|');
  };
  const nonBlankOverlay = (base, newer) => {
    const out = {...(base||{})};
    for (const [k,v] of Object.entries(newer||{})) {
      if (v !== '' && v !== null && v !== undefined) out[k] = v;
      else if (!(k in out)) out[k] = v;
    }
    return out;
  };

  function mergeCarpetArrays(localRows, remoteRows) {
    const local = Array.isArray(localRows) ? localRows : [];
    const remote = Array.isArray(remoteRows) ? remoteRows : [];
    const map = new Map();
    const origin = new Map();
    let remoteOnly = 0, localOnly = 0, reconciled = 0;

    for (const r of local) {
      const k = carpetKey(r);
      map.set(k, {...r});
      origin.set(k, 'local');
    }
    for (const r of remote) {
      const k = carpetKey(r);
      if (!map.has(k)) {
        map.set(k, {...r});
        origin.set(k, 'remote');
        remoteOnly++;
        continue;
      }
      const l = map.get(k);
      const lm = recordMs(l), rm = recordMs(r);
      const newer = rm > lm ? r : l;
      const older = rm > lm ? l : r;
      const merged = nonBlankOverlay(older, newer);
      if (JSON.stringify(merged) !== JSON.stringify(l)) reconciled++;
      map.set(k, merged);
      origin.set(k, 'both');
    }
    for (const [k,o] of origin) if (o === 'local') localOnly++;
    const merged = [...map.values()].sort((a,b)=>{
      const ar=txt(a.roll), br=txt(b.roll);
      return ar.localeCompare(br, undefined, {numeric:true, sensitivity:'base'});
    });
    return {merged, remoteOnly, localOnly, reconciled, localCount:local.length, remoteCount:remote.length};
  }

  function injectDesktopWorkbenchCSS() {
    if (byId(BUILD062_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = BUILD062_STYLE_ID;
    style.textContent = `
      @media (min-width: 1100px) {
        body { overflow-x: hidden; }
        .page {
          width: 100% !important;
          max-width: none !important;
          padding-left: clamp(22px, 3vw, 56px) !important;
          padding-right: clamp(22px, 3vw, 56px) !important;
          box-sizing: border-box;
        }
        .page > .card, .page > .mapGrid, .page > .operationsMobileList,
        .page > .carpetWorkbenchHero {
          width: 100% !important;
          max-width: none !important;
          box-sizing: border-box;
        }
        .formgrid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          column-gap: clamp(16px, 2vw, 30px) !important;
        }
        .formgrid .full { grid-column: 1 / -1 !important; }
        .actions { align-items: center; }
        .actions button { min-height: 42px; }
        .listToolbar, .globalSearchBar { max-width: none !important; }
        .mapGrid {
          grid-template-columns: repeat(auto-fit, minmax(245px, 1fr)) !important;
        }
        .reportGrid, .summaryStrip {
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)) !important;
        }
        .carpetActionHub {
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)) !important;
        }
        #settings > .card {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          align-items: start;
        }
        #settings > .card > .back,
        #settings > .card > h2 {
          grid-column: 1 / -1;
        }
        #settings > .card > .settingRow {
          min-width: 0;
          margin: 0 !important;
          height: 100%;
          box-sizing: border-box;
        }
        #settings > .card > .settingRow:has(#cloudStatus),
        #settings > .card > .settingRow:has(#backupStatus) {
          grid-column: 1 / -1;
          height: auto;
        }
        #settings input[type="email"],
        #settings input[type="password"],
        #settings input[type="url"],
        #settings input:not([type]) {
          max-width: 720px;
        }
        #cloudSyncDetails, #cloudStatus {
          line-height: 1.55;
        }
        .runluCloudInspector {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 10px;
        }
        .runluCloudInspectorCard {
          border: 1px solid #d8e0eb;
          border-radius: 14px;
          background: #f8fafc;
          padding: 12px 14px;
          min-width: 0;
        }
        .runluCloudInspectorCard b { display:block; margin-bottom:4px; color:#132238; }
        .runluCloudInspectorCard span { color:#667085; font-size: 13px; }
        .runluCloudInspectorCard.issue { border-color:#f7c2c2; background:#fff7f7; }
        .runluCloudInspectorCard.pending { border-color:#f4d48c; background:#fffaf0; }
        .runluCloudInspectorCard.ok { border-color:#b7e3c6; background:#f4fbf6; }
      }
      @media (min-width: 1500px) {
        #settings > .card { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        #settings > .card > .settingRow:has(#cloudStatus),
        #settings > .card > .settingRow:has(#backupStatus) { grid-column: span 2; }
        .carpetActionHub { grid-template-columns: repeat(4, minmax(240px, 1fr)) !important; }
      }
      @media (max-width: 1099px) {
        .runluCloudInspector { display:block; }
        .runluCloudInspectorCard { margin-top:8px; }
      }
    `;
    document.head.appendChild(style);
  }

  function installHeaderCloudLink() {
    const pill = byId('headerCloudPill') || byId('cloudPill');
    if (!pill) return;
    pill.style.cursor = 'pointer';
    pill.title = 'Open Cloud Sync status and conflict details';
    pill.onclick = () => {
      try {
        if (typeof showPage === 'function') showPage('settings');
        setTimeout(() => {
          const target = byId('cloudStatus');
          if (target) target.scrollIntoView({behavior:'smooth', block:'center'});
          renderBuild062Inspector();
        }, 120);
      } catch(e) { console.warn('[Build062] cloud pill navigation', e); }
    };
  }

  function datasetStateCard(key, conflicts, dirty) {
    let label = key;
    try { if (typeof cloudDatasetLabel === 'function') label = cloudDatasetLabel(key); } catch {}
    const isConflict = conflicts.includes(key), isDirty = dirty.includes(key);
    let cls='ok', state='Synced / no local change';
    if (isConflict) { cls='issue'; state='Conflict — changed on this device and another device'; }
    else if (isDirty) { cls='pending'; state='Pending upload from this device'; }
    if (typeof CARPETDB !== 'undefined' && key === CARPETDB && isConflict) {
      state += ' · Build062 can safely merge carpet rolls by roll identity';
    }
    const safeLabel = typeof esc==='function'?esc(label):label;
    const safeState = typeof esc==='function'?esc(state):state;
    return `<div class="runluCloudInspectorCard ${cls}"><b>${safeLabel}</b><span>${safeState}</span></div>`;
  }

  function renderBuild062Inspector() {
    const details = byId('cloudSyncDetails');
    if (!details || typeof DATA_KEYS === 'undefined') return;
    let host = byId('runluBuild062Inspector');
    if (!host) {
      host = document.createElement('div');
      host.id = 'runluBuild062Inspector';
      host.className = 'runluCloudInspector';
      details.insertAdjacentElement('afterend', host);
    }
    let conflicts=[], dirty=[];
    try { conflicts = typeof cloudConflictKeys==='function' ? cloudConflictKeys() : []; } catch {}
    try { dirty = typeof cloudDirtyKeys==='function' ? cloudDirtyKeys() : []; } catch {}
    const relevant = [...new Set([...conflicts, ...dirty])];
    if (!relevant.length) {
      host.innerHTML = `<div class="runluCloudInspectorCard ok"><b>Cloud datasets</b><span>No pending or conflicting dataset is currently flagged on this device.</span></div>`;
      return;
    }
    host.innerHTML = relevant.map(k=>datasetStateCard(k,conflicts,dirty)).join('');
  }

  function installCarpetReconcileButton() {
    const status = byId('cloudStatus');
    if (!status) return;
    const row = status.closest('.settingRow');
    const actions = row?.querySelector('.actions');
    if (!actions || byId('build062CarpetReconcileBtn')) return;
    const b = document.createElement('button');
    b.id = 'build062CarpetReconcileBtn';
    b.type = 'button';
    b.className = 'green';
    b.textContent = 'Reconcile Carpet Inventory';
    b.title = 'Safely merge carpet rolls from this device and the cloud without replacing the whole database.';
    b.onclick = async () => {
      b.disabled = true;
      const old = b.textContent;
      b.textContent = 'Reconciling…';
      try { await reconcileCarpetCloudBuild062(false); }
      finally { b.disabled=false; b.textContent=old; }
    };
    actions.insertBefore(b, actions.querySelector('[onclick*="cloudUploadAll"]') || null);
  }

  async function reconcileCarpetCloudBuild062(silent=true) {
    if (typeof CARPETDB === 'undefined' || typeof cloudEnsureSession !== 'function') return {skipped:true, reason:'Cloud functions unavailable'};
    const s = await cloudEnsureSession();
    if (!s) return {skipped:true, reason:'Not signed in'};
    if (localStorage.getItem(CLOUD_ENABLED_KEY) !== '1') return {skipped:true, reason:'Cloud sync not enabled'};
    if (typeof protectedInputActive === 'function' && protectedInputActive()) return {skipped:true, reason:'Data entry is open'};

    const rows = await cloudFetchRows();
    const remoteRow = rows.find(r=>r.dataset_key===CARPETDB);
    const localRows = typeof carpetRecords==='function' ? carpetRecords() : (()=>{try{return JSON.parse(localStorage.getItem(CARPETDB)||'[]')}catch{return[]}})();

    if (!remoteRow) {
      if (localRows.length && typeof cloudPutDatasetInitial === 'function') {
        await cloudPutDatasetInitial(CARPETDB, localRows, s);
        if (typeof clearCloudDirty==='function') clearCloudDirty(CARPETDB);
        if (typeof clearCloudConflict==='function') clearCloudConflict(CARPETDB);
      }
      if (!silent) alert(`Carpet Inventory cloud copy created from this device (${localRows.length} roll(s)).`);
      return {localCount:localRows.length, remoteCount:0, mergedCount:localRows.length, remoteOnly:0, localOnly:localRows.length};
    }

    const remoteRows = typeof cloudHydratePayload==='function'
      ? await cloudHydratePayload(remoteRow.payload, s)
      : remoteRow.payload;
    const result = mergeCarpetArrays(localRows, remoteRows);
    const localJson = JSON.stringify(localRows);
    const mergedJson = JSON.stringify(result.merged);

    if (localJson !== mergedJson) {
      const priorApplying = typeof cloudApplying!=='undefined' ? cloudApplying : false;
      try {
        if (typeof cloudApplying!=='undefined') cloudApplying = true;
        localStorage.setItem(CARPETDB, mergedJson);
      } finally {
        if (typeof cloudApplying!=='undefined') cloudApplying = priorApplying;
      }
    }

    // Both device and cloud copies were read first and merged by stable roll identity.
    // The merged union can now safely replace only the Carpet Inventory dataset.
    if (typeof cloudPutDatasetInitial === 'function') {
      await cloudPutDatasetInitial(CARPETDB, result.merged, s);
    }

    const fresh = await cloudFetchRows();
    const freshCarpet = fresh.find(r=>r.dataset_key===CARPETDB);
    if (freshCarpet?.updated_at && typeof CLOUD_DATASET_SEEN_PREFIX!=='undefined') {
      localStorage.setItem(CLOUD_DATASET_SEEN_PREFIX+CARPETDB, freshCarpet.updated_at);
    }
    if (typeof clearCloudDirty==='function') clearCloudDirty(CARPETDB);
    if (typeof clearCloudConflict==='function') clearCloudConflict(CARPETDB);
    if (typeof cloudRememberSummary==='function') cloudRememberSummary(fresh);
    if (typeof rememberCloudDatasetVersions==='function') rememberCloudDatasetVersions(fresh,false,[CARPETDB]);
    try {
      localStorage.setItem(CARPET_MERGE_AUDIT_KEY, JSON.stringify({
        at:new Date().toISOString(),
        localBefore:result.localCount,
        cloudBefore:result.remoteCount,
        merged:result.merged.length,
        addedFromCloud:result.remoteOnly,
        preservedFromDevice:result.localOnly,
        reconciled:result.reconciled
      }));
    } catch {}

    try {
      if (typeof renderCloudStatus==='function') renderCloudStatus();
      if (typeof renderCarpetInventory==='function') renderCarpetInventory();
      if (typeof renderDashboard==='function') renderDashboard();
      renderBuild062Inspector();
    } catch(e) { console.warn('[Build062] refresh after carpet reconcile', e); }

    if (!silent) {
      alert(
        `Carpet Inventory reconciled safely.\n\n`+
        `This device before: ${result.localCount} roll(s)\n`+
        `Cloud before: ${result.remoteCount} roll(s)\n`+
        `Merged: ${result.merged.length} roll(s)\n`+
        `Added from cloud: ${result.remoteOnly}\n`+
        `Preserved from this device: ${result.localOnly}\n\n`+
        `No whole-device upload or download was used.`
      );
    }
    return {...result, mergedCount:result.merged.length};
  }
  window.reconcileCarpetCloudBuild062 = reconcileCarpetCloudBuild062;

  function wrapCloudSync() {
    if (typeof cloudSyncNow === 'function' && !cloudSyncNow.__b62wrapped) {
      const oldSync = cloudSyncNow;
      const wrapped = async function() {
        try {
          const conflicts = typeof cloudConflictKeys==='function' ? cloudConflictKeys() : [];
          const dirty = typeof cloudDirtyKeys==='function' ? cloudDirtyKeys() : [];
          const carpetNeeds = typeof CARPETDB!=='undefined' && (conflicts.includes(CARPETDB) || dirty.includes(CARPETDB));
          if (carpetNeeds) await reconcileCarpetCloudBuild062(true);
        } catch(e) {
          console.warn('[Build062] carpet pre-sync reconciliation skipped:', e);
        }
        const out = await oldSync();
        try { renderBuild062Inspector(); installHeaderCloudLink(); } catch {}
        return out;
      };
      wrapped.__b62wrapped = true;
      window.cloudSyncNow = wrapped;
    }
  }

  function patchStatusRendering() {
    if (typeof renderCloudStatus === 'function' && !renderCloudStatus.__b62wrapped) {
      const old = renderCloudStatus;
      const wrapped = function(message='') {
        const out = old(message);
        setTimeout(()=>{renderBuild062Inspector(); installHeaderCloudLink(); installCarpetReconcileButton();},0);
        return out;
      };
      wrapped.__b62wrapped = true;
      window.renderCloudStatus = wrapped;
    }
  }

  async function backgroundCarpetRecovery() {
    try {
      if (document.visibilityState !== 'visible') return;
      if (typeof protectedInputActive==='function' && protectedInputActive()) return;
      const conflicts = typeof cloudConflictKeys==='function' ? cloudConflictKeys() : [];
      const dirty = typeof cloudDirtyKeys==='function' ? cloudDirtyKeys() : [];
      const carpetNeeds = typeof CARPETDB!=='undefined' && (conflicts.includes(CARPETDB) || dirty.includes(CARPETDB));
      if (carpetNeeds) await reconcileCarpetCloudBuild062(true);
    } catch(e) { console.warn('[Build062] background carpet recovery:', e); }
  }

  function showBuild062Version() {
    const hv = byId('headerVersion');
    if (hv) hv.textContent = 'V'+BUILD062_VERSION;
    document.documentElement.setAttribute('data-runlu-build','062');
  }

  function bootBuild062() {
    injectDesktopWorkbenchCSS();
    showBuild062Version();
    patchStatusRendering();
    wrapCloudSync();
    installHeaderCloudLink();
    installCarpetReconcileButton();
    renderBuild062Inspector();
    setTimeout(backgroundCarpetRecovery, 1200);
    window.addEventListener('online', ()=>setTimeout(backgroundCarpetRecovery,350));
    window.addEventListener('focus', ()=>setTimeout(backgroundCarpetRecovery,350));
    document.addEventListener('visibilitychange', ()=>{if(document.visibilityState==='visible')setTimeout(backgroundCarpetRecovery,350)});
  }

  if (document.readyState === 'complete') bootBuild062();
  else window.addEventListener('load', bootBuild062, {once:true});
})();
