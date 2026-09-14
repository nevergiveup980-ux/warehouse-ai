// RUNLU Warehouse OS V6.13.1 Build134 · Shared Carpet Edit + Cloud Confirmation
// CHC022 / CHC023 may repeat as display roll codes. Editing one physical roll must not be blocked by that shared code.
// If a manufacturer roll matches an existing pending placeholder, Save Changes atomically adopts that placeholder and retires the accidental duplicate.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD134_SHARED_CARPET_EDIT__)return;
  window.__RUNLU_BUILD134_SHARED_CARPET_EDIT__=true;

  const VERSION='6.13.1',BUILD='134',CARPETDB='runlu_carpet_inventory_v52';
  const API='https://ekrnknlawekeoszzkamd.supabase.co';
  const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const SESSION='runlu_cloud_session_v54';
  const SHARED=new Set(['CHC022','CHC023']);
  let editId=null,installed=false,saving=false;

  const el=id=>document.getElementById(id);
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ');
  const sharedCode=v=>SHARED.has(norm(v));
  const cleanMfr=v=>typeof window.cleanManufacturerRoll==='function'?window.cleanManufacturerRoll(v):text(v).toUpperCase().replace(/[^A-Z0-9_-]/g,'');
  const clone=v=>JSON.parse(JSON.stringify(v));
  const rowSharedCode=r=>{const src=norm(r?.sourceRoll);if(SHARED.has(src))return src;const roll=norm(r?.roll);for(const code of SHARED)if(roll===code||roll.startsWith(code+'-')||roll.startsWith(code+'__'))return code;return ''};
  const isPendingPlaceholder=r=>!!r&&rowSharedCode(r)&&((norm(r.status)==='PENDING')||norm(r.sourceStatus)==='CHECK'||Number(r.length||0)<=0);
  const rowRecordId=r=>text(r?.cloudRecordId||r?.recordId||(rowSharedCode(r)&&text(r?.manufacturerRoll)?`${rowSharedCode(r)}-${cleanMfr(r.manufacturerRoll)}`:r?.roll));

  function currentRows(){return typeof window.carpetRecords==='function'?window.carpetRecords():[]}
  function currentId(){if(editId!=null)return editId;try{return eval('activeCarpetId')}catch{return null}}
  function lengthValue(kind){return typeof window.carpetEditLengthValue==='function'?window.carpetEditLengthValue(kind):Number(el(kind==='original'?'ceOriginal':'ceLength')?.value||0)}
  function syncLengths(){if(typeof window.syncCarpetEditLength!=='function')return true;return window.syncCarpetEditLength('current')&&window.syncCarpetEditLength('original')}
  function saveButton(){return document.querySelector('button[onclick="saveCarpetEdit()"]')}
  function setBusy(on,label='Save Changes'){const b=saveButton();if(!b)return;b.disabled=!!on;b.textContent=on?'Saving to Cloud…':label}

  function editedPayload(current){
    const roll=norm(el('ceRoll')?.value),newLength=lengthValue('current'),newOriginal=lengthValue('original');
    let measure=el('ceMeasure')?.value||'';if(current.tmRequired&&newLength!==Number(current.length||0))measure='TM';
    return {...clone(current),roll,manufacturerRoll:cleanMfr(el('ceMfr')?.value),collection:text(el('ceCollection')?.value),colour:text(el('ceColour')?.value),length:newLength,originalLength:newOriginal,width:text(el('ceWidth')?.value),location:text(el('ceLocation')?.value),lot:text(el('ceLot')?.value),measure,status:el('ceStatus')?.value||'Active',tmRequired:newLength<=50&&newLength>=3&&measure!=='TM',reviewNote:text(el('ceNote')?.value),updatedAt:new Date().toISOString()};
  }

  function session(){try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}}
  function headers(s){return {apikey:KEY,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'}}
  async function cloudCarpets(){const s=session();if(!s?.access_token)throw new Error('Warehouse Cloud sign-in is required.');const r=await fetch(API+'/rest/v1/warehouse_records?dataset_key=eq.'+encodeURIComponent(CARPETDB)+'&select=record_id,payload,version,deleted_at',{headers:headers(s)});let body=null;try{body=await r.json()}catch{}if(!r.ok)throw new Error(body?.message||body?.error||`Cloud query failed (${r.status})`);return Array.isArray(body)?body:[]}
  function cloudRowForPayload(rows,payload){const rid=rowRecordId(payload);let hit=rid&&rows.find(r=>r.record_id===rid);if(hit)return hit;const pid=String(payload?.id??'');if(pid)hit=rows.find(r=>String(r.payload?.id??'')===pid);return hit||null}
  async function mergeCloud(keep,drop,payload){
    const s=session();if(!s?.access_token)throw new Error('Warehouse Cloud sign-in is required.');
    const all=await cloudCarpets(),kr=cloudRowForPayload(all,keep),dr=drop?cloudRowForPayload(all,drop):null;
    if(!kr)throw new Error('The pending manufacturer-roll placeholder could not be found in Warehouse Cloud.');
    if(drop&&!dr)throw new Error('The current carpet record could not be found in Warehouse Cloud.');
    const req={p_keep_record_id:kr.record_id,p_drop_record_id:dr?.record_id||null,p_payload:payload,p_keep_base_version:Number(kr.version||0),p_drop_base_version:dr?Number(dr.version||0):null,p_device_id:'BUILD134-EDIT'};
    const r=await fetch(API+'/rest/v1/rpc/warehouse_merge_shared_carpet_edit',{method:'POST',headers:headers(s),body:JSON.stringify(req)});let body=null;try{body=await r.json()}catch{}if(!r.ok)throw new Error(body?.message||body?.error||`Cloud merge failed (${r.status})`);if(body?.status!=='ok')throw new Error(`Cloud merge stopped: ${body?.reason||'not confirmed'}`);return body;
  }
  async function waitForCloud(timeout=16000){const started=Date.now();while(Date.now()-started<timeout){const st=window.RUNLUCloudFirstBuild133?.status?.()||{};if(!st.pending){if(st.lastError)throw new Error(st.lastError);return true}await new Promise(r=>setTimeout(r,120))}throw new Error('Warehouse Cloud save confirmation timed out.')}
  async function refreshCloud(){if(window.RUNLUCloudFirstBuild133?.refresh)await window.RUNLUCloudFirstBuild133.refresh(false)}

  async function saveSharedEdit(){
    if(saving)return false;const rows=currentRows(),id=currentId(),current=rows.find(r=>String(r.id)===String(id));if(!current)return false;
    if(!syncLengths()){alert('Please enter inches from 0 to 11.');return true}
    const next=editedPayload(current),roll=norm(next.roll);if(!sharedCode(roll))return false;if(!roll){alert('Roll number is required.');return true}
    if(!Number.isFinite(next.length)||!Number.isFinite(next.originalLength)){alert('Please enter a valid carpet length.');return true}
    const mfr=next.manufacturerRoll,otherMfr=mfr?rows.find(r=>String(r.id)!==String(current.id)&&norm(r.manufacturerRoll)===norm(mfr)):null;
    if(otherMfr&&!isPendingPlaceholder(otherMfr)){alert(`Manufacturer Roll ${mfr} already belongs to another active carpet record.`);return true}
    saving=true;setBusy(true);
    try{
      if(otherMfr&&isPendingPlaceholder(otherMfr)&&rowSharedCode(otherMfr)===roll){
        const keep={...clone(otherMfr),...next,id:otherMfr.id,roll,sourceRoll:otherMfr.sourceRoll||roll,manufacturerRoll:mfr,cloudRecordId:rowRecordId(otherMfr),status:next.status==='Pending'?'Active':next.status,sourceStatus:'OK',sharedRollCode:true};
        await mergeCloud(otherMfr,current,keep);await refreshCloud();editId=keep.id;
        alert(`Saved to Warehouse Cloud ✓\n\n${roll} · Manufacturer Roll ${mfr}\nThe existing pending placeholder was finalized and the duplicate edit record was retired.`);
        if(typeof window.openCarpetDetail==='function')window.openCarpetDetail(keep.id);return true;
      }
      const out=rows.map(r=>String(r.id)===String(current.id)?next:r);if(!window.save(CARPETDB,out))throw new Error('Carpet Inventory save was rejected.');await waitForCloud();await refreshCloud();
      const verify=currentRows().find(r=>String(r.id)===String(current.id));if(!verify||norm(verify.roll)!==roll||norm(verify.manufacturerRoll)!==norm(mfr)||Number(verify.length)!==Number(next.length)||text(verify.location)!==text(next.location))throw new Error('Cloud verification did not match the edited carpet record.');
      alert(`Saved to Warehouse Cloud ✓\n\n${roll}${mfr?' · Manufacturer Roll '+mfr:''}`);if(typeof window.openCarpetDetail==='function')window.openCarpetDetail(current.id);return true;
    }catch(e){console.error('[Build134] shared carpet edit',e);alert('Save Changes stopped: '+String(e?.message||e)+'\n\nThe editor is still open. No successful Cloud confirmation was shown.');return true}
    finally{saving=false;setBusy(false)}
  }

  function install(){
    const edit=window.editCarpetRecord;if(typeof edit==='function'&&!edit.__build134){const prior=edit;window.editCarpetRecord=function(id){editId=id;return prior.apply(this,arguments)};window.editCarpetRecord.__build134=true;window.editCarpetRecord.__original=prior}
    const save=window.saveCarpetEdit;if(typeof save==='function'&&!save.__build134){const prior=save;window.saveCarpetEdit=function(){const roll=norm(el('ceRoll')?.value);if(!sharedCode(roll))return prior.apply(this,arguments);saveSharedEdit();return undefined};window.saveCarpetEdit.__build134=true;window.saveCarpetEdit.__original=prior;installed=true}
    document.documentElement.setAttribute('data-runlu-build134',installed?'ready':'waiting');
  }
  install();let tries=0,t=setInterval(()=>{install();if(installed&&++tries>20||++tries>160)clearInterval(t)},100);window.addEventListener('pageshow',()=>setTimeout(install,40));
  window.RUNLUSharedCarpetEditBuild134={version:BUILD,appVersion:VERSION,sharedCode,isPendingPlaceholder,rowSharedCode,rowRecordId,editedPayload,saveSharedEdit,get editId(){return editId}};
})();
