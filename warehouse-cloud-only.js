// One in-memory snapshot for all inventory views. No browser storage dependency.
(function (root) {
  'use strict';

  const rollKey = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const rollQuery = value => /^(?:RC[\s-]*)?\d{3,}(?:-\d+)?$/i.test(String(value).trim());
  function matchesRoll(row, query) {
    const key = rollKey(query);
    const roll = rollKey(row.roll);
    return roll === key || (/^\d/.test(key) && roll === 'RC' + key);
  }

  function createSnapshot({ keys, documentKey, fetchPage }) {
    let datasets = null;
    let inFlight = null;
    let epoch = 0;
    let status = 'idle';
    let issue = '';
    const uiIds = new Map();
    let nextUiId = 0;

    function clear() {
      epoch++;
      datasets = null;
      inFlight = null;
      status = 'idle';
      issue = '';
    }

    function refresh(account) {
      if (inFlight) return inFlight;
      const revision = epoch;
      status = 'loading';
      issue = '';
      inFlight = (async () => {
        const next = new Map(keys.map(key => [key, key === documentKey ? {} : []]));
        const seen = new Set();
        for (let offset = 0; ; ) {
          const page = await fetchPage(account, offset);
          if (revision !== epoch) return false;
          if (!Array.isArray(page)) throw new Error('Invalid warehouse response.');
          if (!page.length) break;
          for (const row of page) {
            if (!next.has(row.dataset_key) || !row.record_id || !row.payload ||
                typeof row.payload !== 'object' || Array.isArray(row.payload)) {
              throw new Error('Invalid warehouse record.');
            }
            const key = JSON.stringify([row.dataset_key, row.record_id]);
            if (seen.has(key)) throw new Error('Repeated cloud record identity; refresh required.');
            seen.add(key);
            if (row.dataset_key === documentKey) {
              if (row.record_id !== '__document__') throw new Error('Unexpected settings record.');
              next.set(documentKey, row.payload);
              continue;
            }
            if (!uiIds.has(key)) uiIds.set(key, ++nextUiId);
            next.get(row.dataset_key).push({
              ...row.payload,
              _cloudRecordId: String(row.record_id),
              _cloudVersion: row.version,
              _cloudUiId: uiIds.get(key),
            });
          }
          offset += page.length;
        }
        if (revision !== epoch) return false;
        datasets = next;
        status = 'ready';
        return true;
      })().catch(error => {
        if (revision === epoch) {
          datasets = null;
          status = 'error';
          issue = String(error?.message || error);
        }
        return false;
      }).finally(() => {
        if (revision === epoch) inFlight = null;
      });
      return inFlight;
    }

    return {
      refresh,
      clear,
      read: key => structuredClone(datasets?.get(key) ?? (key === documentKey ? {} : [])),
      get status() { return status; },
      get issue() { return issue; },
    };
  }

  root.WarehouseCloudOnly = { createSnapshot, rollKey, rollQuery, matchesRoll };
})(globalThis);
