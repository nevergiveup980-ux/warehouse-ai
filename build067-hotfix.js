// RUNLU Warehouse AI V6.6.6 Build067 — Robust Cut Piece Return Recovery
(() => {
  if (window.__RUNLU_BUILD067__) return;
  window.__RUNLU_BUILD067__ = true;

  const VERSION='6.6.6', BUILD='067';
  const CARPET_KEY='runlu_carpet_inventory_v52';
  const CUT_KEY='runlu_cutting_log_v52';
  const LOG_KEY='runlu_operations_log_v52';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,'');
  const near=(a,b)=>Math.abs(Number(a||0)-Number(b||0))<0.011;
  const read=k=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch{return[]}};
  const write=(k,v)=>{try{if(typeof window.save==='function')return !!window.save(k,v);localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};

  function showVersion(){const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;document.documentElement.setAttribute('data-runlu-build',BUILD)}

  function parseFeet(v){
    if(v===null||v===undefined||v==='')return 0;
    if(typeof v==='number'&&Number.isFinite(v))return v;
    const s=text(v);
    const n=Number(s);if(Number.isFinite(n))return n;
    let m=s.match(/^(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)?\s*(?:"|in)?$/i);
    if(m)return Number(m[1])+(Number(m[2]||0)/12);
    m=s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\s*(\d+(?:\.\d+)?)?\s*(?:in|inch|inches|\")?$/i);
    if(m)return Number(m[1])+(Number(m[2]||0)/12);
    return 0;
  }
  function returnLength(r){
    const direct=[r.quantity,r.returnLength,r.returnedLength,r.length,r.actualLength,r.cutLength,r.totalCustomerLength];
    for(const v of direct){const f=parseFeet(v);if(f>0)return f}
    const feet=Number(r.feet??r.lengthFeet??r.returnFeet??0), inches=Number(r.inches??r.lengthInches??r.returnInches??0);
    if(Number.isFinite(feet)&&feet>0)return feet+(Number.isFinite(inches)?inches/12:0);
    return 0;
  }
  function isReturnType(v){const t=text(v).toLowerCase();return t.includes('cut piece return')||t.includes('installer return')}
  function relationFor(v){return text(v).toLowerCase().includes('installer')?'INSTALLER RETURN':'CUT PIECE RETURN'}
  function nextChild(base,rows){
    const b=text(base).toUpperCase();
    for(let i=0;i<26;i++){const c=b+String.fromCharCode(65+i);if(!rows.some(x=>norm(x.roll)===norm(c)))return c}
    for(let i=1;i<100;i++){const c=b+'-'+i;if(!rows.some(x=>norm(x.roll)===norm(c)))return c}
    return '';
  }
  function sourceFor(rows,roll){return rows.find(x=>norm(x.roll)===norm(roll))}
  function exactChild(rows,opKey,len){return rows.find(x=>String(x.sourceOperationId||'')===String(opKey)&&isReturnType(x.relationType)&&near(x.length,len))}
  function probableChild(rows,source,record,len){
    return rows.find(x=>norm(x.sourceRoll||x.parentRoll)===norm(source.roll)&&isReturnType(x.relationType)&&near(x.length,len)&&(!record.po||!x.po||text(x.po)===text(record.po))&&(!record.customer||!x.customer||text(x.customer).toLowerCase()===text(record.customer).toLowerCase()));
  }
  function operationKey(op,item,index){
    if(item?.sourceOperationId)return item.sourceOperationId;
    if(item?.id!=null)return `item:${op.id}:${item.id}`;
    return `op:${op.id}:item:${index}`;
  }
  function normalizeRecord(op,item,index){
    const r={...op,...(item||{})};
    r.type=(item&&item.type)||op.type||'';
    r.status=op.status||r.status;
    r.po=op.po||r.po||'';r.customer=op.customer||r.customer||'';r.operator=op.operator||r.operator||'';
    r.notes=(item&&item.notes)||op.notes||r.notes||'';
    r.__opKey=operationKey(op,item,index);
    r.__item=item||null;
    return r;
  }
  function shouldRecover(r){
    if(r.status!=='Completed'||!isReturnType(r.type)||!r.roll)return false;
    const len=returnLength(r);if(!(len>0))return false;
    // Historical builds may omit inventoryMode on completed carpet returns. A completed return with a source carpet roll
    // and a positive returned length is sufficient for integrity recovery.
    return true;
  }
  function recoverRecord(r,rows){
    const len=returnLength(r),source=sourceFor(rows,r.roll);if(!source)return {ok:false,reason:'source-not-found'};
    let child=exactChild(rows,r.__opKey,len)||probableChild(rows,source,r,len);
    const now=new Date().toISOString();let created=false;
    if(!child){
      const childRoll=nextChild(source.roll,rows);if(!childRoll)return {ok:false,reason:'no-child-id'};
      child={id:Date.now()+Math.random(),roll:childRoll,sourceRoll:source.roll,parentRoll:source.roll,manufacturerRoll:source.manufacturerRoll||'',lot:r.lot||source.lot||'',collection:r.collection||r.product||source.collection,colour:r.colour||source.colour,length:len,originalLength:len,width:r.width||source.width||'12',location:r.location||source.location||'Returned Cut Pieces',measure:'TM',status:len<3?'Used Up':'Active',tmRequired:false,po:r.po||'',customer:r.customer||'',supplier:r.supplier||source.supplier||'',returnReason:r.notes||'Cut piece returned',relationType:relationFor(r.type),sourceOperationId:r.__opKey,createdAt:now,updatedAt:now};
      rows.unshift(child);created=true;
    }else if(!child.sourceOperationId){child.sourceOperationId=r.__opKey;child.updatedAt=now}
    return {ok:true,child,created,len,source};
  }
  function linkCut(result,r){
    const cuts=read(CUT_KEY),m=cuts.find(c=>norm(c.roll)===norm(result.source.roll)&&!c.returnedToStock&&near(c.cutLength,result.len));
    if(!m)return false;
    m.returnedToStock=true;m.returnedChildRoll=result.child.roll;m.returnOperationId=r.__opKey;m.returnedAt=new Date().toISOString();m.returnReason=r.notes||'Cut piece returned';write(CUT_KEY,cuts);return true;
  }
  function repair(){
    const ops=read(LOG_KEY),rows=read(CARPET_KEY);let carpetChanged=false,opsChanged=false,count=0;
    for(const op of ops){
      const records=(Array.isArray(op.items)&&op.items.length)?op.items.map((it,i)=>normalizeRecord(op,it,i)):[normalizeRecord(op,null,0)];
      records.forEach(r=>{
        if(!shouldRecover(r))return;
        const result=recoverRecord(r,rows);if(!result.ok)return;
        if(result.created){carpetChanged=true;count++}
        const linked=linkCut(result,r);
        const msg=`${text(r.type).toLowerCase().includes('installer')?'Installer leftover':'Cut piece'} returned as ${result.child.roll}: ${typeof window.feetLabel==='function'?window.feetLabel(result.len):result.len+' ft'} · source ${result.source.roll} unchanged · measure TM · verified${linked?' · original cut linked':''}`;
        const target=r.__item||op;
        if(target.returnedChildRoll!==result.child.roll||!target.inventoryVerified||target.impactResult!==msg){Object.assign(target,{impactApplied:true,returnedChildRoll:result.child.roll,inventoryVerified:true,inventoryVerifiedAt:new Date().toISOString(),impactResult:msg,appliedAt:target.appliedAt||new Date().toISOString()});opsChanged=true}
      });
    }
    if(carpetChanged){write(CARPET_KEY,rows);const verify=read(CARPET_KEY);if(verify.length<rows.length)console.warn('[Build067] Carpet Inventory write-back verification count mismatch.');}
    if(opsChanged)write(LOG_KEY,ops);
    if(carpetChanged||opsChanged){try{window.renderCarpetInventory?.();window.renderOperations?.();window.renderDashboard?.()}catch{};console.info(`[Build067] repaired ${count} missing returned carpet child roll(s).`)}
  }
  function boot(){showVersion();[300,1200,3000,7000].forEach(ms=>setTimeout(repair,ms))}
  if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});
})();
