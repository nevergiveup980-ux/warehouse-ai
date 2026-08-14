// RUNLU Warehouse AI V6.6.5 Build066 — Hotfix Scope Bridge + Return Recovery
(() => {
  if (window.__RUNLU_BUILD066__) return;
  window.__RUNLU_BUILD066__ = true;

  const VERSION='6.6.5', BUILD='066';
  const CARPET_KEY='runlu_carpet_inventory_v52';
  const CUT_KEY='runlu_cutting_log_v52';
  const LOG_KEY='runlu_operations_log_v52';
  const DATA_KEYS=[
    'runlu_inventory_v20','runlu_product_master_v21','runlu_inventory_records_v21','runlu_orders_v20',
    'runlu_receiving_v50','runlu_tasks_v50','runlu_special_orders_v51',LOG_KEY,CARPET_KEY,CUT_KEY,
    'runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55','runlu_settings_v20',
    'runlu_count_sessions_v30','runlu_scan_learning_dictionary','runlu_scan_supplier_templates_v1'
  ];
  // Bridge lexical top-level const keys into the window namespace used by isolated hotfix layers.
  window.CARPETDB=CARPET_KEY;
  window.CUTDB=CUT_KEY;
  window.LOGDB=LOG_KEY;
  window.DATA_KEYS=DATA_KEYS;

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,'');
  const near=(a,b)=>Math.abs(Number(a||0)-Number(b||0))<0.011;
  const read=k=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch{return[]}};
  const write=(k,v)=>{if(typeof window.save==='function')return window.save(k,v);localStorage.setItem(k,JSON.stringify(v));return true};

  function showVersion(){const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;document.documentElement.setAttribute('data-runlu-build',BUILD)}
  function nextChild(sourceRoll,rows){
    if(typeof window.nextCarpetChildRoll==='function')return window.nextCarpetChildRoll(sourceRoll,rows);
    const base=String(sourceRoll||'').trim().toUpperCase();
    for(let i=0;i<26;i++){const c=base+String.fromCharCode(65+i);if(!rows.some(r=>norm(r.roll)===norm(c)))return c}
    return '';
  }
  function existingChild(opId,rows){return rows.find(x=>String(x.sourceOperationId||'')===String(opId)&&['CUT PIECE RETURN','INSTALLER RETURN'].includes(String(x.relationType||'').toUpperCase()))}
  function sourceRoll(rows,roll){return typeof window.findCarpetRoll==='function'?window.findCarpetRoll(rows,roll):rows.find(x=>norm(x.roll)===norm(roll))}
  function feet(v){return typeof window.feetLabel==='function'?window.feetLabel(v):`${Number(v||0)} ft`}

  function recoverOne(r){
    if(!r||r.status!=='Completed'||r.inventoryMode!=='Stock'||!['Cut Piece Return','Installer Return'].includes(r.type)||!(Number(r.quantity)>0)||!r.roll)return false;
    let rows=read(CARPET_KEY);
    if(existingChild(r.id,rows))return false;
    const source=sourceRoll(rows,r.roll);if(!source)return false;
    const childRoll=nextChild(source.roll,rows);if(!childRoll)return false;
    const now=new Date().toISOString(),installer=r.type==='Installer Return';
    const child={id:Date.now()+Math.random(),roll:childRoll,sourceRoll:source.roll,parentRoll:source.roll,manufacturerRoll:source.manufacturerRoll||'',lot:r.lot||source.lot||'',collection:r.collection||r.product||source.collection,colour:r.colour||source.colour,length:Number(r.quantity),originalLength:Number(r.quantity),width:r.width||source.width||'12',location:r.location||source.location||(installer?'Installer Returns':'Returned Cut Pieces'),measure:'TM',status:Number(r.quantity)<3?'Used Up':'Active',tmRequired:false,po:r.po||'',customer:r.customer||'',supplier:r.supplier||source.supplier||'',returnReason:r.notes||(installer?'Installer leftover returned':'Order size changed'),relationType:installer?'INSTALLER RETURN':'CUT PIECE RETURN',sourceOperationId:r.id,createdAt:now,updatedAt:now};
    rows.unshift(child);if(!write(CARPET_KEY,rows))return false;
    const verify=read(CARPET_KEY).find(x=>String(x.sourceOperationId||'')===String(r.id)&&norm(x.roll)===norm(childRoll)&&near(x.length,r.quantity));if(!verify)return false;
    const cuts=read(CUT_KEY),match=cuts.find(c=>norm(c.roll)===norm(source.roll)&&!c.returnedToStock&&near(c.cutLength,r.quantity));if(match){match.returnedToStock=true;match.returnedChildRoll=childRoll;match.returnOperationId=r.id;match.returnedAt=now;match.returnReason=r.notes||'Order size changed';write(CUT_KEY,cuts)}
    r.impactApplied=true;r.returnedChildRoll=childRoll;r.inventoryVerified=true;r.inventoryVerifiedAt=now;r.appliedAt=r.appliedAt||now;r.impactResult=`${installer?'Installer leftover':'Cut piece'} returned as ${childRoll}: ${feet(r.quantity)} · source ${source.roll} unchanged at ${feet(source.length)} · measure TM · recovered and verified`;
    return true;
  }
  function repair(){
    const ops=read(LOG_KEY);let changed=false,count=0;
    for(const op of ops){
      if(Array.isArray(op.items)&&op.items.length){op.items.forEach((item,i)=>{const r={...op,...item,id:Number(op.id)+((i+1)/1000),type:item.type||op.type,inventoryMode:item.inventoryMode||op.inventoryMode,status:'Completed',po:op.po,customer:op.customer,operator:op.operator,notes:item.notes||op.notes};if(recoverOne(r)){Object.assign(item,{impactApplied:true,impactResult:r.impactResult,appliedAt:r.appliedAt,returnedChildRoll:r.returnedChildRoll,inventoryVerified:true,inventoryVerifiedAt:r.inventoryVerifiedAt});changed=true;count++}})}
      else if(recoverOne(op)){changed=true;count++}
    }
    if(changed){write(LOG_KEY,ops);console.info(`[Build066] Recovered ${count} missing returned carpet child roll(s).`);try{window.renderOperations?.();window.renderCarpetInventory?.()}catch{}}
  }
  function boot(){showVersion();setTimeout(repair,350);setTimeout(repair,1800);setTimeout(repair,4500)}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
