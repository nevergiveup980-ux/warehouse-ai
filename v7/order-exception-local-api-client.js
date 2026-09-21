(() => {
  'use strict';
  const LOOPBACK = new Set(['127.0.0.1','localhost','::1','[::1]']);

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

  window.createRunluV7LocalOrderExceptionApi = function createRunluV7LocalOrderExceptionApi({
    endpoint = '/api/order-exception',
    fetchImpl = window.fetch.bind(window),
  } = {}) {
    const page = new URL(window.location.href);
    const target = new URL(endpoint, page.href);
    if (!LOOPBACK.has(page.hostname)) throw new Error('V7_LOCAL_ENGINEERING_REQUIRES_LOOPBACK_PAGE');
    if (!LOOPBACK.has(target.hostname)) throw new Error('V7_LOCAL_ENGINEERING_REQUIRES_LOOPBACK_ENDPOINT');
    if (target.origin !== page.origin) throw new Error('V7_LOCAL_ENGINEERING_REQUIRES_SAME_ORIGIN');
    const base = target.toString();

    return Object.freeze({
      async list(status = 'open') {
        const url = new URL(base);
        url.searchParams.set('action','list');
        url.searchParams.set('status',status);
        return readJson(await fetchImpl(url.toString(),{method:'GET',cache:'no-store'}));
      },
      async get(caseId) {
        const url = new URL(base);
        url.searchParams.set('action','get');
        url.searchParams.set('case_id',caseId);
        return readJson(await fetchImpl(url.toString(),{method:'GET',cache:'no-store'}));
      },
      async resolve(caseId,payload) {
        return readJson(await fetchImpl(base,{
          method:'POST',
          cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            action:'resolve',
            case_id:caseId,
            command_id:payload?.command_id || crypto.randomUUID(),
            expected_version:payload?.expected_version,
            order_kind:payload?.order_kind,
            lifecycle:payload?.lifecycle,
            fulfillment_status:payload?.fulfillment_status,
            fields:payload?.fields || {},
            resolution_note:payload?.resolution_note || '',
          }),
        }));
      },
    });
  };
})();
