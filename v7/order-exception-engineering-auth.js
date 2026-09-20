(() => {
  'use strict';

  const PROD_REF = 'ekrnknlawekeoszzkamd';

  function required(name, value) {
    if (value === null || value === undefined || value === '') {
      throw new Error(name + ' is required');
    }
    return value;
  }

  function projectRef(projectUrl) {
    try {
      const host = new URL(projectUrl).hostname;
      return host.endsWith('.supabase.co') ? host.split('.')[0] : '';
    } catch {
      return '';
    }
  }

  async function readJson(response) {
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      throw new Error(body?.msg || body?.error_description || body?.error || ('HTTP_' + response.status));
    }
    return body;
  }

  window.createRunluV7EngineeringWorkbenchAuth = function createRunluV7EngineeringWorkbenchAuth({
    projectUrl,
    publishableKey,
    tenantId,
    fetchImpl = window.fetch.bind(window),
    now = () => Date.now(),
  }) {
    projectUrl = required('projectUrl', projectUrl).replace(/\/+$/, '');
    publishableKey = required('publishableKey', publishableKey);
    tenantId = required('tenantId', tenantId);

    const ref = projectRef(projectUrl);
    if (!ref) throw new Error('V7_ENGINEERING_PROJECT_URL_INVALID');
    if (ref === PROD_REF) throw new Error('PRODUCTION_PROJECT_FORBIDDEN');

    let session = null;

    async function auth(path, options = {}) {
      const headers = {
        apikey: publishableKey,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };
      return readJson(await fetchImpl(projectUrl + path, {...options, headers}));
    }

    async function signIn(email, password) {
      if (!email || !password) throw new Error('EMAIL_AND_PASSWORD_REQUIRED');
      const data = await auth('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({email, password}),
      });
      if (!data?.access_token || !data?.refresh_token) throw new Error('ENGINEERING_SESSION_INVALID');
      session = data;
      return {
        user: data.user || null,
        expires_at: data.expires_at || null,
      };
    }

    async function getAccessToken() {
      if (!session?.access_token) throw new Error('ENGINEERING_SIGN_IN_REQUIRED');
      const expiresMs = Number(session.expires_at || 0) * 1000;
      if (!expiresMs || expiresMs > now() + 60000) return session.access_token;

      if (!session.refresh_token) throw new Error('ENGINEERING_SESSION_EXPIRED');
      const refreshed = await auth('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({refresh_token: session.refresh_token}),
      });
      if (!refreshed?.access_token) throw new Error('ENGINEERING_REFRESH_FAILED');
      session = {...session, ...refreshed};
      return session.access_token;
    }

    async function signOut() {
      const token = session?.access_token;
      session = null;
      if (!token) return;
      try {
        await auth('/auth/v1/logout', {
          method: 'POST',
          headers: {Authorization: 'Bearer ' + token},
        });
      } catch {
        // Local in-memory session is already cleared; remote logout is best-effort.
      }
    }

    function connectedApi() {
      if (typeof window.createRunluV7OrderExceptionApi !== 'function') {
        throw new Error('V7_ORDER_EXCEPTION_CLIENT_MISSING');
      }
      return window.createRunluV7OrderExceptionApi({
        endpoint: projectUrl + '/functions/v1/warehouse-v7-order-exception-api',
        tenantId,
        getAccessToken,
        fetchImpl,
      });
    }

    return Object.freeze({
      projectRef: ref,
      tenantId,
      signIn,
      signOut,
      getAccessToken,
      connectedApi,
      isSignedIn: () => Boolean(session?.access_token),
      currentUser: () => session?.user || null,
    });
  };
})();