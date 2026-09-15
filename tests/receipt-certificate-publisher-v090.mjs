import fs from 'node:fs';
import vm from 'node:vm';
import crypto, { webcrypto } from 'node:crypto';

const PUBLISHER_FILE = 'warehouse-receipt-certificate-v090.js';
const FLOORING_ACK_FILE = '_lab_runlu_ca/flooring/warehouse-receipt-ack-v098.js';
const INDEX_FILE = 'index.html';
const VERSION_FILE = 'version.json';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const publisherSource = read(PUBLISHER_FILE);
const flooringAckSource = read(FLOORING_ACK_FILE);
const indexSource = read(INDEX_FILE);
const version = JSON.parse(read(VERSION_FILE));
const cycles = Math.max(100, Number(process.env.RUNLU_CERT_CYCLES || 1000));
const sha = source => crypto.createHash('sha256').update(source).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const must = (condition, message) => { if (!condition) throw new Error(message); };

const W = {
  INVDB: 'runlu_inventory_records_v21', ODB: 'runlu_orders_v20', EVENTDB: 'runlu_event_history_v52', PMDB: 'runlu_product_master_v21',
  CARPETDB: 'runlu_carpet_inventory_v52', CUTDB: 'runlu_cutting_log_v52', RAMDB: 'runlu_remnants_v55'
};
const F = {
  PO: 'runlu_deerfoot_supplier_orders_v1', CALL: 'runlu_people_to_call_v066', CACHE: 'runlu-flooring-warehouse-work-v090'
};

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { key = String(key); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    seed(key, value) { map.set(String(key), typeof value === 'string' ? value : JSON.stringify(value)); },
    raw(key) { return map.get(String(key)) ?? null; },
    json(key) { return JSON.parse(map.get(String(key)) || 'null'); },
    snapshot() { return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))); }
  };
}
function quietConsole() { return { log() {}, info() {}, warn() {}, error() {}, debug() {} }; }

function extractFunction(name) {
  const needle = `function ${name}`;
  const start = indexSource.indexOf(needle);
  if (start < 0) throw new Error('Warehouse function missing: ' + name);
  const open = indexSource.indexOf('(', start);
  let parenDepth = 0, quote = '', escaped = false, lineComment = false, blockComment = false, close = -1;
  for (let i = open; i < indexSource.length; i += 1) {
    const c = indexSource[i], n = indexSource[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) { escaped = false; continue; } if (c === '\\') { escaped = true; continue; } if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(') parenDepth += 1;
    else if (c === ')' && --parenDepth === 0) { close = i; break; }
  }
  const brace = indexSource.indexOf('{', close + 1);
  let depth = 0;
  quote = ''; escaped = false; lineComment = false; blockComment = false;
  for (let i = brace; i < indexSource.length; i += 1) {
    const c = indexSource[i], n = indexSource[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) { escaped = false; continue; } if (c === '\\') { escaped = true; continue; } if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return indexSource.slice(start, i + 1);
  }
  throw new Error('Unclosed Warehouse function: ' + name);
}

const exactFunctionNames = [
  'load', 'save', 'normalizeText', 'normKey', 'loadMasters', 'loadInventoryRecords', 'inventoryRecordIdentity',
  'findInventoryRecordByIdentity', 'ensureOperationProductLink', 'operationStockQuantity', 'operationStockUnit',
  'carpetTransferParts', 'validateOperationForImpact', 'applyInventoryDelta', 'applyInventoryTransfer',
  'updateLinkedOrder', 'applySingleOperationImpact'
];
const exactWarehouseSource = exactFunctionNames.map(extractFunction).join('\n\n');

function bootWarehouse() {
  const localStorage = memoryStorage();
  const alerts = [];
  const document = { documentElement: { setAttribute() {} }, getElementById() { return null; } };
  const box = {
    console: quietConsole(), localStorage, document, ...W,
    Date, JSON, Math, Number, String, Array, Object, Boolean, RegExp, Error, TypeError, Promise, Map, Set,
    alert(message) { alerts.push(String(message)); }, queueCloudSave() {}, isQuotaError() { return false; },
    pruneLocalApplicationCache() { return {}; }, aggressiveSafeStorageCleanup() { return {}; }, renderBackupStatus() {},
    underlaymentSpec() { return null; }, normalizeInventoryLifecycleRecord(record) { return record; }, finalizeCustomerOrderInventory() { return { records: 0, quantity: 0 }; },
    fetch() { throw new Error('LAB blocked Warehouse fetch'); },
    XMLHttpRequest: class { constructor() { throw new Error('LAB blocked Warehouse XMLHttpRequest'); } },
    WebSocket: class { constructor() { throw new Error('LAB blocked Warehouse WebSocket'); } }
  };
  box.window = box;
  box.window.addEventListener = () => {};
  vm.createContext(box, { name: 'RUNLU Warehouse Exact Receipt V0.9' });
  vm.runInContext(exactWarehouseSource, box, { filename: 'index.html#exact-receipt-functions', timeout: 2000 });
  return { localStorage, alerts, box };
}

function seedWarehouse(env) {
  env.localStorage.seed(W.PMDB, [
    { id: 'P1', name: 'LAB TILE', color: 'GREY' },
    { id: 'P2', name: 'LAB ADHESIVE', color: 'WHITE' }
  ]);
  env.localStorage.seed(W.INVDB, [
    { id: 'INV1', inventoryId: 'INV1', masterId: 'P1', location: 'A1', quantity: 0, unit: 'Box', inventoryType: 'GENERAL', lifecycleStatus: 'ACTIVE', warehouseScope: 'warehouse' },
    { id: 'INV2', inventoryId: 'INV2', masterId: 'P2', location: 'A2', quantity: 0, unit: 'Pail', inventoryType: 'GENERAL', lifecycleStatus: 'ACTIVE', warehouseScope: 'warehouse' }
  ]);
  env.localStorage.seed(W.ODB, []); env.localStorage.seed(W.EVENTDB, []); env.localStorage.seed(W.CARPETDB, []); env.localStorage.seed(W.CUTDB, []); env.localStorage.seed(W.RAMDB, []);
}

function receive(env, args) {
  const operation = {
    id: args.id, status: 'Completed', type: 'Supplier Pickup / Receiving / Put-away', inventoryMode: 'Stock',
    productId: args.productId, inventoryRecordId: args.inventoryRecordId, product: args.product,
    quantity: args.quantity, unit: args.unit, location: args.location, po: String(args.po), date: '2026-09-15', supplier: 'LAB SUPPLIER'
  };
  must(env.box.applySingleOperationImpact(operation) === true, 'exact Warehouse receive failed: ' + (env.alerts.at(-1) || 'unknown'));
  must(operation.impactApplied === true, 'exact Warehouse operation lacks impactApplied');
  return operation;
}

function makeTask(po, lines = [{ style: 'LAB TILE', colour: 'GREY', qty: 10, unit: 'box' }]) {
  return {
    id: 'TASK-' + po, po_number: Number(po), status: 'Ready', fulfillment_method: 'Pickup',
    items: clone(lines),
    received_items: lines.map(line => ({ style: line.style, colour: line.colour, ordered_qty: String(line.qty), received_qty: String(line.qty), condition: 'OK' }))
  };
}

function fakeReceiptAuthority(initialTask, options = {}) {
  let task = clone(initialTask);
  let stored = null;
  let calls = 0;
  let signedIn = options.signedIn !== false;
  let throwNext = false;
  let presetConflict = false;
  return {
    async cloudEnsureSession() { return signedIn ? { access_token: 'LAB-TOKEN', user: { id: 'LAB-STAFF' } } : null; },
    cloudHeaders(token) { return { Authorization: 'Bearer ' + token, apikey: 'LAB' }; },
    async cloudRequest(path, request) {
      calls += 1;
      if (throwNext) { throwNext = false; throw new Error('LAB injected RPC outage'); }
      must(path === '/rest/v1/rpc/flooring_verify_supplier_receipt', 'wrong RPC path ' + path);
      must(request.method === 'POST', 'wrong RPC method');
      const args = JSON.parse(request.body || '{}');
      must(String(args.p_task_id) === String(task.id), 'task ID mismatch');
      must(String(args.p_po_number) === String(task.po_number), 'PO mismatch');
      if (presetConflict) return { ok: false, conflict: true, code: 'CERTIFICATE_CONFLICT' };
      if (stored) {
        if (stored.p_certificate_key === args.p_certificate_key && stored.p_fingerprint === args.p_fingerprint) return { ok: true, changed: false, code: 'ALREADY_PUBLISHED', task: clone(task) };
        if (stored.p_certificate_key === args.p_certificate_key) return { ok: false, conflict: true, code: 'CERTIFICATE_CONFLICT' };
      }
      stored = clone(args);
      task = {
        ...task,
        inventory_verified: true,
        inventory_verified_po_number: String(args.p_po_number),
        inventory_verified_at: '2026-09-15T23:00:00.000Z',
        inventory_operation_ids: clone(args.p_operation_ids),
        inventory_verified_items: (args.p_verified_items || []).map(item => ({ ordered_qty: item.ordered_qty, received_qty: item.received_qty })),
        inventory_certificate_key: args.p_certificate_key,
        inventory_certificate_fingerprint: args.p_fingerprint
      };
      return { ok: true, changed: true, code: 'PUBLISHED', task: clone(task) };
    },
    task() { return clone(task); }, stored() { return clone(stored); }, calls() { return calls; },
    setSignedIn(value) { signedIn = value; }, failNext() { throwNext = true; }, conflictNext() { presetConflict = true; }
  };
}

function bootPublisher(task, authorityOptions = {}) {
  const authority = fakeReceiptAuthority(task, authorityOptions);
  const localStorage = memoryStorage();
  const window = { crypto: webcrypto, APP_VERSION: version.version, APP_BUILD: version.build };
  const box = {
    window, localStorage, console: quietConsole(), crypto: webcrypto, TextEncoder, Uint8Array,
    Date, JSON, Math, Number, String, Array, Object, Boolean, RegExp, Error, TypeError, Promise, Map, Set,
    cloudEnsureSession: authority.cloudEnsureSession,
    cloudHeaders: authority.cloudHeaders,
    cloudRequest: authority.cloudRequest
  };
  window.window = window;
  vm.createContext(box, { name: 'RUNLU Receipt Certificate Publisher V0.9' });
  vm.runInContext(publisherSource, box, { filename: PUBLISHER_FILE, timeout: 1500 });
  const api = window.RUNLUWarehouseReceiptCertificateV090;
  must(api && typeof api.publish === 'function', 'publisher candidate API missing');
  return { api, authority };
}

function bootFlooringConsumer(sharedTask) {
  const localStorage = memoryStorage();
  const poNumber = String(sharedTask.po_number);
  const jobId = 'J-' + poNumber;
  localStorage.seed(F.PO, [{
    id: 'PO-' + poNumber, jobId, jobNumber: poNumber, poNumber, status: 'Submitted', fulfillment: 'Pickup',
    items: sharedTask.items.map(item => ({ style: item.style, colour: item.colour, qty: item.qty, unit: String(item.unit || '').toUpperCase() }))
  }]);
  localStorage.seed(F.CALL, []);
  localStorage.seed(F.CACHE, { tasks: [clone(sharedTask)], events: [], lastSync: 'LAB' });
  const drawer = {
    syncPeopleToCall() {
      const pos = localStorage.json(F.PO) || [];
      const received = pos.filter(row => row.status === 'Received' || row.status === 'Completed');
      const calls = localStorage.json(F.CALL) || [];
      if (received.length) {
        const q = calls[0] || { id: 'ptc-' + jobId, orderId: jobId, orderNumber: poNumber, status: 'Not Called', sourcePOs: [] };
        q.status = 'Not Called';
        q.sourcePOs = received.map(row => String(row.poNumber));
        localStorage.setItem(F.CALL, JSON.stringify([q]));
      }
      return localStorage.json(F.CALL) || [];
    },
    refresh() {}
  };
  const window = { RUNLUOrdersDrawerV066: drawer };
  const box = { window, localStorage, console: quietConsole(), document: { querySelectorAll() { return []; } }, Date, JSON, Math, Number, String, Array, Object, Boolean, RegExp, Error, TypeError, Promise, Map, Set };
  window.window = window;
  vm.createContext(box, { name: 'RUNLU Exact Flooring Receipt Consumer V0.9' });
  vm.runInContext(flooringAckSource, box, { filename: FLOORING_ACK_FILE, timeout: 1500 });
  const api = window.RUNLUWarehouseReceiptAckV098;
  must(api && typeof api.acknowledgePO === 'function', 'exact Flooring V098 consumer missing');
  return { api, localStorage };
}

function syntheticOperation(id, po, qty = 10, unit = 'Box') {
  return { id, po: String(po), status: 'Completed', impactApplied: true, type: 'Supplier Pickup / Receiving / Put-away', quantity: qty, unit };
}

async function check(name, fn) {
  try { return { name, pass: true, ...(await fn() || {}) }; }
  catch (error) { return { name, pass: false, error: error?.message || String(error) }; }
}

const tests = [];
tests.push(await check('Candidate exposes non-production fail-closed contract', async () => {
  const task = makeTask(181800);
  const env = bootPublisher(task);
  must(env.api.version === '0.9.0', 'version mismatch');
  must(env.api.rpc === 'flooring_verify_supplier_receipt', 'RPC contract mismatch');
  must(env.api.requiresActualImpact && env.api.requiresFullReceipt && env.api.operationIdsUnique, 'safety flags missing');
  must(env.api.productionAutoInstall === false, 'candidate auto-installs');
  return { version: env.api.version };
}));

tests.push(await check('Exact Warehouse inventory receipt publishes a V098-compatible certificate', async () => {
  const warehouse = bootWarehouse(); seedWarehouse(warehouse);
  const operation = receive(warehouse, { id: 9101, po: 181801, productId: 'P1', inventoryRecordId: 'INV1', product: 'LAB TILE', quantity: 10, unit: 'Box', location: 'A1' });
  must(warehouse.localStorage.json(W.INVDB).find(row => row.id === 'INV1').quantity === 10, 'Warehouse quantity not posted');
  const task = makeTask(181801);
  const env = bootPublisher(task);
  const published = await env.api.publish(task, [operation]);
  must(published.ok && published.changed && published.code === 'PUBLISHED', 'publish failed ' + JSON.stringify(published));
  const sharedTask = env.authority.task();
  must(sharedTask.inventory_verified === true, 'verified flag missing');
  must(sharedTask.inventory_operation_ids[0] === '9101', 'operation ID missing');
  const consumer = bootFlooringConsumer(sharedTask);
  const ack = consumer.api.acknowledgePO(181801);
  must(ack.ok && ack.changed && consumer.localStorage.json(F.PO)[0].status === 'Received', 'exact V098 did not acknowledge certificate');
  must(consumer.localStorage.json(F.CALL)[0]?.sourcePOs.includes('181801'), 'People TO Call handoff missing');
  return { warehouseQty: 10, consumerStatus: 'Received' };
}));

tests.push(await check('Two-line exact Warehouse receipt certificate preserves each operation identity', async () => {
  const warehouse = bootWarehouse(); seedWarehouse(warehouse);
  const op1 = receive(warehouse, { id: 9201, po: 181802, productId: 'P1', inventoryRecordId: 'INV1', product: 'LAB TILE', quantity: 10, unit: 'Box', location: 'A1' });
  const op2 = receive(warehouse, { id: 9202, po: 181802, productId: 'P2', inventoryRecordId: 'INV2', product: 'LAB ADHESIVE', quantity: 2, unit: 'Pail', location: 'A2' });
  const task = makeTask(181802, [{ style: 'LAB TILE', colour: 'GREY', qty: 10, unit: 'box' }, { style: 'LAB ADHESIVE', colour: 'WHITE', qty: 2, unit: 'pail' }]);
  const env = bootPublisher(task);
  const result = await env.api.publish(task, [op1, op2]);
  must(result.ok, 'two-line publish failed');
  must(JSON.stringify(env.authority.task().inventory_operation_ids) === JSON.stringify(['9201', '9202']), 'operation identities changed');
  return { operations: env.authority.task().inventory_operation_ids };
}));

for (const [name, mutateTask, mutateOps, code] of [
  ['Partial shared receipt is blocked before RPC', task => { task.received_items[0].received_qty = '9'; }, null, 'NOT_FULL_RECEIPT'],
  ['Over shared receipt is blocked before RPC', task => { task.received_items[0].received_qty = '11'; }, null, 'NOT_FULL_RECEIPT'],
  ['Unapplied Warehouse operation is blocked', null, ops => { ops[0].impactApplied = false; }, 'OPERATION_NOT_APPLIED'],
  ['Wrong Warehouse PO is blocked', null, ops => { ops[0].po = '999999'; }, 'OPERATION_PO_MISMATCH'],
  ['Wrong Warehouse quantity is blocked', null, ops => { ops[0].quantity = 9; }, 'OPERATION_QUANTITY_MISMATCH'],
  ['Duplicate Warehouse operation IDs are blocked', task => {
    task.items.push({ style: 'LAB ADHESIVE', colour: 'WHITE', qty: 2, unit: 'pail' });
    task.received_items.push({ style: 'LAB ADHESIVE', colour: 'WHITE', ordered_qty: '2', received_qty: '2', condition: 'OK' });
  }, ops => { ops.push(syntheticOperation(ops[0].id, 181803, 2, 'Pail')); }, 'DUPLICATE_OPERATION_ID']
]) {
  tests.push(await check(name, async () => {
    const task = makeTask(181803); if (mutateTask) mutateTask(task);
    const ops = [syntheticOperation(9301, 181803)]; if (mutateOps) mutateOps(ops);
    const env = bootPublisher(task);
    const result = await env.api.publish(task, ops);
    must(!result.ok && result.code === code, `expected ${code}, got ${result.code}`);
    must(env.authority.calls() === 0, 'invalid proof reached shared RPC');
    return { blocked: code };
  }));
}

tests.push(await check('Signed-out Warehouse cannot publish certificate', async () => {
  const task = makeTask(181804); const env = bootPublisher(task, { signedIn: false });
  const result = await env.api.publish(task, [syntheticOperation(9401, 181804)]);
  must(!result.ok && result.code === 'CLOUD_SIGN_IN_REQUIRED', 'signed-out publish accepted');
  must(env.authority.calls() === 0, 'signed-out path called RPC');
  return { safeReject: true };
}));

tests.push(await check('RPC outage never marks shared task verified', async () => {
  const task = makeTask(181805); const env = bootPublisher(task); env.authority.failNext();
  const result = await env.api.publish(task, [syntheticOperation(9501, 181805)]);
  must(!result.ok && result.code === 'CERTIFICATE_PUBLISH_FAILED', 'outage reported success');
  must(env.authority.task().inventory_verified !== true, 'outage marked task verified');
  return { safeReject: true };
}));

tests.push(await check('Repeat publication is durable-idempotent at shared authority', async () => {
  const task = makeTask(181806); const env = bootPublisher(task); const operations = [syntheticOperation(9601, 181806)];
  const first = await env.api.publish(task, operations); const firstTask = JSON.stringify(env.authority.task());
  const second = await env.api.publish(task, operations);
  must(first.ok && first.changed, 'first publish failed');
  must(second.ok && !second.changed && second.code === 'ALREADY_PUBLISHED', 'repeat publish not idempotent');
  must(JSON.stringify(env.authority.task()) === firstTask, 'repeat publish changed shared task');
  return { rpcCalls: env.authority.calls() };
}));

tests.push(await check('Shared authority conflict fails closed', async () => {
  const task = makeTask(181807); const env = bootPublisher(task); env.authority.conflictNext();
  const result = await env.api.publish(task, [syntheticOperation(9701, 181807)]);
  must(!result.ok && result.code === 'CERTIFICATE_CONFLICT', 'conflict accepted');
  must(env.authority.task().inventory_verified !== true, 'conflict marked verified');
  return { safeReject: true };
}));

async function stress(count) {
  let completed = 0, failure = null;
  for (let i = 0; i < count; i += 1) {
    try {
      const po = 500000 + i;
      const qty = 1 + (i % 15);
      const task = makeTask(po, [{ style: 'LAB TILE', colour: 'GREY', qty, unit: 'box' }]);
      const env = bootPublisher(task);
      const operation = syntheticOperation(1000000 + i, po, qty, 'Box');
      const first = await env.api.publish(task, [operation]);
      const second = await env.api.publish(task, [operation]);
      must(first.ok && first.changed, 'first publish');
      must(second.ok && !second.changed, 'idempotent replay');
      const shared = env.authority.task();
      must(shared.inventory_verified === true && shared.inventory_operation_ids.length === 1, 'certificate shape');
      const consumer = bootFlooringConsumer(shared);
      const ack = consumer.api.acknowledgePO(po);
      must(ack.ok && consumer.localStorage.json(F.PO)[0].status === 'Received', 'consumer acknowledgement');
      completed += 1;
    } catch (error) {
      failure = { cycle: i, error: error?.message || String(error) };
      break;
    }
  }
  return { pass: !failure, cyclesRequested: count, cyclesCompleted: completed, failure };
}

const stressResult = await stress(cycles);
const pass = tests.every(test => test.pass) && stressResult.pass;
const report = {
  gate: 'RUNLU Warehouse Verified Receipt Certificate Publisher V0.9',
  pass,
  generatedAt: new Date().toISOString(),
  warehouseRuntime: `${version.version} Build${version.build}`,
  source: {
    publisherFile: PUBLISHER_FILE, publisherSha256: sha(publisherSource),
    warehouseIndexSha256: sha(indexSource), exactWarehouseFunctionsSha256: sha(exactWarehouseSource),
    flooringConsumerFile: FLOORING_ACK_FILE, flooringConsumerSha256: sha(flooringAckSource)
  },
  scenarios: { passed: tests.filter(test => test.pass).length, total: tests.length, tests },
  stress: stressResult,
  isolation: { productionSupabaseAccess: false, hostLocalStorageAccess: false, realNetworkAccess: false, sharedAuthority: 'in-memory fake RPC' },
  contract: [
    'Only Ready/Completed full receipts can be certified.',
    'Every certificate line must map one-to-one to a completed impactApplied Warehouse receiving operation for the same PO, quantity and unit.',
    'Operation IDs must be unique and form the durable certificate identity.',
    'The shared RPC must be idempotent for an exact certificate and fail closed on conflicting reuse.',
    'The published task fields are consumed by the exact Flooring V0.9.8 receipt acknowledgement candidate.',
    'This candidate does not modify release-loader.js, version.json, live Supabase schema, or production entrypoints.'
  ]
};
fs.writeFileSync('warehouse-receipt-certificate-v090-report.json', JSON.stringify(report, null, 2));
for (const test of tests) console.log(`${test.pass ? 'PASS' : 'FAIL'} · ${test.name}${test.error ? ' · ' + test.error : ''}`);
console.log(`${stressResult.pass ? 'PASS' : 'FAIL'} · publisher→exact Flooring consumer stress · ${stressResult.cyclesCompleted}/${stressResult.cyclesRequested}`);
console.log(`Runtime · ${report.warehouseRuntime}`);
console.log('Isolation · fake shared RPC · real network/Supabase/host localStorage: NONE');
console.log(`RECEIPT CERTIFICATE PUBLISHER V0.9: ${pass ? 'PASS' : 'FAIL'}`);
if (!pass) process.exit(1);
