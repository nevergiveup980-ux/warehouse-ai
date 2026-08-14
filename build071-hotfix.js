// RUNLU Warehouse AI V6.7.0 Build071 — Product Identity Guard
(() => {
  if (window.__RUNLU_BUILD071__) return;
  window.__RUNLU_BUILD071__ = true;

  const VERSION='6.7.0', BUILD='071';
  const PM='runlu_product_master_v21';
  const INV='runlu_inventory_records_v21';
  const LOG='runlu_operations_log_v52';
  const EVENT='runlu_event_history_v52';
  const REVIEW='runlu_build071_product_identity_review';
  const AUDIT='runlu_build071_product_identity_audit';
  const BACKUP='runlu_build071_identity_backup';

  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,' ').trim();
  const compact=v=>norm(v).replace(/[^A-Z0-9]/g,'');
  const parse=v=>{try{return JSON.parse(v)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const parseMs=v=>{const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0};
  const rowMs=r=>Math.max(parseMs(r?.lastUpdatedAt),parseMs(r?.updatedAt),parseMs(r?.updated),parseMs(r?.createdAt),parseMs(r?.created));

  function randomLetters(n=6){
    const letters='ABCDEFGHJKLMNPQRSTUVWXYZ';
    try{
      const bytes=new Uint8Array(n);crypto.getRandomValues(bytes);
      return [...bytes].map(b=>letters[b%letters.length]).join('');
    }catch{return Array.from({length:n},()=>letters[Math.floor(Math.random()*letters.length)]).join('')}
  }
  function collisionProofMasterId(){
    const masters=Array.isArray(read(PM))?read(PM):[];
    const seqs=masters.map(x=>{const m=text(x?.id).match(/^PRD-(\d{4})(?:-[A-Z]+)?$/i);return m?Number(m[1]):0}).filter(Number.isFinite);
    const next=(seqs.length?Math.max(...seqs):0)+1;
    let id='';
    do{id=`PRD-${String(next).padStart(4,'0')}-${randomLetters(6)}`}while(masters.some(x=>text(x.id)===id));
    return id;
  }
  window.runluNextCollisionProofProductId=collisionProofMasterId;

  function installIdGenerator(){
    if(typeof window.nextMasterId!=='function')return false;
    if(window.nextMasterId.__build071)return true;
    const f=function(){return collisionProofMasterId()};
    f.__build071=true;
    window.nextMasterId=f;
    return true;
  }

  function identity(r){
    return {
      id:text(r?.id),
      name:norm(r?.name),brand:norm(r?.brand),series:norm(r?.series),color:norm(r?.color),sku:norm(r?.sku),category:norm(r?.category)
    };
  }
  function identityLabel(r){
    return [text(r?.name)||text(r?.collection)||'Unnamed product',text(r?.color)||text(r?.colour),text(r?.sku)].filter(Boolean).join(' · ');
  }
  function incompatible(a,b){
    if(!a||!b)return false;
    const A=identity(a),B=identity(b);
    if(A.sku&&B.sku&&A.sku!==B.sku)return true;
    if(A.name&&B.name&&A.name!==B.name)return true;
    if(A.color&&B.color&&A.color!==B.color)return true;
    if(A.brand&&B.brand&&A.brand!==B.brand&&A.name===B.name)return true;
    if(A.category&&B.category&&A.category!==B.category&&A.name===B.name)return true;
    return false;
  }
  function overlay(a,b){
    const newer=rowMs(b)>rowMs(a)?b:a, older=newer===a?b:a, out={...(older||{})};
    for(const [k,v] of Object.entries(newer||{}))if(v!==''&&v!==null&&v!==undefined)out[k]=v;
    return out;
  }

  function historicalIdentitySignals(){
    const pm=Array.isArray(read(PM))?read(PM):[],ops=Array.isArray(read(LOG))?read(LOG):[];
    const map=new Map();
    const add=(id,label,source,at)=>{
      id=text(id);label=text(label);if(!id||!label)return;
      const k=compact(label);if(!k)return;
      if(!map.has(id))map.set(id,new Map());
      const bucket=map.get(id);if(!bucket.has(k))bucket.set(k,{label,source,count:0,firstAt:at||'',lastAt:at||''});
      const x=bucket.get(k);x.count++;if(at&&(!x.firstAt||parseMs(at)<parseMs(x.firstAt)))x.firstAt=at;if(at&&parseMs(at)>parseMs(x.lastAt))x.lastAt=at;
    };
    pm.forEach(x=>add(x.id,identityLabel(x),'Product Master',x.updated||x.updatedAt));
    ops.forEach(o=>{
      const name=text(o.collection)||text(o.product).split('·')[0].trim();
      const colour=text(o.colour||o.color);
      if(o.productId&&name)add(o.productId,[name,colour].filter(Boolean).join(' · '),'Operations',o.createdAt||o.date);
    });
    return map;
  }

  function scanIdentityConflicts(){
    const pm=Array.isArray(read(PM))?read(PM):[],byId=new Map(),conflicts=[];
    for(const row of pm){
      const id=text(row?.id);if(!id)continue;
      if(byId.has(id)&&incompatible(byId.get(id),row))conflicts.push({type:'duplicate-master-id',id,a:byId.get(id),b:row});
      else if(!byId.has(id))byId.set(id,row);
    }
    const signals=historicalIdentitySignals();
    for(const [id,bucket] of signals){
      const meaningful=[...bucket.values()].filter(x=>x.count>0);
      const names=new Set(meaningful.map(x=>compact(x.label.split('·')[0])));
      if(names.size>1)conflicts.push({type:'history-vs-master',id,signals:meaningful,current:byId.get(id)||null});
    }
    write(REVIEW,{at:new Date().toISOString(),conflicts});
    return conflicts;
  }

  async function cloudProductMergeGuard(){
    const conflicts=typeof window.cloudConflictKeys==='function'?window.cloudConflictKeys():[];
    if(!conflicts.includes(PM))return {paused:false,changed:false};
    const ensure=window.cloudEnsureSession,fetchRows=window.cloudFetchRows,hydrate=window.cloudHydratePayload,put=window.cloudPutDatasetInitial;
    if(typeof ensure!=='function'||typeof fetchRows!=='function'||typeof put!=='function')return {paused:true,reason:'Cloud helpers unavailable'};
    const session=await ensure();if(!session)return {paused:true,reason:'Cloud sign-in required'};
    const rows=await fetchRows(),remoteRow=(rows||[]).find(r=>r.dataset_key===PM);
    if(!remoteRow)return {paused:false,changed:false};
    const cloud=typeof hydrate==='function'?await hydrate(remoteRow.payload,session):remoteRow.payload;
    const local=Array.isArray(read(PM))?read(PM):[];
    if(!Array.isArray(cloud))return {paused:true,reason:'Cloud Product Master is not an array'};
    const map=new Map(),collisions=[];
    local.forEach(r=>{if(text(r?.id))map.set(text(r.id),{...r})});
    for(const r of cloud){
      const id=text(r?.id);if(!id)continue;
      if(!map.has(id)){map.set(id,{...r});continue}
      const cur=map.get(id);
      if(incompatible(cur,r)){
        collisions.push({id,device:cur,cloud:r,deviceLabel:identityLabel(cur),cloudLabel:identityLabel(r)});
        continue;
      }
      map.set(id,overlay(cur,r));
    }
    if(collisions.length){
      const prior=read(REVIEW)||{};write(REVIEW,{...prior,at:new Date().toISOString(),cloudCollisions:collisions});
      renderPanel();
      return {paused:true,collisions};
    }
    const merged=[...map.values()];
    const prior=window.cloudApplying;try{window.cloudApplying=true;write(PM,merged)}finally{window.cloudApplying=prior}
    await put(PM,merged,session);
    try{window.clearCloudDirty?.(PM);window.clearCloudConflict?.(PM)}catch{}
    return {paused:false,changed:true,mergedCount:merged.length};
  }
  window.runluProductIdentityMergeGuard=cloudProductMergeGuard;

  function knownBartonTolkoCase(){
    const pm=Array.isArray(read(PM))?read(PM):[],inv=Array.isArray(read(INV))?read(INV):[];
    const bad=pm.find(x=>text(x.id)==='PRD-0013'&&/TOLKO\s+ULAY\s+PLYWOOD/i.test(text(x.name))&&/BARTON\s*2/i.test(text(x.color)));
    const sibling=pm.find(x=>/GRAND\s+CRU/i.test(text(x.name))&&/BARTON\s*1/i.test(text(x.color)));
    if(!bad||!sibling)return null;
    const linked=inv.filter(r=>text(r.masterId)==='PRD-0013');
    const tolko=linked.filter(r=>/PIECE/i.test(text(r.unit))||/SHEET|SKID|PLYWOOD/i.test(text(r.notes))||(/M7F/i.test(text(r.location))&&parseMs(r.createdAt)>=Date.parse('2026-08-14T00:00:00Z')));
    const barton=linked.filter(r=>!tolko.includes(r));
    if(!tolko.length||!barton.length)return null;
    return {bad,sibling,linked,tolko,barton};
  }

  function invIdentity(r){return text(r?.inventoryId||r?.id)}
  function appendAuditEvent(events,result,extra={}){
    events.unshift({id:Date.now()+Math.random(),time:new Date().toISOString(),type:'Product Identity Repair',reference:'PRD-0013',result,...extra});
  }

  async function repairBartonTolko(){
    const c=knownBartonTolkoCase();
    if(!c)throw new Error('The exact Barton 2 / Tolko identity collision is not present on this device. No data was changed.');
    const pm=Array.isArray(read(PM))?read(PM):[],inv=Array.isArray(read(INV))?read(INV):[],ops=Array.isArray(read(LOG))?read(LOG):[],events=Array.isArray(read(EVENT))?read(EVENT):[];
    const now=new Date(),iso=now.toISOString();
    const existingTolko=pm.find(x=>text(x.id)!=='PRD-0013'&&norm(x.sku)===norm(c.bad.sku)&&norm(c.bad.sku));
    const tolkoId=existingTolko?.id||collisionProofMasterId();
    const backup={at:iso,reason:'Before Barton 2 / Tolko PRD-0013 split',master:c.bad,sibling:c.sibling,inventory:c.linked,operations:ops.filter(o=>text(o.productId)==='PRD-0013')};
    write(BACKUP,backup);

    const barton2={...c.sibling,id:'PRD-0013',color:'Barton 2',sku:'',updated:now.toLocaleString(),lastUpdatedAt:iso,identityRestoredAt:iso,identityRestoredBy:'Build071'};
    const tolko={...c.bad,id:tolkoId,color:/BARTON\s*2/i.test(text(c.bad.color))?'':c.bad.color,updated:now.toLocaleString(),lastUpdatedAt:iso,identitySeparatedAt:iso,identitySeparatedBy:'Build071'};

    const idx=pm.findIndex(x=>text(x.id)==='PRD-0013');if(idx>=0)pm[idx]=barton2;else pm.unshift(barton2);
    if(existingTolko){const ti=pm.findIndex(x=>text(x.id)===text(existingTolko.id));pm[ti]=overlay(existingTolko,tolko)}else pm.unshift(tolko);

    const tolkoInvIds=new Set(c.tolko.map(invIdentity));
    for(const r of inv){
      if(text(r.masterId)!=='PRD-0013')continue;
      if(tolkoInvIds.has(invIdentity(r))){r.masterId=tolkoId;r.lastUpdatedAt=iso;r.updated=now.toLocaleString();r.identityRepairedAt=iso;r.identityRepair='Moved from collided PRD-0013 to Tolko product identity';}
    }

    const invById=new Map(inv.map(r=>[invIdentity(r),r]));
    let bartonOps=0,tolkoOps=0,ambiguous=0;
    for(const o of ops){
      if(text(o.productId)!=='PRD-0013')continue;
      const linked=invById.get(text(o.inventoryRecordId));
      const linkedTolko=linked&&text(linked.masterId)===text(tolkoId);
      const linkedBarton=linked&&text(linked.masterId)==='PRD-0013';
      const looksTolko=/TOLKO\s+ULAY|PLYWOOD/i.test([o.collection,o.product].map(text).join(' '));
      const looksBarton=/GRAND\s+CRU|BARTON\s*2/i.test([o.collection,o.product,o.colour].map(text).join(' '));
      if(linkedTolko||(!linked&&looksTolko&&/PIECE/i.test(text(o.unit)))){
        o.productId=tolkoId;o.collection=tolko.name;o.colour='';o.product=[tolko.name,tolko.sku].filter(Boolean).join(' · ');o.identityRepairedAt=iso;tolkoOps++;
      }else if(linkedBarton||looksBarton||looksTolko){
        // If an operation is linked to the old CR5/Box inventory, it is Barton even if the current master name had already polluted its display.
        o.productId='PRD-0013';o.collection='Grand Cru';o.colour='Barton 2';o.product='Grand Cru · Barton 2';o.identityRepairedAt=iso;bartonOps++;
      }else ambiguous++;
    }

    appendAuditEvent(events,`Split collided PRD-0013 into Grand Cru · Barton 2 and ${tolko.name} (${tolkoId}). Reassigned ${c.tolko.length} clearly Tolko inventory record(s); normalized ${bartonOps} Barton operation(s) and ${tolkoOps} Tolko operation(s).${ambiguous?` ${ambiguous} ambiguous operation(s) left unchanged for review.`:''}`,{newProductId:tolkoId});

    write(PM,pm);write(INV,inv);write(LOG,ops);write(EVENT,events);
    write(AUDIT,{at:iso,status:'REPAIRED',case:'PRD-0013 Barton2/Tolko',tolkoId,tolkoInventoryMoved:c.tolko.length,bartonInventoryKept:c.barton.length,bartonOps,tolkoOps,ambiguous});

    if(localStorage.getItem('runlu_cloud_sync_enabled_v54')==='1'&&typeof window.flushAndVerifyDatasets==='function'){
      await window.flushAndVerifyDatasets([PM,INV,LOG,EVENT]);
    }else{
      try{window.markCloudDirty?.(PM);window.markCloudDirty?.(INV);window.markCloudDirty?.(LOG);window.markCloudDirty?.(EVENT)}catch{}
    }
    try{window.renderProducts?.();window.renderInventory?.();window.renderOperations?.();window.renderDashboard?.();window.refreshMemory?.();window.renderCloudStatus?.()}catch{}
    renderPanel();
    return {tolkoId,bartonOps,tolkoOps,ambiguous};
  }
  window.runluRepairBartonTolkoIdentity=repairBartonTolko;

  function panelHtml(){
    const conflicts=scanIdentityConflicts(),known=knownBartonTolkoCase();
    const audit=read(AUDIT)||{};
    return `<div style="font-weight:900;font-size:16px;margin-bottom:7px">🪪 Product Identity Guard</div>
      <div style="line-height:1.5">New Product IDs now use a collision-proof suffix, so two devices cannot independently create the same PRD identity.</div>
      <div style="margin-top:7px"><b>Identity signals needing review:</b> ${conflicts.length}</div>
      ${known?`<div style="margin-top:10px;padding:10px;border-radius:10px;background:#fff0f1;color:#7d1f2c"><b>Safe repair available:</b> PRD-0013 currently mixes <b>Tolko Ulay Plywood</b> with historical <b>Grand Cru · Barton 2</b>. The repair keeps old CR5/Box Barton inventory under PRD-0013 and moves clearly Tolko Piece/sheet inventory to a new unique product ID.</div><button id="build071RepairKnown" class="green" style="margin-top:10px">Repair Barton 2 / Tolko Identity</button>`:''}
      ${audit.status==='REPAIRED'?`<div style="margin-top:10px;color:#176b40"><b>Last identity repair:</b> ${text(audit.at)} · Tolko → ${text(audit.tolkoId)}</div>`:''}`;
  }

  function renderPanel(){
    const status=document.getElementById('cloudStatus');if(!status)return false;
    let box=document.getElementById('build071IdentityPanel');
    if(!box){box=document.createElement('div');box.id='build071IdentityPanel';status.insertAdjacentElement('afterend',box)}
    box.style.cssText='margin:14px 0;padding:14px;border:1px solid #b9d6ff;background:#f4f8ff;border-radius:14px;color:#183153';
    box.innerHTML=panelHtml();
    const btn=document.getElementById('build071RepairKnown');if(btn)btn.onclick=async()=>{
      if(!confirm('Repair the confirmed PRD-0013 identity collision?\n\nGrand Cru · Barton 2 will keep PRD-0013 and its old CR5/Box inventory. Tolko Ulay Plywood will receive a new collision-proof Product ID, and clearly Tolko Piece/sheet inventory will move with it.\n\nA backup/audit snapshot will be saved first.'))return;
      btn.disabled=true;btn.textContent='Repairing identity…';
      try{const r=await repairBartonTolko();alert(`Product identity repair completed.\n\nBarton 2 restored as PRD-0013.\nTolko moved to ${r.tolkoId}.\n\nCloud verification was requested before completion.`)}catch(e){alert('Identity repair stopped: '+(e.message||e))}finally{renderPanel()}
    };
    return true;
  }

  function wrapSync(){
    const cur=window.cloudSyncNow;if(typeof cur!=='function'||cur.__build071)return false;
    const wrapped=async function(...args){
      try{
        const r=await cloudProductMergeGuard();
        if(r?.paused){renderPanel();alert('Product Master sync paused because the same Product ID represents different products on device and cloud. Nothing was overwritten. Open Settings → Product Identity Guard to review.');return;}
      }catch(e){console.warn('[Build071] product identity pre-sync guard',e);return;}
      return cur.apply(this,args);
    };
    wrapped.__build071=true;wrapped.__original=cur;window.cloudSyncNow=wrapped;return true;
  }

  function installLegacyBlock(){
    const legacy=document.getElementById('build069SafeMergeBtn');if(legacy)legacy.remove();
    // Product Master must never be resolved by whole-record overlay when identities disagree.
    if(typeof window.runluSafeMergeBothSides==='function'&&!window.runluSafeMergeBothSides.__build071){
      const prior=window.runluSafeMergeBothSides;
      const guarded=async function(keys,opts){
        const wanted=Array.isArray(keys)?keys:null;
        if(!wanted||wanted.includes(PM)){
          const r=await cloudProductMergeGuard();if(r?.paused)return r;
        }
        return prior(wanted?wanted.filter(k=>k!==PM):wanted,opts||{});
      };
      guarded.__build071=true;window.runluSafeMergeBothSides=guarded;
    }
  }

  function showVersion(){const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;document.documentElement.setAttribute('data-runlu-build',BUILD)}
  function install(){showVersion();installIdGenerator();installLegacyBlock();wrapSync();renderPanel()}
  function boot(){install();let n=0;const t=setInterval(()=>{install();if(++n>240)clearInterval(t)},100)}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
