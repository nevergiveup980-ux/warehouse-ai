// RUNLU Warehouse AI V6.6.7 Build068 — Hybrid Carpet Tag
(() => {
  if (window.__RUNLU_BUILD068__) return;
  window.__RUNLU_BUILD068__ = true;

  const VERSION='6.6.7', BUILD='068';
  const escWord=v=>{
    const s=String(v??'');
    if(typeof window.esc==='function')return window.esc(s);
    return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };

  function injectHybridStyles(){
    if(document.getElementById('runluHybridCarpetTag068'))return;
    const style=document.createElement('style');
    style.id='runluHybridCarpetTag068';
    style.textContent=`
      /* Build068: Word-style visual hierarchy + RUNLU QR intelligence. */
      #carpetLabelPreview .carpetTag:not(.tagBack){padding:.30in .42in .34in;}
      #carpetLabelPreview .carpetTag:not(.tagBack) .tagRoll{font-size:54pt;font-weight:950;line-height:.96;margin-top:.04in;letter-spacing:.01em;}
      #carpetLabelPreview .carpetTag:not(.tagBack) .tagProduct{font-size:25pt;font-weight:950;margin-top:.13in;line-height:1.02;}
      #carpetLabelPreview .carpetTag:not(.tagBack) .tagColour{font-size:34pt;font-weight:950;margin:.12in .01in 0;padding:.10in .03in .11in;line-height:1;border-top:1.3px solid #333;border-bottom:1.3px solid #333;}
      #carpetLabelPreview .carpetTag:not(.tagBack) .tagMeta{font-size:18pt;line-height:1.42;margin-top:.22in;font-weight:500;}
      #carpetLabelPreview .carpetTag:not(.tagBack) .tagMeta b{font-weight:900;}
      #carpetLabelPreview .carpetTag:not(.tagBack) .tagQR{width:.96in;height:.96in;bottom:.30in;}
      #carpetLabelPreview .carpetTag:not(.tagBack) .tagScan{bottom:.10in;font-size:7pt;letter-spacing:.07em;}
      /* Keep the intelligent cutting-history back exactly in the existing RUNLU format. */
    `;
    document.head.appendChild(style);
  }

  function frontLabel(x){
    if(!x)return '<div class="wordTag"></div>';
    const qr=typeof carpetQRImage==='function'?carpetQRImage(x):'';
    const size=`${escWord(x.width||'12')}×${typeof feetLabel==='function'?feetLabel(x.length):escWord(x.length||'')}`;
    const mfr=typeof cleanManufacturerRoll==='function'?cleanManufacturerRoll(x.manufacturerRoll):(x.manufacturerRoll||'—');
    return `<div class="wordTag wordFront">
      <div class="tagRoll">${escWord(x.roll)}</div>
      <div class="tagProduct">${escWord(x.collection)}</div>
      <div class="tagColour">${escWord(x.colour)}</div>
      <div class="tagMeta"><div>LOT: <b>${escWord(x.lot||'—')}</b></div><div>SIZE: <b>${size}</b></div><div>MFG ROLL: <b>${escWord(mfr||'—')}</b></div></div>
      ${qr?`<div class="tagQR"><img src="${qr}"></div><div class="tagScan">SCAN TO VIEW &amp; EDIT</div>`:''}
    </div>`;
  }

  function backLabel(x){
    if(!x)return '<div class="wordTag wordBack"></div>';
    const qr=typeof carpetQRImage==='function'?carpetQRImage(x):'';
    const original=typeof feetLabel==='function'?feetLabel(x.originalLength):escWord(x.originalLength||'');
    const rows=typeof cutRowsForTag==='function'?cutRowsForTag(x):'';
    return `<div class="wordTag wordBack">
      <div class="tagRoll">${escWord(x.roll)}</div>
      <div class="tagOriginal">ORIGINAL SIZE: ${original}</div>
      <table class="cutTable" cellspacing="0" cellpadding="0"><thead><tr><th>DATE</th><th>PO</th><th>NAME</th><th>SALES</th><th>CUT</th><th>BAL.</th></tr></thead><tbody>${rows}</tbody></table>
      ${qr?`<div class="backQR"><img src="${qr}"></div>`:''}
    </div>`;
  }

  function page(leftHtml,rightHtml,breakAfter=true){
    return `<table class="wordPage" cellspacing="0" cellpadding="0"><tr><td class="wordCell">${leftHtml}</td><td class="wordCell">${rightHtml}</td></tr></table>${breakAfter?'<div class="pageBreak"></div>':''}`;
  }

  function installWordExporter(){
    window.downloadCarpetLabelsWord=function(){
      const leftSelect=document.getElementById('labelLeft'),rightSelect=document.getElementById('labelRight');
      if(!leftSelect||!rightSelect||typeof carpetById!=='function'){alert('Carpet label selections are not ready yet.');return;}
      const left=carpetById(leftSelect.value),right=carpetById(rightSelect.value);
      if(!left||!right){alert('Please choose both carpet rolls before downloading Word labels.');return;}
      const body=page(frontLabel(left),frontLabel(right),true)+page(backLabel(right),backLabel(left),false);
      const css=`
        @page Section1{size:11in 8.5in;mso-page-orientation:landscape;margin:.25in;}
        div.Section1{page:Section1;} body{margin:0;font-family:Arial,sans-serif;color:#111;}
        table.wordPage{width:10.5in;height:8in;table-layout:fixed;border-collapse:collapse;mso-table-layout-alt:fixed;}
        td.wordCell{width:5.25in;height:8in;padding:.18in;vertical-align:top;border-right:1px dashed #999;page-break-inside:avoid;mso-pagination:none;}td.wordCell:last-child{border-right:0;}
        .wordTag{position:relative;width:4.88in;height:7.62in;border:1.4px solid #222;border-radius:14px;text-align:center;padding:.18in .25in;box-sizing:border-box;page-break-inside:avoid;overflow:hidden;}
        .wordFront .tagRoll{font-size:50pt;font-weight:800;line-height:.95;margin:3pt 0 6pt;letter-spacing:.2pt;}
        .wordFront .tagProduct{font-size:24pt;font-weight:800;line-height:1.02;margin:9pt 0 6pt;text-transform:uppercase;}
        .wordFront .tagColour{font-size:32pt;font-weight:800;line-height:1;padding:6pt 2pt 7pt;margin:5pt 0 12pt;border-top:1.2px solid #333;border-bottom:1.2px solid #333;text-transform:uppercase;}
        .wordFront .tagMeta{font-size:17pt;line-height:1.38;margin:14pt 0 0;}.wordFront .tagMeta b{font-weight:800;}
        .wordFront .tagQR{position:absolute;left:0;right:0;bottom:34pt;text-align:center;}.wordFront .tagQR img{width:72pt;height:72pt;}
        .wordFront .tagScan{position:absolute;left:0;right:0;bottom:20pt;font-size:7pt;font-weight:700;letter-spacing:1pt;text-align:center;}
        .wordBack .tagRoll{font-size:38pt;font-weight:700;line-height:1;margin:4pt 0 5pt;}.tagOriginal{font-size:14pt;font-weight:700;margin:8pt 0 13pt;}
        table.cutTable{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:8pt;font-size:8pt;page-break-inside:avoid;}table.cutTable th,table.cutTable td{border:1px solid #111;height:27pt;padding:2pt;text-align:center;}
        .backQR{position:absolute;right:18pt;bottom:20pt;}.backQR img{width:66pt;height:66pt;}.pageBreak{page-break-after:always;height:0;line-height:0;}
      `;
      const html=`<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>${css}</style></head><body><div class="Section1">${body}</div></body></html>`;
      const blob=new Blob(['\ufeff',html],{type:'application/msword'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      const leftName=leftSelect.selectedOptions?.[0]?.text?.split(' — ')[0]||left.roll||'Left',rightName=rightSelect.selectedOptions?.[0]?.text?.split(' — ')[0]||right.roll||'Right';
      a.href=url;a.download=`Runlu_Hybrid_Carpet_Tags_${leftName}_${rightName}.doc`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    };
  }

  function showVersion(){const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;document.documentElement.setAttribute('data-runlu-build',BUILD);}
  function boot(){injectHybridStyles();installWordExporter();showVersion();console.info('[RUNLU Build068] Hybrid carpet tag: Word visual hierarchy + RUNLU QR/cutting-history intelligence.');}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
