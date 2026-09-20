(() => {
  'use strict';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const state = {
    api: null,
    auth: null,
    mode: 'disconnected',
    status: 'open',
    data: null,
    selected: null,
    detail: null,
    pendingResolveCommandIds: {},
  };

  const REASON_LABELS = {
    STRUCTURED_STATUS_MISSING: 'Status confirmation required',
    IDENTITY_CRITICAL_FIELDS_CONFLICT: 'Identity conflict',
    STRUCTURED_STATUS_MOVED_BACKWARD: 'Lifecycle regression',
    WEAK_SOURCE_IDENTITY: 'Identity confirmation required',
    UNKNOWN_STRUCTURED_STATUS: 'Unknown legacy status',
  };

  const demoStatusCases = Array.from({length:9}, (_,i) => ({
    case_id: 'demo-status-' + (i+1),
    reason: 'STRUCTURED_STATUS_MISSING',
    status: 'open',
    version: 1,
    evidence_count: i === 0 ? 8 : 1 + (i % 3),
    linked_evidence_rows: i === 0 ? 8 : 1 + (i % 3),
    required_confirmation: ['lifecycle','fulfillment_status','resolution_note'],
    display_context: {
      order_kind: i % 3 === 0 ? 'SPECIAL' : 'STANDARD',
      purchase_order_number: 'PO-DEMO-' + String(i+1).padStart(3,'0'),
      product_label: 'Example Order ' + (i+1),
      source_location: ['33A','12B','10A'][i % 3],
      quantity: String(1+i),
      unit: i % 3 === 0 ? 'EACH' : 'BOX',
      latest_structured_status: null,
    },
    reason_help: {
      title: 'Status confirmation required',
      summary: 'The legacy order has no trustworthy structured status.',
      action: 'Confirm lifecycle and fulfillment from source paperwork or warehouse knowledge.',
    },
  }));

  const DEMO = {
    tenant_id: 'engineering-preview',
    status_filter: 'open',
    can_resolve: false,
    summary: {
      total: 12,
      status_missing: 9,
      identity_conflict: 1,
      lifecycle_regression: 1,
      weak_identity: 1,
      unknown_status: 0,
    },
    cases: [
      ...demoStatusCases,
      {
        case_id: 'demo-conflict',
        reason: 'IDENTITY_CRITICAL_FIELDS_CONFLICT',
        status: 'open',
        version: 1,
        evidence_count: 3,
        linked_evidence_rows: 3,
        required_confirmation: ['canonical_identity','lifecycle','fulfillment_status','resolution_note'],
        display_context: {
          order_kind: 'STANDARD',
          purchase_order_number: 'PO-DEMO-CONFLICT',
          product_label: 'Example Conflicting Order',
          source_location: '12B',
          quantity: '5',
          unit: 'ROLL',
        },
        reason_help: {
          title: 'Identity conflict',
          summary: 'Rows with the same lineage key disagree on identity-critical fields.',
          action: 'Confirm the canonical identity before creating a V7 order.',
        },
      },
      {
        case_id: 'demo-regression',
        reason: 'STRUCTURED_STATUS_MOVED_BACKWARD',
        status: 'open',
        version: 1,
        evidence_count: 4,
        linked_evidence_rows: 4,
        required_confirmation: ['final_lifecycle','final_fulfillment_status','resolution_note'],
        display_context: {
          order_kind: 'SPECIAL',
          purchase_order_number: 'PO-DEMO-REGRESSION',
          product_label: 'Example Lifecycle Order',
          quantity: '1',
          unit: 'EACH',
          latest_structured_status: 'Ready for Pickup',
        },
        reason_help: {
          title: 'Lifecycle regression',
          summary: 'The source status moved backward in time.',
          action: 'Confirm the final trustworthy state.',
        },
      },
      {
        case_id: 'demo-weak',
        reason: 'WEAK_SOURCE_IDENTITY',
        status: 'open',
        version: 1,
        evidence_count: 1,
        linked_evidence_rows: 1,
        required_confirmation: ['canonical_identity','lifecycle','fulfillment_status','resolution_note'],
        display_context: {
          order_kind: 'SPECIAL',
          product_label: 'Example Weak-Identity Order',
          quantity: '2',
          unit: 'BOX',
        },
        reason_help: {
          title: 'Identity confirmation required',
          summary: 'The row lacks enough structured identity for safe automatic import.',
          action: 'Confirm a durable order identifier and the canonical order state.',
        },
      },
    ],
  };

  function esc(v='') {
    return String(v).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }

  function field(ctx, key, fallback='—') {
    const v = ctx?.[key];
    return (v === null || v === undefined || v === '') ? fallback : v;
  }

  function reasonClass(reason) {
    if (reason === 'IDENTITY_CRITICAL_FIELDS_CONFLICT') return 'danger';
    if (reason === 'STRUCTURED_STATUS_MOVED_BACKWARD') return 'warn';
    if (reason === 'WEAK_SOURCE_IDENTITY') return 'soft';
    return 'neutral';
  }

  function setBanner(message, kind='info') {
    const el = $('#statusBanner');
    el.className = 'status-banner ' + kind;
    el.textContent = message;
    el.hidden = false;
  }

  function renderSummary() {
    const s = state.data?.summary || {};
    $('#totalCount').textContent = s.total ?? 0;
    $('#statusCount').textContent = s.status_missing ?? 0;
    $('#conflictCount').textContent = s.identity_conflict ?? 0;
    $('#regressionCount').textContent = s.lifecycle_regression ?? 0;
    $('#weakCount').textContent = s.weak_identity ?? 0;
  }

  function renderCards() {
    const host = $('#caseGrid');
    const cases = state.data?.cases || [];
    host.innerHTML = '';

    if (!cases.length) {
      host.innerHTML = '<div class="empty">No cases match this filter.</div>';
      return;
    }

    for (const c of cases) {
      const ctx = c.display_context || {};
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'case-card ' + reasonClass(c.reason);
      card.dataset.caseId = c.case_id;
      card.innerHTML = `
        <div class="card-top">
          <span class="reason-pill">${esc(c.reason_help?.title || REASON_LABELS[c.reason] || c.reason)}</span>
          <span class="evidence">${esc(c.linked_evidence_rows ?? c.evidence_count ?? 0)} evidence</span>
        </div>
        <div class="order-title">${esc(field(ctx,'product_label','Order review'))}</div>
        <div class="order-meta">
          <span>${esc(field(ctx,'purchase_order_number','No PO'))}</span>
          <span>${esc(field(ctx,'source_location','No location'))}</span>
          <span>${esc(field(ctx,'quantity','?'))} ${esc(field(ctx,'unit',''))}</span>
        </div>
        <div class="reason-summary">${esc(c.reason_help?.summary || '')}</div>
        <div class="card-foot">
          <span>v${esc(c.version ?? 1)}</span>
          <span>Open case →</span>
        </div>
      `;
      card.addEventListener('click', () => openCase(c.case_id));
      host.appendChild(card);
    }
  }

  function renderMode() {
    const badge = $('#modeBadge');
    if (state.mode === 'demo') {
      badge.textContent = 'ENGINEERING DEMO';
      badge.className = 'mode-badge demo';
      setBanner('Engineering preview: demo records only. No production order or inventory data is shown or changed.', 'warn');
    } else if (state.mode === 'signin') {
      badge.textContent = 'ENGINEERING SIGN-IN';
      badge.className = 'mode-badge demo';
      setBanner('Connected target is an isolated V7 engineering project. Sign in to load exception cases.', 'info');
    } else if (state.mode === 'connected') {
      badge.textContent = 'AUTHENTICATED V7';
      badge.className = 'mode-badge live';
      $('#statusBanner').hidden = true;
    } else {
      badge.textContent = 'NOT CONNECTED';
      badge.className = 'mode-badge offline';
      setBanner('No authenticated V7 workbench adapter is connected. Add ?demo=1 to preview the interface safely.', 'info');
    }
  }

  async function load() {
    const params = new URLSearchParams(location.search);
    if (params.get('demo') === '1') {
      state.mode = 'demo';
      state.data = structuredClone(DEMO);
      renderMode();
      renderSummary();
      renderCards();
      return;
    }

    if (
      !window.RUNLU_V7_ORDER_EXCEPTION_API &&
      window.RUNLU_V7_ENGINEERING_AUTH_CONFIG &&
      typeof window.createRunluV7EngineeringWorkbenchAuth === 'function'
    ) {
      try {
        state.auth = window.createRunluV7EngineeringWorkbenchAuth(
          window.RUNLU_V7_ENGINEERING_AUTH_CONFIG
        );
        state.mode = 'signin';
        state.data = {summary:{total:0},cases:[]};
        $('#authCard').classList.remove('hidden');
        $('#signOutBtn').classList.add('hidden');
        renderMode();
        renderSummary();
        renderCards();
        return;
      } catch (err) {
        setBanner('Engineering authentication configuration is invalid: ' + (err?.message || String(err)), 'danger');
      }
    }

    if (
      !window.RUNLU_V7_ORDER_EXCEPTION_API &&
      window.RUNLU_V7_WORKBENCH_CONFIG &&
      typeof window.createRunluV7OrderExceptionApi === 'function'
    ) {
      try {
        window.RUNLU_V7_ORDER_EXCEPTION_API = window.createRunluV7OrderExceptionApi(
          window.RUNLU_V7_WORKBENCH_CONFIG
        );
      } catch (err) {
        setBanner('Workbench configuration is invalid: ' + (err?.message || String(err)), 'danger');
      }
    }

    const api = window.RUNLU_V7_ORDER_EXCEPTION_API;
    if (!api || typeof api.list !== 'function' || typeof api.get !== 'function' || typeof api.resolve !== 'function') {
      state.mode = 'disconnected';
      state.data = {summary:{total:0},cases:[]};
      renderMode();
      renderSummary();
      renderCards();
      return;
    }

    state.api = api;
    state.mode = 'connected';
    $('#authCard').classList.add('hidden');
    $('#signOutBtn').classList.toggle('hidden', !state.auth);
    renderMode();
    await refresh();
  }

  async function refresh() {
    $('#refreshBtn').disabled = true;
    try {
      state.data = await state.api.list(state.status);
      renderSummary();
      renderCards();
    } catch (err) {
      setBanner('Workbench could not load: ' + (err?.message || String(err)), 'danger');
    } finally {
      $('#refreshBtn').disabled = false;
    }
  }

  function formValue(id) {
    return $(id)?.value?.trim() || '';
  }

  function renderDetail(detail) {
    state.detail = detail;
    const c = detail;
    const ctx = c.display_context || {};
    $('#drawerTitle').textContent = c.reason_help?.title || REASON_LABELS[c.reason] || c.reason;
    $('#drawerReason').textContent = c.reason_help?.summary || '';
    $('#drawerAction').textContent = c.reason_help?.action || '';
    $('#drawerEvidenceCount').textContent = String(c.evidence?.length ?? c.linked_evidence_rows ?? c.evidence_count ?? 0);
    $('#drawerCaseVersion').textContent = 'v' + String(c.version ?? 1);

    $('#orderKind').value = field(ctx,'order_kind','STANDARD');
    $('#poNumber').value = field(ctx,'purchase_order_number','');
    $('#soNumber').value = field(ctx,'sales_order_number','');
    $('#recoveryKey').value = field(ctx,'recovery_key','');
    $('#customerLabel').value = field(ctx,'customer_label','');
    $('#productLabel').value = field(ctx,'product_label','');
    $('#sourceLocation').value = field(ctx,'source_location','');
    $('#quantity').value = field(ctx,'quantity','');
    $('#unit').value = field(ctx,'unit','');
    $('#resolutionNote').value = '';

    const latest = field(ctx,'latest_structured_status','');
    if (c.reason === 'STRUCTURED_STATUS_MOVED_BACKWARD' || c.reason === 'STRUCTURED_STATUS_MISSING') {
      $('#lifecycle').value = 'in_progress';
      $('#fulfillment').value = latest === 'Picked Up' ? 'picked_up' : 'pending';
    } else {
      $('#lifecycle').value = 'in_progress';
      $('#fulfillment').value = 'pending';
    }

    const req = c.required_confirmation || [];
    $('#requiredList').innerHTML = req.map(x=>`<li>${esc(String(x).replaceAll('_',' '))}</li>`).join('');

    const evidence = c.evidence || [];
    $('#evidenceList').innerHTML = evidence.length
      ? evidence.map((e,i)=>`
          <div class="evidence-row">
            <div><strong>Evidence ${i+1}</strong><span>${esc(e.source_dataset || '')}</span></div>
            <pre>${esc(JSON.stringify(e.structured_fields || {}, null, 2))}</pre>
          </div>`).join('')
      : '<div class="muted">Evidence details load only through an authenticated V7 adapter.</div>';

    const canResolve = state.mode === 'connected' && c.can_resolve === true && c.status !== 'resolved';
    $('#resolveBtn').disabled = !canResolve;
    $('#resolveHint').textContent = state.mode === 'demo'
      ? 'Resolve is disabled in demo mode.'
      : c.can_resolve === true
        ? 'Owner/Admin resolution is available.'
        : 'Owner/Admin role is required to resolve this case.';

    $('#drawer').classList.add('open');
    $('#drawerBackdrop').hidden = false;
  }

  async function openCase(caseId) {
    state.selected = caseId;
    if (state.mode === 'demo') {
      const base = state.data.cases.find(x=>x.case_id===caseId);
      renderDetail({
        ...structuredClone(base),
        can_resolve:false,
        evidence:Array.from({length:Math.min(base.evidence_count || 1,3)},(_,i)=>({
          source_dataset:'demo',
          source_record_id:'demo-'+(i+1),
          structured_fields:base.display_context,
        })),
      });
      return;
    }

    if (!state.api) return;
    setBanner('Loading case evidence…', 'info');
    try {
      const detail = await state.api.get(caseId);
      if (!detail) throw new Error('Case not found');
      $('#statusBanner').hidden = true;
      renderDetail(detail);
    } catch (err) {
      setBanner('Case could not load: ' + (err?.message || String(err)), 'danger');
    }
  }

  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#drawerBackdrop').hidden = true;
    state.selected = null;
    state.detail = null;
  }

  function validateResolutionForm() {
    const note = formValue('#resolutionNote');
    const product = formValue('#productLabel');
    const unit = formValue('#unit');
    const quantityText = formValue('#quantity');
    const quantity = Number(quantityText);
    const lifecycle = formValue('#lifecycle');
    const fulfillment = formValue('#fulfillment');
    const hasIdentity = Boolean(
      formValue('#recoveryKey') || formValue('#soNumber') || formValue('#poNumber')
    );

    if (!note) return {ok:false,message:'Resolution note is required.',focus:'#resolutionNote'};
    if (!hasIdentity) return {ok:false,message:'Confirm at least one durable order identifier: Recovery Key, SO, or PO.',focus:'#poNumber'};
    if (!product) return {ok:false,message:'Product is required for the canonical order.',focus:'#productLabel'};
    if (!quantityText || !Number.isFinite(quantity) || quantity <= 0) {
      return {ok:false,message:'Quantity must be greater than zero.',focus:'#quantity'};
    }
    if (!unit) return {ok:false,message:'Unit is required for the canonical order.',focus:'#unit'};
    if (lifecycle === 'draft' && fulfillment !== 'unverified') {
      return {ok:false,message:'Draft orders must use Unverified fulfillment.',focus:'#fulfillment'};
    }
    if ((lifecycle === 'completed' || lifecycle === 'archived') && fulfillment !== 'completed') {
      return {ok:false,message:'Completed or archived orders must use Completed fulfillment.',focus:'#fulfillment'};
    }
    return {ok:true};
  }

  async function resolveCase() {
    if (!state.api || state.mode !== 'connected' || !state.detail) return;
    const validation = validateResolutionForm();
    if (!validation.ok) {
      $(validation.focus)?.focus();
      setBanner(validation.message, 'danger');
      return;
    }
    const note = formValue('#resolutionNote');
    if (!note) {
      $('#resolutionNote').focus();
      setBanner('Resolution note is required.', 'danger');
      return;
    }

    const caseId = state.detail.case_id;
    const commandId = state.pendingResolveCommandIds[caseId] || crypto.randomUUID();
    state.pendingResolveCommandIds[caseId] = commandId;

    const payload = {
      command_id: commandId,
      expected_version: Number(state.detail.version),
      order_kind: formValue('#orderKind'),
      lifecycle: formValue('#lifecycle'),
      fulfillment_status: formValue('#fulfillment'),
      fields: {
        recovery_key: formValue('#recoveryKey') || null,
        sales_order_number: formValue('#soNumber') || null,
        purchase_order_number: formValue('#poNumber') || null,
        customer_label: formValue('#customerLabel') || null,
        product_label: formValue('#productLabel') || null,
        source_location: formValue('#sourceLocation') || null,
        quantity: formValue('#quantity') || null,
        unit: formValue('#unit') || null,
      },
      resolution_note: note,
    };

    if (!window.confirm(
      'Create this canonical V7 order from the reviewed evidence?\n\n' +
      'This resolves the exception case. Inventory quantities will not change.'
    )) return;

    $('#resolveBtn').disabled = true;
    try {
      const result = await state.api.resolve(state.detail.case_id, payload);
      if (result?.status !== 'committed') {
        throw new Error(result?.code || 'Resolution was not committed');
      }
      delete state.pendingResolveCommandIds[caseId];
      closeDrawer();
      setBanner('Case resolved and canonical V7 order created. Inventory was not changed.', 'success');
      await refresh();
    } catch (err) {
      if (err?.body?.data?.status === 'rejected' || err?.status === 409) {
        delete state.pendingResolveCommandIds[caseId];
      }
      setBanner('Resolution failed: ' + (err?.message || String(err)), 'danger');
      $('#resolveBtn').disabled = false;
    }
  }

  $('#engineeringSignInBtn').addEventListener('click', async () => {
    if (!state.auth) return;
    const email = formValue('#engineeringEmail');
    const password = formValue('#engineeringPassword');
    if (!email || !password) {
      setBanner('Enter the engineering email and password.', 'danger');
      return;
    }
    const btn = $('#engineeringSignInBtn');
    btn.disabled = true;
    try {
      await state.auth.signIn(email, password);
      $('#engineeringPassword').value = '';
      state.api = state.auth.connectedApi();
      state.mode = 'connected';
      $('#authCard').classList.add('hidden');
      $('#signOutBtn').classList.remove('hidden');
      renderMode();
      await refresh();
    } catch (err) {
      setBanner('Engineering sign-in failed: ' + (err?.message || String(err)), 'danger');
    } finally {
      btn.disabled = false;
    }
  });

  $('#engineeringPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#engineeringSignInBtn').click();
  });

  $('#signOutBtn').addEventListener('click', async () => {
    if (!state.auth) return;
    await state.auth.signOut();
    state.api = null;
    state.mode = 'signin';
    state.data = {summary:{total:0},cases:[]};
    state.pendingResolveCommandIds = {};
    closeDrawer();
    $('#authCard').classList.remove('hidden');
    $('#signOutBtn').classList.add('hidden');
    renderMode();
    renderSummary();
    renderCards();
  });

  $('#refreshBtn').addEventListener('click', () => state.mode === 'connected' ? refresh() : load());
  $('#closeDrawer').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  $('#resolveBtn').addEventListener('click', resolveCase);
  $$('#filterBar button').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.status = btn.dataset.status || 'open';
      $$('#filterBar button').forEach(x=>x.classList.toggle('active',x===btn));
      if (state.mode === 'connected') await refresh();
    });
  });

  load();
})();