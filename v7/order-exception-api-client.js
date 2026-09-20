(() => {
  'use strict';

  async function readJson(response) {
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(body?.error || body?.data?.code || ('HTTP_' + response.status));
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body?.data;
  }

  async function tokenFrom(getAccessToken) {
    const token = await getAccessToken();
    if (!token || typeof token !== 'string') throw new Error('V7_ACCESS_TOKEN_REQUIRED');
    return token;
  }

  window.createRunluV7OrderExceptionApi = function createRunluV7OrderExceptionApi({
    endpoint,
    tenantId,
    getAccessToken,
    fetchImpl = window.fetch.bind(window),
  }) {
    if (!endpoint) throw new Error('V7_WORKBENCH_ENDPOINT_REQUIRED');
    if (!tenantId) throw new Error('V7_WORKBENCH_TENANT_REQUIRED');
    if (typeof getAccessToken !== 'function') throw new Error('V7_GET_ACCESS_TOKEN_REQUIRED');

    const base = endpoint.replace(/\/+$/, '');

    async function headers() {
      return {
        Authorization: 'Bearer ' + await tokenFrom(getAccessToken),
        'Content-Type': 'application/json',
      };
    }

    return {
      async list(status = 'open') {
        const url = new URL(base);
        url.searchParams.set('action', 'list');
        url.searchParams.set('tenant_id', tenantId);
        url.searchParams.set('status', status);
        return readJson(await fetchImpl(url.toString(), {
          method: 'GET',
          headers: await headers(),
          cache: 'no-store',
        }));
      },

      async get(caseId) {
        const url = new URL(base);
        url.searchParams.set('action', 'get');
        url.searchParams.set('tenant_id', tenantId);
        url.searchParams.set('case_id', caseId);
        return readJson(await fetchImpl(url.toString(), {
          method: 'GET',
          headers: await headers(),
          cache: 'no-store',
        }));
      },

      async resolve(caseId, payload) {
        const commandId = payload?.command_id || crypto.randomUUID();
        const response = await fetchImpl(base, {
          method: 'POST',
          headers: await headers(),
          cache: 'no-store',
          body: JSON.stringify({
            action: 'resolve',
            tenant_id: tenantId,
            case_id: caseId,
            command_id: commandId,
            expected_version: payload?.expected_version,
            order_kind: payload?.order_kind,
            lifecycle: payload?.lifecycle,
            fulfillment_status: payload?.fulfillment_status,
            fields: payload?.fields || {},
            resolution_note: payload?.resolution_note || '',
          }),
        });
        return readJson(response);
      },
    };
  };
})();