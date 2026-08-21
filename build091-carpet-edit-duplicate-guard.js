// RUNLU Warehouse AI V6.12.5 Build091 — Carpet Edit Duplicate Guard
(() => {
  if(window.__RUNLU_BUILD091_CARPET_EDIT__) return;
  window.__RUNLU_BUILD091_CARPET_EDIT__=true;

  function sameCarpetRecord(a,b){
    if(!a||!b) return false;
    if(String(a.id??'')&&String(a.id)===String(b.id??'')) return true;
    const ac=String(a.cloudRecordId||'').trim(),bc=String(b.cloudRecordId||'').trim();
    if(ac&&bc&&ac===bc) return true;
    // Carpet Roll # is the cloud identity in the current Cloud Master model.
    return !!normKey(a.roll)&&normKey(a.roll)===normKey(b.roll);
  }

  window.saveCarpetEdit=function(){
    const a=carpetRecords(),x=a.find(r=>Number(r.id)===Number(activeCarpetId));
    if(!x) return;
    if(!syncCarpetEditLength('current')||!syncCarpetEditLength('original')){
      alert('Please enter inches from 0 to 11.');
      return;
    }

    const roll=$('ceRoll').value.trim().toUpperCase();
    const oldRoll=x.roll;
    const oldLength=x.length;
    const newLength=carpetEditLengthValue('current');
    const newOriginal=carpetEditLengthValue('original');
    if(!roll){
      alert('Roll number is required.');
      return;
    }

    // Edit semantics: an unchanged identifier must never block edits to unrelated
    // fields. Only validate uniqueness when the user actually changes the Roll #.
    const rollChanged=normKey(oldRoll)!==normKey(roll);
    if(rollChanged&&a.some(r=>!sameCarpetRecord(r,x)&&normKey(r.roll)===normKey(roll))){
      alert('This operational roll number already exists.');
      return;
    }

    let measure=$('ceMeasure').value;
    if(x.tmRequired&&newLength!==oldLength) measure='TM';

    const manufacturerRoll=cleanManufacturerRoll($('ceMfr').value);
    const oldManufacturerRoll=cleanManufacturerRoll(x.manufacturerRoll);
    const manufacturerChanged=normKey(oldManufacturerRoll)!==normKey(manufacturerRoll);

    // Same rule for Manufacturer Roll: keep the existing value editable even if
    // legacy/split/synced data already contains the same manufacturer number.
    // A newly entered/changed manufacturer number is still protected from creating
    // a new duplicate on another carpet record.
    if(manufacturerRoll&&manufacturerChanged&&a.some(r=>!sameCarpetRecord(r,x)&&normKey(cleanManufacturerRoll(r.manufacturerRoll))===normKey(manufacturerRoll))){
      alert('This manufacturer roll number already exists.');
      return;
    }

    Object.assign(x,{
      roll,
      manufacturerRoll,
      collection:$('ceCollection').value.trim(),
      colour:$('ceColour').value.trim(),
      length:newLength,
      originalLength:newOriginal,
      width:$('ceWidth').value.trim(),
      location:$('ceLocation').value.trim(),
      lot:$('ceLot').value.trim(),
      measure,
      status:$('ceStatus').value,
      tmRequired:newLength<=50&&newLength>=3&&measure!=='TM',
      reviewNote:$('ceNote').value.trim(),
      updatedAt:new Date().toISOString()
    });

    if(rollChanged){
      const cuts=cuttingRecords();
      cuts.forEach(c=>{if(normKey(c.roll)===normKey(oldRoll)) c.roll=roll});
      save(CUTDB,cuts);
      const ops=operationRecords();
      ops.forEach(o=>{if(normKey(o.roll)===normKey(oldRoll)) o.roll=roll});
      save(LOGDB,ops);
    }

    if(save(CARPETDB,a)===false){
      alert('The carpet record could not be saved. Please try again.');
      return;
    }
    renderCarpetInventory();
    if(measure==='TM'&&x.length<=50) alert('TRUE MEASURE saved. Measure status changed from CAL to TM.');
    openCarpetDetail(x.id);
  };

  document.documentElement.setAttribute('data-runlu-carpet-edit-guard','091');
})();
