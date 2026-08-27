// RUNLU Warehouse OS V6.12.14 Build107 · Scan gateway recovery + practical Stop & Snap.
// Restores the known secure Cloudflare gateway when a device has no saved URL,
// upgrades Save & Test to verify Worker/provider readiness, and makes camera
// quality scoring use the target area with more practical mobile thresholds.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD107_SCAN_GATEWAY_STOP_SNAP__) return;
  window.__RUNLU_BUILD107_SCAN_GATEWAY_STOP_SNAP__ = true;

  const GATEWAY_KEY = 'runlu_voice_gateway_v610';
  const DEFAULT_GATEWAY = 'https://runlu-gpt-gateway.nevergiveup980.workers.dev';
  const BUILD = '107';
  let installed = false;
  let autoTestStarted = false;

  const el = id => document.getElementById(id);
  const text = v => String(v ?? '').trim();

  function normalizedGateway(raw) {
    const value = text(raw).replace(/\/+$/, '');
    if (!value) return '';
    try {
      const u = new URL(value);
      const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname);
      if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return '';
      return u.toString().replace(/\/+$/, '');
    } catch (_) {
      return '';
    }
  }

  function providerLabel(provider) {
    try {
      if (typeof window.aiProviderLabel === 'function') return window.aiProviderLabel(provider);
    } catch (_) {}
    if (provider === 'openai') return 'OpenAI';
    if (provider === 'gemini') return 'Gemini';
    return 'Auto';
  }

  function selectedProvider() {
    try {
      if (typeof window.scanAiProvider === 'function') return window.scanAiProvider();
    } catch (_) {}
    return el('scanAiProvider')?.value || 'auto';
  }

  function cloudVisionEnabled() {
    try {
      return typeof window.scanGptEnabled === 'function' ? !!window.scanGptEnabled() : false;
    } catch (_) {
      return false;
    }
  }

  function ensureDefaultGateway() {
    let saved = normalizedGateway(localStorage.getItem(GATEWAY_KEY));
    if (!saved) {
      saved = DEFAULT_GATEWAY;
      localStorage.setItem(GATEWAY_KEY, saved);
    }
    const scan = el('scanGateway');
    const voice = el('voiceGateway');
    if (scan && !normalizedGateway(scan.value)) scan.value = saved;
    if (voice && !normalizedGateway(voice.value)) voice.value = saved;
    return saved;
  }

  function ensureGatewayNote() {
    const input = el('scanGateway');
    if (!input || el('scanGatewayBuild107Note')) return;
    const row = input.parentElement;
    if (!row) return;
    const note = document.createElement('div');
    note.id = 'scanGatewayBuild107Note';
    note.className = 'meta';
    note.style.marginTop = '7px';
    note.textContent = 'Secure gateway restored automatically · runlu-gpt-gateway · shared with Voice AI.';
    row.insertAdjacentElement('afterend', note);
  }

  async function scanTestGateway107() {
    const status = el('scanAiStatus');
    const raw = el('scanGateway')?.value || localStorage.getItem(GATEWAY_KEY) || DEFAULT_GATEWAY;
    const gateway = normalizedGateway(raw);
    if (!gateway) {
      if (status) status.textContent = '🔴 Enter a valid HTTPS Cloudflare Worker URL.';
      return false;
    }

    localStorage.setItem(GATEWAY_KEY, gateway);
    if (el('scanGateway')) el('scanGateway').value = gateway;
    if (el('voiceGateway')) el('voiceGateway').value = gateway;
    if (status) status.textContent = '🟡 Testing secure AI Gateway…';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(gateway, {method:'GET', cache:'no-store', signal:controller.signal});
      let data = {};
      try { data = await response.json(); } catch (_) {}
      if (!response.ok || !data?.ok) throw new Error(data?.error || `Health check returned ${response.status}`);

      const requested = selectedProvider();
      const providers = data?.providers && typeof data.providers === 'object' ? data.providers : {};
      let active = requested;
      let ready = false;
      if (requested === 'auto') {
        if (providers.gemini) { active = 'gemini'; ready = true; }
        else if (providers.openai) { active = 'openai'; ready = true; }
      } else {
        ready = !!providers[requested];
      }

      if (!ready && Object.keys(providers).length) {
        if (status) status.textContent = `🟠 Gateway online · ${providerLabel(requested)} is not configured in Worker Secrets`;
        return false;
      }

      const version = text(data?.version) || 'online';
      if (status) status.textContent = `🟢 Gateway online · ${providerLabel(active)} ready · Cloud Vision ready · ${version}`;
      document.documentElement.setAttribute('data-runlu-scan-gateway', 'ready');
      return true;
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'Gateway test timed out after 10 seconds' : text(error?.message || error);
      if (status) status.textContent = `🔴 Gateway test failed: ${message}`;
      document.documentElement.setAttribute('data-runlu-scan-gateway', 'failed');
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function installGatewayUpgrade() {
    ensureDefaultGateway();
    ensureGatewayNote();

    window.scanTestGateway = scanTestGateway107;
    const save = el('scanSaveGateway');
    if (save) save.onclick = scanTestGateway107;

    if (!autoTestStarted && cloudVisionEnabled() && !el('scan')?.classList.contains('hidden')) {
      autoTestStarted = true;
      setTimeout(scanTestGateway107, 180);
    }
  }

  function frameMetrics107(video) {
    const canvas = el('qualityCanvas');
    if (!canvas) return {sharp:0, brightness:0, diff:99, contrast:0, canvas:null};
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const vw = video.videoWidth || 1920;
    const vh = video.videoHeight || 1080;

    // Score the same central region the operator sees inside the target frame,
    // rather than letting shelves/walls around the paper dominate the result.
    const sx = Math.round(vw * 0.07);
    const sy = Math.round(vh * 0.08);
    const sw = Math.max(1, Math.round(vw * 0.86));
    const sh = Math.max(1, Math.round(vh * 0.84));
    const w = 240;
    const h = Math.max(135, Math.round(w * sh / sw));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    let sum = 0, sum2 = 0, edge = 0, edge2 = 0;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      gray[j] = g;
      sum += g;
      sum2 += g * g;
    }
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
        edge += lap;
        edge2 += lap * lap;
      }
    }
    const edgeN = Math.max(1, (w - 2) * (h - 2));
    const pixelN = Math.max(1, w * h);
    const sharp = Math.max(0, edge2 / edgeN - (edge / edgeN) ** 2);
    const brightness = sum / pixelN;
    const contrast = Math.sqrt(Math.max(0, sum2 / pixelN - brightness * brightness));

    let diff = 99;
    try {
      if (stopSnapLastFrame && stopSnapLastFrame.length === gray.length) {
        let total = 0, samples = 0;
        for (let i = 0; i < gray.length; i += 8) {
          total += Math.abs(gray[i] - stopSnapLastFrame[i]);
          samples++;
        }
        diff = samples ? total / samples : 99;
      }
      stopSnapLastFrame = gray;
    } catch (_) {}

    return {sharp, brightness, diff, contrast, canvas};
  }

  function analyzeCameraFrame107() {
    const video = el('scanVideo');
    try {
      if (!stopSnapStream || !video || video.readyState < 2 || stopSnapCaptured) return;
    } catch (_) {
      return;
    }

    const m = frameMetrics107(video);
    const sharpScore = Math.min(100, m.sharp / 4.5);
    const lightScore = Math.max(0, 100 - Math.abs(m.brightness - 135) * 1.08);
    const stableScore = Math.max(0, 100 - m.diff * 7.1);
    const contrastScore = Math.min(100, m.contrast * 2.15);
    const score = 0.45 * sharpScore + 0.18 * lightScore + 0.25 * stableScore + 0.12 * contrastScore;

    const brightOK = m.brightness > 40 && m.brightness < 235;
    const sharpOK = m.sharp > 145;
    const stableOK = m.diff < 6.8;
    const hasDetail = m.contrast > 11;

    let state = 'Move Closer';
    let hint = 'Fill the white frame with one sheet or label.';
    if (!brightOK) {
      state = 'Lighting';
      hint = m.brightness <= 45 ? 'Lighting is low. Move closer or add light.' : 'Too much glare. Tilt the phone slightly.';
    } else if (!hasDetail || m.sharp < 70) {
      state = 'Too Blurry';
      hint = 'Move closer and keep the label inside the white frame.';
    } else if (!stableOK) {
      state = 'Hold Still';
      hint = 'Image has detail. Pause briefly, or tap CAPTURE NOW.';
    } else if (sharpOK) {
      state = 'Ready';
      hint = 'Ready — keep still for a brief moment.';
    }

    const details = `Target sharpness <b>${Math.round(sharpScore)}%</b> · Light <b>${Math.round(lightScore)}%</b> · Stability <b>${Math.round(stableScore)}%</b>`;
    try { setCameraQuality(state, score, hint, details); } catch (_) {}

    try {
      if (state === 'Ready' && score >= 58) {
        if (!stopSnapReadySince) stopSnapReadySince = Date.now();
        if (el('autoCaptureEnabled')?.checked && Date.now() - stopSnapReadySince >= 700) captureFromVideo();
      } else {
        stopSnapReadySince = 0;
      }
    } catch (_) {}
  }

  function evaluateStillImageQuality107(src) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const w = 280;
      const h = Math.max(140, Math.round(w * img.height / img.width));
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', {willReadFrequently:true});
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let sum = 0, contrast = 0, prev = null;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        sum += g;
        if (prev !== null) contrast += Math.abs(g - prev);
        prev = g;
      }
      const n = Math.max(1, d.length / 4);
      const bright = sum / n;
      const detail = Math.min(100, contrast / n * 4.4);
      const light = Math.max(0, 100 - Math.abs(bright - 135) * 1.05);
      const score = 0.68 * detail + 0.32 * light;
      const state = score >= 58 ? 'Ready' : score >= 42 ? 'Needs Review' : 'Too Blurry';
      const hint = score >= 58 ? 'Photo quality looks usable. Review every field before saving.' : 'Consider retaking closer and reducing glare.';
      try { setCameraQuality(state, score, hint, `Photo detail <b>${Math.round(detail)}%</b> · Light <b>${Math.round(light)}%</b>`); } catch (_) {}
    };
    img.src = src;
  }

  function installCameraUpgrade() {
    window.frameMetrics = frameMetrics107;
    window.analyzeCameraFrame = analyzeCameraFrame107;
    window.evaluateStillImageQuality = evaluateStillImageQuality107;

    const notice = el('cameraStage')?.previousElementSibling;
    if (notice?.classList.contains('notice') && !notice.dataset.build107) {
      notice.dataset.build107 = '1';
      notice.innerHTML = '<b>Faster camera-assisted capture</b><br>Fill the white frame with one sheet or label. Quality is measured inside the target area; Auto Capture uses a brief steady pause. You can tap CAPTURE NOW at any time.';
    }
  }

  function wrapScanBindings() {
    const baseBind = window.bindScanAiControls;
    if (typeof baseBind === 'function' && !baseBind.__build107Wrapped) {
      const wrapped = function() {
        const result = baseBind.apply(this, arguments);
        installGatewayUpgrade();
        return result;
      };
      wrapped.__build107Wrapped = true;
      window.bindScanAiControls = wrapped;
    }

    const baseRender = window.scanRenderAiControls;
    if (typeof baseRender === 'function' && !baseRender.__build107Wrapped) {
      const wrapped = function() {
        ensureDefaultGateway();
        const result = baseRender.apply(this, arguments);
        installGatewayUpgrade();
        return result;
      };
      wrapped.__build107Wrapped = true;
      window.scanRenderAiControls = wrapped;
    }
  }

  function install() {
    if (typeof window.scanRenderAiControls !== 'function' || typeof window.analyzeCameraFrame !== 'function') return false;
    wrapScanBindings();
    installGatewayUpgrade();
    installCameraUpgrade();
    document.documentElement.setAttribute('data-runlu-build107', 'scan-gateway-stop-snap');
    installed = true;
    return true;
  }

  function boot() {
    if (install()) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (install() || ++tries >= 30) clearInterval(timer);
    }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  window.addEventListener('pageshow', () => setTimeout(() => {
    wrapScanBindings();
    installGatewayUpgrade();
    installCameraUpgrade();
  }, 100));
})();
