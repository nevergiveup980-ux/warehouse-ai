// RUNLU Warehouse OS · Verified Receipt Certificate Publisher V0.9 CANDIDATE
// Publishes a minimal, fail-closed proof only after actual Warehouse inventory impact.
// IMPORTANT: this file is not loaded by release-loader.js and does not change production behavior.
(() => {
  'use strict';
  if (window.__RUNLU_WAREHOUSE_RECEIPT_CERT_V090__) return;
  window.__RUNLU_WAREHOUSE_RECEIPT_CERT_V090__ = true;

  const VERSION = '0.9.0';
  const RPC = 'flooring_verify_supplier_receipt';
  const DEFAULT_ENVIRONMENT = 'training';

  const canonicalPO = value => {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits && Number(digits) > 0 ? String(Number(digits)) : '';
  };
  const quantity = value => {
    if (value == null || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const text = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const normalized = value => text(value).toLowerCase();
  const unit = value => normalized(value).replace(/s$/, '');
  const taskQty = item => quantity(item?.qty ?? item?.quantity);
  const operationQty = operation => quantity(operation?.quantity ?? operation?.requestedQuantity);
  const operationType = operation => normalized(operation?.type);
  const receivingType = operation => operationType(operation) === normalized('Supplier Pickup / Receiving / Put-away');

  function taskLineIdentity(item = {}) {
    return {
      style: normalized(item.style || item.product || item.description || item.sku || ''),
      colour: normalized(item.colour || item.color || ''),
      unit: unit(item.unit || ''),
      qty: taskQty(item)
    };
  }

  function receivedLineIdentity(item = {}) {
    return {
      style: normalized(item.style || item.product || item.description || item.sku || ''),
      colour: normalized(item.colour || item.color || ''),
      orderedQty: quantity(item.ordered_qty ?? item.orderedQty),
      receivedQty: quantity(item.received_qty ?? item.receivedQty)
    };
  }

  function validateTask(task) {
    if (!task?.id) return { ok: false, code: 'TASK_ID_MISSING' };
    const po = canonicalPO(task.po_number ?? task.poNumber);
    if (!po) return { ok: false, code: 'TASK_PO_MISSING' };
    if (!['Ready', 'Completed'].includes(String(task.status || ''))) return { ok: false, code: 'TASK_NOT_FINAL' };
    const ordered = Array.isArray(task.items) ? task.items : [];
    const received = Array.isArray(task.received_items) ? task.received_items : [];
    if (!ordered.length || ordered.length !== received.length) return { ok: false, code: 'TASK_LINE_COUNT' };
    const verifiedItems = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const expected = taskLineIdentity(ordered[index]);
      const actual = receivedLineIdentity(received[index]);
      if (!(expected.qty > 0) || !(actual.orderedQty > 0) || !(actual.receivedQty > 0)) return { ok: false, code: 'INVALID_QUANTITY', line: index };
      if (expected.qty !== actual.orderedQty || actual.orderedQty !== actual.receivedQty) return { ok: false, code: 'NOT_FULL_RECEIPT', line: index, ordered: expected.qty, received: actual.receivedQty };
      if (expected.style && actual.style && expected.style !== actual.style) return { ok: false, code: 'RECEIVED_PRODUCT_MISMATCH', line: index };
      if (expected.colour && actual.colour && expected.colour !== actual.colour) return { ok: false, code: 'RECEIVED_COLOUR_MISMATCH', line: index };
      verifiedItems.push({
        style: text(ordered[index].style || ordered[index].product || ordered[index].description || ordered[index].sku || ''),
        colour: text(ordered[index].colour || ordered[index].color || ''),
        unit: text(ordered[index].unit || ''),
        ordered_qty: expected.qty,
        received_qty: actual.receivedQty
      });
    }
    return { ok: true, po, ordered, received, verifiedItems };
  }

  function validateOperations(taskValidation, operations) {
    if (!Array.isArray(operations) || operations.length !== taskValidation.verifiedItems.length) return { ok: false, code: 'OPERATION_LINE_COUNT' };
    const seen = new Set();
    const operationIds = [];
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index] || {};
      const id = String(operation.id ?? '').trim();
      if (!id) return { ok: false, code: 'OPERATION_ID_MISSING', line: index };
      if (seen.has(id)) return { ok: false, code: 'DUPLICATE_OPERATION_ID', line: index };
      seen.add(id);
      if (operation.status !== 'Completed' || operation.impactApplied !== true) return { ok: false, code: 'OPERATION_NOT_APPLIED', line: index };
      if (!receivingType(operation)) return { ok: false, code: 'WRONG_OPERATION_TYPE', line: index };
      if (canonicalPO(operation.po) !== taskValidation.po) return { ok: false, code: 'OPERATION_PO_MISMATCH', line: index };
      const expected = taskValidation.verifiedItems[index];
      const actualQty = operationQty(operation);
      if (!(actualQty > 0) || actualQty !== expected.ordered_qty) return { ok: false, code: 'OPERATION_QUANTITY_MISMATCH', line: index };
      if (expected.unit && operation.unit && unit(operation.unit) !== unit(expected.unit)) return { ok: false, code: 'OPERATION_UNIT_MISMATCH', line: index };
      operationIds.push(id);
    }
    return { ok: true, operationIds };
  }

  function stablePayload(task, taskValidation, operationValidation, options = {}) {
    const runtimeVersion = String(options.runtimeVersion || window.RUNLU_VERSION || window.APP_VERSION || '').trim();
    const runtimeBuild = String(options.runtimeBuild || window.RUNLU_BUILD || window.APP_BUILD || '').trim();
    const environment = String(options.environment || DEFAULT_ENVIRONMENT).trim() || DEFAULT_ENVIRONMENT;
    const taskId = String(task.id);
    const certificateKey = [environment, taskId, taskValidation.po, ...operationValidation.operationIds].join('|');
    return {
      environment,
      task_id: taskId,
      po_number: taskValidation.po,
      operation_ids: operationValidation.operationIds.slice(),
      verified_items: taskValidation.verifiedItems.map(item => ({ ...item })),
      runtime_version: runtimeVersion,
      runtime_build: runtimeBuild,
      certificate_key: certificateKey
    };
  }

  async function sha256(value) {
    if (!window.crypto?.subtle || typeof TextEncoder !== 'function') throw new Error('Secure digest API is unavailable. Receipt proof was not published.');
    const data = new TextEncoder().encode(String(value));
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function buildCertificate(task, operations, options = {}) {
    const taskValidation = validateTask(task);
    if (!taskValidation.ok) return taskValidation;
    const operationValidation = validateOperations(taskValidation, operations);
    if (!operationValidation.ok) return operationValidation;
    const payload = stablePayload(task, taskValidation, operationValidation, options);
    const fingerprint = await sha256(JSON.stringify(payload));
    return {
      ok: true,
      payload,
      fingerprint,
      consumerFields: {
        inventory_verified: true,
        inventory_verified_po_number: payload.po_number,
        inventory_operation_ids: payload.operation_ids.slice(),
        inventory_verified_items: payload.verified_items.map(item => ({ ordered_qty: item.ordered_qty, received_qty: item.received_qty })),
        inventory_certificate_key: payload.certificate_key,
        inventory_certificate_fingerprint: fingerprint
      }
    };
  }

  async function publish(task, operations, options = {}) {
    const certificate = await buildCertificate(task, operations, options);
    if (!certificate.ok) return certificate;
    if (typeof cloudEnsureSession !== 'function' || typeof cloudRequest !== 'function' || typeof cloudHeaders !== 'function') return { ok: false, code: 'CLOUD_AUTHORITY_UNAVAILABLE' };
    let session;
    try { session = await cloudEnsureSession(); } catch (error) { return { ok: false, code: 'CLOUD_SESSION_FAILED', error: error?.message || String(error) }; }
    if (!session?.access_token) return { ok: false, code: 'CLOUD_SIGN_IN_REQUIRED' };
    const args = {
      p_environment: certificate.payload.environment,
      p_task_id: certificate.payload.task_id,
      p_po_number: Number(certificate.payload.po_number),
      p_operation_ids: certificate.payload.operation_ids,
      p_verified_items: certificate.payload.verified_items,
      p_certificate_key: certificate.payload.certificate_key,
      p_fingerprint: certificate.fingerprint,
      p_runtime_version: certificate.payload.runtime_version || null,
      p_runtime_build: certificate.payload.runtime_build || null
    };
    try {
      const response = await cloudRequest('/rest/v1/rpc/' + RPC, {
        method: 'POST',
        headers: cloudHeaders(session.access_token, true),
        body: JSON.stringify(args)
      });
      const result = Array.isArray(response) ? response[0] : response;
      if (!result || result.ok === false) return { ok: false, code: result?.code || 'CERTIFICATE_RPC_REJECTED', result: result || null };
      if (result.conflict === true) return { ok: false, code: 'CERTIFICATE_CONFLICT', result };
      return {
        ok: true,
        changed: result.changed !== false,
        code: result.code || (result.changed === false ? 'ALREADY_PUBLISHED' : 'PUBLISHED'),
        certificate,
        result
      };
    } catch (error) {
      return { ok: false, code: 'CERTIFICATE_PUBLISH_FAILED', error: error?.message || String(error), certificate };
    }
  }

  window.RUNLUWarehouseReceiptCertificateV090 = {
    version: VERSION,
    rpc: RPC,
    validateTask,
    validateOperations,
    buildCertificate,
    publish,
    canonicalPO,
    requiresActualImpact: true,
    requiresFullReceipt: true,
    operationIdsUnique: true,
    productionAutoInstall: false
  };
})();
