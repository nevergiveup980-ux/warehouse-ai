// RUNLU Warehouse AI V6.6.2 Build063 — Word Carpet Tag Layout Lock
(() => {
  if (window.__RUNLU_BUILD063__) return;
  window.__RUNLU_BUILD063__ = true;

  const VERSION = '6.6.2';
  const BUILD = '063';

  const escWord = v => {
    const s = String(v ?? '');
    if (typeof window.esc === 'function') return window.esc(s);
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };

  function frontLabel(x) {
    if (!x) return '<div class="wordTag"></div>';
    const qr = typeof carpetQRImage === 'function' ? carpetQRImage(x) : '';
    const size = `${escWord(x.width || '12')}×${typeof feetLabel === 'function' ? feetLabel(x.length) : escWord(x.length || '')}`;
    const mfr = typeof cleanManufacturerRoll === 'function' ? cleanManufacturerRoll(x.manufacturerRoll) : (x.manufacturerRoll || '—');
    return `<div class="wordTag">
      <div class="tagRoll">${escWord(x.roll)}</div>
      <div class="tagProduct">${escWord(x.collection)}</div>
      <div class="tagColour">${escWord(x.colour)}</div>
      <div class="tagMeta">LOT: <b>${escWord(x.lot || '')}</b><br>SIZE: <b>${size}</b><br>MFG ROLL: <b>${escWord(mfr || '—')}</b></div>
      ${qr ? `<div class="tagQR"><img src="${qr}"></div><div class="tagScan">SCAN TO VIEW &amp; EDIT</div>` : ''}
    </div>`;
  }

  function backLabel(x) {
    if (!x) return '<div class="wordTag wordBack"></div>';
    const qr = typeof carpetQRImage === 'function' ? carpetQRImage(x) : '';
    const original = typeof feetLabel === 'function' ? feetLabel(x.originalLength) : escWord(x.originalLength || '');
    const rows = typeof cutRowsForTag === 'function' ? cutRowsForTag(x) : '';
    return `<div class="wordTag wordBack">
      <div class="tagRoll">${escWord(x.roll)}</div>
      <div class="tagOriginal">ORIGINAL SIZE: ${original}</div>
      <table class="cutTable" cellspacing="0" cellpadding="0"><thead><tr><th>DATE</th><th>PO</th><th>NAME</th><th>SALES</th><th>CUT</th><th>BAL.</th></tr></thead><tbody>${rows}</tbody></table>
      ${qr ? `<div class="backQR"><img src="${qr}"></div>` : ''}
    </div>`;
  }

  function page(leftHtml, rightHtml, breakAfter=true) {
    return `<table class="wordPage" cellspacing="0" cellpadding="0"><tr>
      <td class="wordCell">${leftHtml}</td>
      <td class="wordCell">${rightHtml}</td>
    </tr></table>${breakAfter ? '<div class="pageBreak"></div>' : ''}`;
  }

  function installWordExporter() {
    window.downloadCarpetLabelsWord = function() {
      const leftSelect = document.getElementById('labelLeft');
      const rightSelect = document.getElementById('labelRight');
      if (!leftSelect || !rightSelect || typeof carpetById !== 'function') {
        alert('Carpet label selections are not ready yet.');
        return;
      }

      const left = carpetById(leftSelect.value);
      const right = carpetById(rightSelect.value);
      if (!left || !right) {
        alert('Please choose both carpet rolls before downloading Word labels.');
        return;
      }

      // Front: left / right. Back: reversed right / left for short-edge duplex alignment.
      const body = page(frontLabel(left), frontLabel(right), true) + page(backLabel(right), backLabel(left), false);
      const css = `
        @page Section1 { size:11in 8.5in; mso-page-orientation:landscape; margin:.25in; }
        div.Section1 { page:Section1; }
        body { margin:0; font-family:Arial,sans-serif; color:#111; }
        table.wordPage { width:10.5in; height:8in; table-layout:fixed; border-collapse:collapse; mso-table-layout-alt:fixed; }
        td.wordCell { width:5.25in; height:8in; padding:.18in; vertical-align:top; border-right:1px dashed #999; page-break-inside:avoid; mso-pagination:none; }
        td.wordCell:last-child { border-right:0; }
        .wordTag { width:4.88in; height:7.62in; border:1.4px solid #222; border-radius:14px; text-align:center; padding:.20in .24in; box-sizing:border-box; page-break-inside:avoid; overflow:hidden; }
        .tagRoll { font-size:42pt; font-weight:700; line-height:1.05; margin:4pt 0 8pt; }
        .tagProduct { font-size:19pt; font-weight:700; margin:10pt 0; }
        .tagColour { font-size:26pt; font-weight:700; padding:7pt 2pt; margin:8pt 0 12pt; border-top:1px solid #555; border-bottom:1px solid #555; }
        .tagMeta { font-size:14pt; line-height:1.55; margin:10pt 0 14pt; }
        .tagQR img, .backQR img { width:72pt; height:72pt; }
        .tagQR { margin-top:20pt; text-align:center; }
        .tagScan { margin-top:4pt; font-size:7pt; font-weight:700; letter-spacing:1pt; }
        .tagOriginal { font-size:14pt; font-weight:700; margin:10pt 0 14pt; }
        table.cutTable { width:100%; table-layout:fixed; border-collapse:collapse; margin-top:8pt; font-size:8pt; page-break-inside:avoid; }
        table.cutTable th, table.cutTable td { border:1px solid #111; height:27pt; padding:2pt; text-align:center; }
        .backQR { margin-top:18pt; text-align:right; padding-right:6pt; }
        .pageBreak { page-break-after:always; height:0; line-height:0; }
      `;
      const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="Section1">${body}</div></body></html>`;
      const blob = new Blob(['\ufeff', html], {type:'application/msword'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const leftName = leftSelect.selectedOptions?.[0]?.text?.split(' — ')[0] || left.roll || 'Left';
      const rightName = rightSelect.selectedOptions?.[0]?.text?.split(' — ')[0] || right.roll || 'Right';
      a.href = url;
      a.download = `Runlu_Carpet_Tags_${leftName}_${rightName}.doc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
  }

  function showVersion() {
    const hv = document.getElementById('headerVersion');
    if (hv) hv.textContent = 'V' + VERSION;
    document.documentElement.setAttribute('data-runlu-build', BUILD);
  }

  function boot() {
    installWordExporter();
    showVersion();
    console.info('[RUNLU Build063] Word carpet tag exporter locked to fixed two-column pages.');
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, {once:true});
})();
