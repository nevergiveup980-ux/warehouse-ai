// RUNLU Warehouse OS V6.12.16 Build109 · Carpet label original-style print refinement.
// Makes the front label visually closer to the familiar warehouse original while
// preserving RUNLU's QR workflow and the existing reverse-side cut history.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD109_CARPET_LABEL_ORIGINAL_STYLE__) return;
  window.__RUNLU_BUILD109_CARPET_LABEL_ORIGINAL_STYLE__ = true;

  const escSafe = value => {
    try { return typeof window.esc === 'function' ? window.esc(value ?? '') : String(value ?? ''); }
    catch (_) { return String(value ?? ''); }
  };

  function cleanRoll(value) {
    try {
      if (typeof window.cleanManufacturerRoll === 'function') return window.cleanManufacturerRoll(value || '') || '—';
    } catch (_) {}
    return String(value || '').trim() || '—';
  }

  function originalSizeLabel(x) {
    const width = String(x?.width || '12').replace(/[\s'"″’]/g, '') || '12';
    const length = Number(x?.length || 0);
    if (!Number.isFinite(length) || length < 0) return `${width}X—`;
    let feet = Math.floor(length + 1e-7);
    let inches = Math.round((length - feet) * 12);
    if (inches >= 12) { feet += 1; inches -= 12; }
    return inches > 0
      ? `${width}X${feet}’${String(inches).padStart(2, '0')}”`
      : `${width}X${feet}’`;
  }

  function injectStyle() {
    if (document.getElementById('runluBuild109CarpetLabelStyle')) return;
    const style = document.createElement('style');
    style.id = 'runluBuild109CarpetLabelStyle';
    style.textContent = `
      /* Build109 · front label: closer to the physical original reference */
      .labelFront .carpetTag.originalWarehouseLabel{
        padding:.47in .42in .34in;
        font-family:Arial,Helvetica,sans-serif;
        color:#111;
        background:#fff;
        text-align:center;
      }
      .labelFront .carpetTag.originalWarehouseLabel::before{display:none!important}
      .labelFront .originalWarehouseLabel .tagRoll{
        font-size:52pt;
        font-weight:900;
        line-height:.98;
        margin:.02in 0 0;
        letter-spacing:-.02em;
      }
      .labelFront .originalWarehouseLabel .tagProduct{
        width:94%;
        margin:.31in auto 0;
        font-size:22pt;
        font-weight:800;
        line-height:1.08;
        letter-spacing:.015em;
        text-transform:uppercase;
      }
      .labelFront .originalWarehouseLabel .tagColour{
        width:90%;
        margin:.27in auto 0;
        padding:0;
        border:0!important;
        font-size:31pt;
        font-weight:850;
        line-height:1.18;
        letter-spacing:.025em;
        text-transform:uppercase;
      }
      .labelFront .originalWarehouseLabel .tagMetaOriginal{
        width:78%;
        margin:.43in auto 0;
        font-size:15.5pt;
        line-height:1.42;
        text-align:left;
      }
      .labelFront .originalWarehouseLabel .tagMetaOriginal .tagMetaRow{
        display:grid;
        grid-template-columns:1.1in minmax(0,1fr);
        align-items:baseline;
        gap:.08in;
        margin:.08in 0;
      }
      .labelFront .originalWarehouseLabel .tagMetaOriginal span{
        font-weight:400;
        letter-spacing:.015em;
      }
      .labelFront .originalWarehouseLabel .tagMetaOriginal b{
        font-size:17pt;
        font-weight:800;
        white-space:nowrap;
      }
      .labelFront .originalWarehouseLabel .tagQR{
        left:auto!important;
        right:.33in!important;
        bottom:.28in!important;
        transform:none!important;
        width:.72in!important;
        height:.72in!important;
      }
      .labelFront .originalWarehouseLabel .tagScan{
        left:auto!important;
        right:.23in!important;
        bottom:.10in!important;
        transform:none!important;
        width:.92in!important;
        font-size:5.3pt!important;
        font-weight:700!important;
        letter-spacing:.035em!important;
        text-align:center;
        color:#444;
      }
      @media print{
        body.printingCarpetLabels .labelFront .carpetTag.originalWarehouseLabel{
          padding:.47in .42in .34in!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function installTagRenderer() {
    const base = window.carpetTagHTML;
    if (typeof base !== 'function' || base.__build109Wrapped) return false;

    const wrapped = function(x, back = false) {
      if (!x || back) return base.apply(this, arguments);
      const qr = typeof window.carpetQRImage === 'function' ? window.carpetQRImage(x) : '';
      return `<div class="carpetTag originalWarehouseLabel">
        <div class="tagRoll">${escSafe(x.roll)}</div>
        <div class="tagProduct">${escSafe(x.collection || '')}</div>
        <div class="tagColour">${escSafe(x.colour || '')}</div>
        <div class="tagMetaOriginal">
          <div class="tagMetaRow"><span>LOT:</span><b>${escSafe(x.lot || '—')}</b></div>
          <div class="tagMetaRow"><span>SIZE:</span><b>${escSafe(originalSizeLabel(x))}</b></div>
          <div class="tagMetaRow"><span>ROLL:</span><b>${escSafe(cleanRoll(x.manufacturerRoll))}</b></div>
        </div>
        ${qr ? `<div class="tagQR"><img src="${qr}"></div><div class="tagScan">SCAN TO VIEW &amp; EDIT</div>` : ''}
      </div>`;
    };
    wrapped.__build109Wrapped = true;
    window.carpetTagHTML = wrapped;
    return true;
  }

  function installWordExporter() {
    const base = window.downloadCarpetLabelsWord;
    if (typeof base !== 'function' || base.__build109Wrapped) return;

    const wrapped = function() {
      try {
        if (typeof window.renderCarpetLabels === 'function') window.renderCarpetLabels();
        const preview = document.getElementById('carpetLabelPreview');
        const left = document.getElementById('labelLeft');
        const right = document.getElementById('labelRight');
        if (!preview || !left || !right) return base.apply(this, arguments);

        const content = preview.innerHTML;
        const css = `
          @page{size:11in 8.5in;margin:.25in}
          body{font-family:Arial,Helvetica,sans-serif;color:#111}
          .labelPage{width:10.5in;height:8in;display:table;page-break-after:always}
          .carpetTag{display:table-cell;width:50%;padding:.34in .45in;text-align:center;vertical-align:top;border-right:1px dashed #aaa;position:relative;overflow:hidden}
          .carpetTag:before{content:"";position:absolute;inset:.16in;border:1.4px solid #222;border-radius:16px}
          .labelFront .originalWarehouseLabel{padding:.47in .42in .34in;color:#111}
          .labelFront .originalWarehouseLabel:before{display:none}
          .labelFront .tagRoll{font-size:52pt;font-weight:900;line-height:.98;margin-top:1pt;letter-spacing:-1pt}
          .labelFront .tagProduct{width:94%;margin:22pt auto 0;font-size:22pt;font-weight:800;line-height:1.08;text-transform:uppercase}
          .labelFront .tagColour{width:90%;margin:20pt auto 0;padding:0;border:0;font-size:31pt;font-weight:850;line-height:1.18;text-transform:uppercase}
          .tagMetaOriginal{width:78%;margin:31pt auto 0;font-size:15.5pt;line-height:1.42;text-align:left}
          .tagMetaRow{margin:6pt 0;white-space:nowrap}.tagMetaRow span{display:inline-block;width:78pt;font-weight:400}.tagMetaRow b{font-size:17pt;font-weight:800}
          .labelFront .tagQR{position:absolute;right:24pt;bottom:20pt;width:52pt;height:52pt}.labelFront .tagQR img{width:100%;height:100%}
          .labelFront .tagScan{position:absolute;right:17pt;bottom:7pt;width:66pt;font-size:5.3pt;font-weight:bold;text-align:center;color:#444}
          .tagBack .tagRoll{font-size:38pt;font-weight:bold;margin-top:3pt}.tagOriginal{font-size:14pt;font-weight:bold;margin:12pt}.cutTable{width:100%;border-collapse:collapse;font-size:8pt}.cutTable th,.cutTable td{border:1px solid #111;height:28pt}.tagBack .tagQR{position:absolute;right:20pt;bottom:20pt;width:65pt;height:65pt}.tagBack .tagQR img{width:100%;height:100%}
        `;
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${content}</body></html>`;
        const blob = new Blob(['\ufeff', html], {type:'application/msword'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const l = left.selectedOptions?.[0]?.text?.split(' — ')[0] || 'Left';
        const r = right.selectedOptions?.[0]?.text?.split(' — ')[0] || 'Right';
        a.download = `Runlu_Carpet_Tags_${l}_${r}.doc`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (_) {
        return base.apply(this, arguments);
      }
    };
    wrapped.__build109Wrapped = true;
    window.downloadCarpetLabelsWord = wrapped;
  }

  function refreshPreview() {
    try {
      const maker = document.getElementById('carpetLabelMaker');
      if (maker && !maker.classList.contains('hidden') && typeof window.renderCarpetLabels === 'function') {
        window.renderCarpetLabels();
      }
    } catch (_) {}
  }

  function install() {
    if (typeof window.carpetTagHTML !== 'function') return false;
    injectStyle();
    const ready = installTagRenderer();
    installWordExporter();
    document.documentElement.setAttribute('data-runlu-build109', 'carpet-label-original-style');
    if (ready) refreshPreview();
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
    injectStyle();
    installTagRenderer();
    installWordExporter();
    refreshPreview();
  }, 100));
})();
