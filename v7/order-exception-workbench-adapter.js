(() => {
  'use strict';

  function requireValue(name, value) {
    if (value === null || value === undefined || value === '') {
      throw new Error(name + ' is required');
    }
    return value;
  }

  function unwrap(result) {
    if (result && typeof result === 'object' && ('data' in result || 'error' in result)) {
      if (result.error) {
        throw new Error(result.error.message || String(result.error));
      }
      return result.data;
    }
    return result;
  }

  /**
   * Adapter for an already-authenticated V7 RPC transport.
   *
   * rpc(functionName, args) may return either:
   *   - raw JSON; or
   *   - {data, error} in the style of Supabase RPC.
   *
   * This file intentionally contains no URL, API key, session storage, login,
   * or production connection. The authenticated host shell owns those concerns.
   */
  window.RUNLU_V7_CREATE_ORDER_EXCEPTION_API = function createOrderExceptionApi(options) {
    const rpc = requireValue('rpc', options?.rpc);
    const tenantId = requireValue('tenantId', options?.tenantId);
    const actorId = requireValue('actorId', options?.actorId);
    const deviceId = options?.deviceId || 'V7_ORDER_EXCEPTION_WORKBENCH';

    if (typeof rpc !== 'function') throw new Error('rpc must be a function');

    return Object.freeze({
      async list(status='open') {
        return unwrap(await rpc('list_order_exception_workbench', {
          p_tenant: tenantId,
          p_status: status,
        }));
      },

      async get(caseId) {
        requireValue('caseId', caseId);
        return unwrap(await rpc('get_order_exception_workbench_case', {
          p_tenant: tenantId,
          p_case: caseId,
        }));
      },

      async resolve(caseId, resolution) {
        requireValue('caseId', caseId);
        requireValue('resolution', resolution);
        if (!crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');

        const commandId = crypto.randomUUID();
        return unwrap(await rpc('resolve_order_exception_create_order', {
          p_tenant: tenantId,
          p_command: commandId,
          p_case: caseId,
          p_expected_version: Number(resolution.expected_version),
          p_order_kind: resolution.order_kind,
          p_lifecycle: resolution.lifecycle,
          p_fulfillment: resolution.fulfillment_status,
          p_fields: resolution.fields || {},
          p_resolution_note: resolution.resolution_note,
          p_actor: actorId,
          p_device: deviceId,
        }));
      },
    });
  };
})();