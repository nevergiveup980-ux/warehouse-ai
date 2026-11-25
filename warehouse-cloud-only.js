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
      get hasData() { return datasets !== null; },
      get issue() { return issue; },
    };
  }

  const systemFields = new Set(['_cloudRecordId', '_cloudVersion', '_cloudUiId', '_cloudNewRecordId', 'legacyPayloadId']);
  function commandChanges(dataset, before, after, canonical, newId = () => crypto.randomUUID()) {
    const key = row => row._cloudRecordId || 'payload:' + row.id;
    const originals = new Map(before.map(row => [key(row), row]));
    const cloudRows = new Map(canonical.map(row => [key(row), row]));
    const changes = [];
    const seen = new Set();
    for (const row of after) {
      const identity = key(row);
      if (seen.has(identity)) throw new Error('A record was selected more than once.');
      seen.add(identity);
      const prior = originals.get(identity);
      const raw = cloudRows.get(identity);
      if (row._cloudRecordId && !raw) throw new Error('The record is no longer available.');
      const payload = {};
      for (const [field, value] of Object.entries(raw || {})) {
        if (!systemFields.has(field)) payload[field] = value;
      }
      let edited = !prior;
      for (const field of new Set([...Object.keys(row), ...Object.keys(prior || {})])) {
        if (systemFields.has(field) || (raw && (field === 'id' || field === 'canonicalId'))) continue;
        if (JSON.stringify(row[field]) === JSON.stringify(prior?.[field])) continue;
        edited = true;
        if (row[field] === undefined) delete payload[field];
        else payload[field] = row[field];
      }
      if (edited) changes.push({ dataset, recordId: raw?._cloudRecordId || row._cloudNewRecordId || newId(), version: raw?._cloudVersion || 0, payload });
    }
    for (const [identity, raw] of cloudRows) {
      if (!seen.has(identity)) changes.push({ dataset, recordId: raw._cloudRecordId, version: raw._cloudVersion, delete: true, payload: {} });
    }
    return changes;
  }

  root.WarehouseCloudOnly = { createSnapshot, rollKey, rollQuery, matchesRoll, commandChanges };
})(globalThis);
