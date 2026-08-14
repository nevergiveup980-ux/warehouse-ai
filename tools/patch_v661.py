from pathlib import Path
import json

p=Path('index.html')
s=p.read_text(encoding='utf-8')
s=s.replace('RUNLU Warehouse AI V6.6.0 Cloud Status Recovery Build061','RUNLU Warehouse AI V6.6.1 Record-Level Cloud Merge + Workstation Layout Build062')
s=s.replace("const APP_VERSION='6.6.0', APP_BUILD='061'", "const APP_VERSION='6.6.1', APP_BUILD='062'")
s=s.replace('>V6.6.0</span>', '>V6.6.1</span>')

css='''
<style id="runlu-v661-responsive">
:root{--runlu-page-max:1560px}
@media (min-width:960px){
  header .top,main,footer .nav{max-width:min(var(--runlu-page-max),calc(100vw - 48px));width:100%}
  main{padding:20px 24px 112px}
  header{padding-left:24px;padding-right:24px}
  header .brandLogo{width:70px;height:46px}
  header h1{font-size:clamp(18px,1.3vw,23px)}
  header p{font-size:12px}
  .grid2{grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
  .stats{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
  .formgrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  .inventoryActions{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  .mapGrid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
  .reportGrid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  .detectGrid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .quick{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
  .modalOverlay{align-items:center;padding:28px}
  .modalSheet{width:min(1080px,92vw);max-height:90vh;border-radius:22px}
  #carpetLabelMaker .labelControls{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  #carpetLabelMaker .dayHeader{align-items:center}
  #carpetLabelMaker .labelPreview{max-width:1240px;margin-left:auto;margin-right:auto}
  #settings .settingRow{padding:18px 4px}
  #settings input,#settings select,#settings textarea{max-width:100%}
  .listToolbar input{min-width:320px}
  .card{padding:18px}
}
@media (min-width:1320px){
  .formgrid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .module{min-height:118px}
  .mapGrid{grid-template-columns:repeat(6,minmax(0,1fr))}
  .scanTools{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:959px){header .top,main,footer .nav{max-width:900px}}
</style>
'''
if 'id="runlu-v661-responsive"' not in s:
    s=s.replace('</head>',css+'\n</head>',1)

js='''
<script id="runlu-v661-sync-repair">
(function(){
  function recordKey(datasetKey,row,index){
    if(!row||typeof row!=='object')return 'idx:'+index;
    if(datasetKey===CARPETDB){
      const raw=row.roll||row.manufacturerRoll||row.sourceRoll||row.id||'';
      const roll=(typeof carpetRollKey==='function'?carpetRollKey(raw):String(raw).trim().toUpperCase());
      return roll?'roll:'+roll:'id:'+String(row.id??index);
    }
    if(datasetKey===INVDB)return 'inv:'+String(row.inventoryId||row.id||index);
    if(datasetKey===PMDB)return 'product:'+String(row.id||row.sku||index);
    return 'id:'+String(row.id??row.legacyKey??row.poNumber??row.po??index);
  }
  function stamp(row){
    if(!row||typeof row!=='object')return 0;
    for(const key of ['lastUpdatedAt','updatedAt','updated','completedAt','receivedAt','pickedUpAt','createdAt','created']){
      const raw=row[key];if(!raw)continue;
      const n=Date.parse(raw);if(Number.isFinite(n)&&n>0)return n;
    }
    return 0;
  }
  function comparable(row){
    if(!row||typeof row!=='object')return String(row);
    try{const ordered={};Object.keys(row).sort().forEach(k=>ordered[k]=row[k]);return JSON.stringify(ordered)}catch{return ''}
  }
  function mergeArrays(datasetKey,localRows,remoteRows){
    const local=Array.isArray(localRows)?localRows:[],remote=Array.isArray(remoteRows)?remoteRows:[];
    const map=new Map(),unresolved=[];let addedLocal=0,addedRemote=0,newerChosen=0;
    local.forEach((row,i)=>map.set(recordKey(datasetKey,row,i),row));
    const remoteKeys=new Set(remote.map((r,i)=>recordKey(datasetKey,r,i)));
    local.forEach((r,i)=>{if(!remoteKeys.has(recordKey(datasetKey,r,i)))addedLocal++});
    remote.forEach((row,i)=>{
      const key=recordKey(datasetKey,row,i),existing=map.get(key);
      if(!existing){map.set(key,row);addedRemote++;return}
      if(comparable(existing)===comparable(row))return;
      const a=stamp(existing),b=stamp(row);
      if(a&&b&&Math.abs(a-b)>1000){map.set(key,b>a?row:existing);newerChosen++;return}
      if(a&&!b){newerChosen++;return}
      if(b&&!a){map.set(key,row);newerChosen++;return}
      unresolved.push({key,local:existing,cloud:row});
    });
    return {rows:[...map.values()],unresolved,addedLocal,addedRemote,newerChosen};
  }
  const mergeable=()=>new Set([PMDB,INVDB,ODB,RCVDB,TASKDB,SPODB,LOGDB,CARPETDB,CUTDB,EVENTDB,TAGPRINTDB,RAMDB]);

  window.runluCloudRecordMerge=async function(keys=null){
    const session=await cloudEnsureSession();if(!session)throw new Error('Cloud sign-in required.');
    const rows=await cloudFetchRows(),byKey=new Map(rows.map(r=>[r.dataset_key,r]));
    const targets=(keys||cloudConflictKeys()).filter(k=>DATA_KEYS.includes(k)&&mergeable().has(k));
    const repaired=[],hard=[];
    for(const key of targets){
      const row=byKey.get(key);if(!row)continue;
      let local=[];try{local=JSON.parse(localStorage.getItem(key)||'[]')}catch{}
      const remote=await cloudHydratePayload(row.payload,session);
      if(!Array.isArray(local)||!Array.isArray(remote)){hard.push(key);continue}
      const merged=mergeArrays(key,local,remote);
      if(merged.unresolved.length){hard.push(key);continue}
      cloudApplying=true;
      try{localStorage.setItem(key,JSON.stringify(merged.rows))}finally{cloudApplying=false}
      await cloudPutDatasetInitial(key,merged.rows,session);
      const now=new Date().toISOString();
      localStorage.setItem(CLOUD_DATASET_SEEN_PREFIX+key,now);
      localStorage.setItem(CLOUD_DATASET_PUSH_PREFIX+key,now);
      clearCloudDirty(key);clearCloudConflict(key);
      repaired.push({key,count:merged.rows.length,addedLocal:merged.addedLocal,addedRemote:merged.addedRemote,newerChosen:merged.newerChosen});
    }
    if(repaired.length){
      localStorage.setItem(CLOUD_LAST_PUSH_KEY,new Date().toISOString());
      localStorage.setItem(CLOUD_LAST_PULL_KEY,new Date().toISOString());
      localStorage.removeItem(CLOUD_LAST_ERROR_KEY);
      try{renderCarpetInventory();renderInventory();renderProducts();renderDashboard();if(typeof renderCarpetLabels==='function')renderCarpetLabels()}catch(e){console.warn('V6.6.1 post-merge render:',e)}
    }
    return {repaired,hard};
  };

  cloudSmartSync=async function(silent=false){
    const rows=await cloudFetchRows();
    if(!rows.length)return {empty:true,uploaded:0,downloaded:0,conflicts:[],merged:0};
    const first=cloudPlanDatasetSync(rows),conflictSet=new Set(first.conflicts);let uploaded=0;
    for(const key of first.upload){const result=await flushCloudDirty([key]);uploaded+=result.uploaded;result.conflicts.forEach(k=>conflictSet.add(k))}
    let merged=0;
    if(conflictSet.size){
      const repair=await window.runluCloudRecordMerge([...conflictSet]);
      merged=repair.repaired.length;conflictSet.clear();repair.hard.forEach(k=>conflictSet.add(k));
    }
    const freshRows=await cloudFetchRows(),freshPlan=cloudPlanDatasetSync(freshRows);
    freshPlan.conflicts.forEach(k=>conflictSet.add(k));
    const dirtyNow=new Set(cloudDirtyKeys());
    const realConflicts=new Set([...conflictSet].filter(k=>dirtyNow.has(k)));
    const downloadKeys=freshPlan.download.filter(k=>!realConflicts.has(k)&&!dirtyNow.has(k));
    if(downloadKeys.length&&!protectedInputActive())await applyCloudRows(freshRows,true,downloadKeys,false);
    setCloudConflictKeys([...realConflicts]);
    rememberCloudDatasetVersions(freshRows,false,freshRows.filter(r=>r.device_id===cloudDeviceId()&&!cloudDirtyKeys().includes(r.dataset_key)).map(r=>r.dataset_key));
    return {empty:false,uploaded,downloaded:downloadKeys.length,conflicts:[...realConflicts],checked:freshRows.length,merged};
  };

  function count(value){return Array.isArray(value)?value.length:(value&&typeof value==='object'?Object.keys(value).length:(value==null?0:1))}
  window.showCloudSyncInspector=async function(){
    let overlay=document.getElementById('runluCloudInspector');
    if(!overlay){
      overlay=document.createElement('div');overlay.id='runluCloudInspector';overlay.className='modalOverlay';
      overlay.innerHTML='<div class="modalSheet"><div class="modalHead"><h3>Cloud Sync Inspector</h3><div class="meta">Device ↔ Cloud status. Different records merge safely; only ambiguous edits to the same record remain a conflict.</div></div><div id="runluCloudInspectorBody" class="productPickerList"><div class="notice">Checking Cloud…</div></div><div class="modalFoot"><button onclick="document.getElementById(\\'runluCloudInspector\\').classList.add(\\'hidden\\')">Close</button><button class="primary" onclick="cloudSyncNow().then(()=>showCloudSyncInspector())">Repair & Sync Safely</button></div></div>';
      overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.classList.add('hidden')});document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');const body=document.getElementById('runluCloudInspectorBody');body.innerHTML='<div class="notice">Checking Cloud…</div>';
    try{
      const rows=await cloudFetchRows(),byKey=new Map(rows.map(r=>[r.dataset_key,r])),dirty=new Set(cloudDirtyKeys()),conflicts=new Set(cloudConflictKeys());
      body.innerHTML=DATA_KEYS.map(key=>{
        let local=null;try{local=JSON.parse(localStorage.getItem(key)||'null')}catch{}
        const remote=byKey.get(key)?.payload,state=conflicts.has(key)?'Conflict':dirty.has(key)?'Pending':byKey.has(key)?'Synced':'Local only';
        const extra=key===CARPETDB?' · Carpet rolls':'';
        return `<div class="notice" style="margin-bottom:8px"><b>${esc(cloudDatasetLabel(key))}</b> · <b>${state}</b><br><span class="meta">This device: ${count(local)} · Cloud: ${count(remote)}${extra}</span></div>`
      }).join('');
    }catch(e){body.innerHTML=`<div class="notice reviewFlag"><b>Cloud check failed</b><br>${esc(e.message||String(e))}</div>`}
  };

  function bindCloudPill(){
    const pill=document.getElementById('headerCloudPill');if(!pill)return;
    pill.style.cursor='pointer';pill.title='Open Cloud Sync Inspector';pill.setAttribute('role','button');pill.setAttribute('tabindex','0');
    pill.onclick=()=>showCloudSyncInspector();pill.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showCloudSyncInspector()}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindCloudPill);else bindCloudPill();
})();
</script>
'''
if 'id="runlu-v661-sync-repair"' not in s:
    s=s.replace('</body>',js+'\n</body>',1)
p.write_text(s,encoding='utf-8')

vp=Path('version.json')
data=json.loads(vp.read_text(encoding='utf-8'))
data.update({
  'version':'6.6.1','build':'062','date':'2026-08-14','channel':'stable',
  'notes':'Record-Level Cloud Merge + Workstation Layout. Safely merges non-overlapping records inside conflicting datasets so a carpet roll added on one device (for example Roll 2347) is not hidden by a whole-dataset conflict on another device. True same-record conflicts remain protected. Cloud status is clickable and opens a dataset inspector. Desktop layout expands fluidly with adaptive grids and larger work areas while preserving the phone layout.'
})
vp.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
