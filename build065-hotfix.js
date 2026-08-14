// RUNLU Warehouse AI V6.6.4 Build065 — Verified Cut Piece Return
(() => {
  if (window.__RUNLU_BUILD065__) return;
  window.__RUNLU_BUILD065__ = true;

  const VERSION='6.6.4', BUILD='065';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toUpperCase().replace(/\s+/g,'');
  const near=(a,b)=>Math.abs(Number(a||0)-Number(b||0))<0.011;

  function showVersion(){
    const hv=document.getElementById('headerVersion');
    if(hv)hv.textContent='V'+VERSION;
    document.documentElement.setAttribute('data-runlu-build',BUILD);
  }

  function readCarpet(){
    try{return typeof window.carpetRecords==='function'?window.carpetRecords():[]}catch{return[]}
  }
  function readCuts(){
    try{return typeof window.cuttingRecords==='function'?window.cuttingRecords():[]}catch{return[]}
  }
  function relationFor(type){return type==='Installer Return'?'INSTALLER RETURN':'CUT PIECE RETURN'}

  function existingChildFor(r,rows=readCarpet()){
    const rel=relationFor(r.type);
    return rows.find(x=>String(x.sourceOperationId||'')===String(r.id)&&String(x.relationType||'').toUpperCase()===rel);
  }

  function linkCutIfPossible(r,source,childRoll,now){
    const cuts=readCuts();
    const matching=cuts.find(c=>norm(c.roll)===norm(source.roll)&&!c.returnedToStock&&near(c.cutLength,r.quantity));
    if(matching){
      matching.returnedToStock=true;
      matching.returnedChildRoll=childRoll;
      matching.returnOperationId=r.id;
      matching.returnedAt=now;
      matching.returnReason=r.notes||(r.type==='Installer Return'?'Installer leftover returned':'Order size changed');
      if(typeof window.save==='function'&&!window.save(window.CUTDB,cuts))throw new Error('Cutting-history return link could not be saved.');
    }
    return !!matching;
  }

  function verifiedReturnImpact(r,{repair=false}={}){
    if(r.inventoryMode!=='Stock')return null;
    if(!['Cut Piece Return','Installer Return'].includes(r.type))return null;
    try{
      const rows=readCarpet();
      const source=typeof window.findCarpetRoll==='function'?window.findCarpetRoll(rows,r.roll):rows.find(x=>norm(x.roll)===norm(r.roll));
      if(!source)throw new Error('Original source roll not found in Carpet Inventory.');
      if(!(Number(r.quantity)>0))throw new Error('Returned piece length must be greater than zero.');

      let child=existingChildFor(r,rows);
      let created=false;
      const now=new Date().toISOString();
      if(!child){
        const childRoll=typeof window.nextCarpetChildRoll==='function'?window.nextCarpetChildRoll(source.roll,rows):'';
        if(!childRoll)throw new Error('Could not allocate the next child roll number.');
        const installerReturn=r.type==='Installer Return';
        child={
          id:Date.now()+Math.random(),roll:childRoll,sourceRoll:source.roll,parentRoll:source.roll,
          manufacturerRoll:source.manufacturerRoll||'',lot:r.lot||source.lot||'',
          collection:r.collection||r.product||source.collection,colour:r.colour||source.colour,
          length:Number(r.quantity),originalLength:Number(r.quantity),width:r.width||source.width||'12',
          location:r.location||source.location||(installerReturn?'Installer Returns':'Returned Cut Pieces'),
          measure:'TM',status:Number(r.quantity)<3?'Used Up':'Active',tmRequired:false,
          po:r.po||'',customer:r.customer||'',supplier:r.supplier||source.supplier||'',
          returnReason:r.notes||(installerReturn?'Installer leftover returned':'Order size changed'),
          relationType:relationFor(r.type),sourceOperationId:r.id,createdAt:now,updatedAt:now
        };
        rows.unshift(child);
        if(typeof window.save!=='function'||!window.save(window.CARPETDB,rows))throw new Error(`Returned child roll ${childRoll} could not be saved to Carpet Inventory.`);
        created=true;
      }

      // Hard post-save verification. A green Completed/linked state is forbidden until the child exists on read-back.
      const verifyRows=readCarpet();
      const verified=verifyRows.find(x=>String(x.sourceOperationId||'')===String(r.id)&&norm(x.roll)===norm(child.roll)&&near(x.length,r.quantity));
      if(!verified)throw new Error(`Returned child roll ${child.roll} failed the post-save Carpet Inventory verification.`);

      const cutLinked=linkCutIfPossible(r,source,verified.roll,now);
      const result=`${r.type==='Installer Return'?'Installer leftover':'Cut piece'} returned as ${verified.roll}: ${window.feetLabel?window.feetLabel(r.quantity):r.quantity+' ft'} · source ${source.roll} unchanged at ${window.feetLabel?window.feetLabel(source.length):source.length+' ft'} · measure TM${cutLinked?' · original cut linked':' · no matching cut log found'}${repair?' · recovered from completed operation':''}`;
      r.impactApplied=true;
      r.impactResult=result;
      r.appliedAt=r.appliedAt||now;
      r.returnedChildRoll=verified.roll;
      r.inventoryVerified=true;
      r.inventoryVerifiedAt=now;
      return {ok:true,result,child:verified,created};
    }catch(e){
      if(!repair)alert('Linked update stopped: '+e.message);
      else console.warn('[Build065] return recovery stopped:',e.message);
      return {ok:false,error:e};
    }
  }

  function installImpactGuard(){
    if(typeof window.applySingleOperationImpact!=='function'||typeof window.carpetRecords!=='function'||typeof window.save!=='function'||typeof window.CARPETDB==='undefined')return false;
    if(window.applySingleOperationImpact.__build065)return true;
    const original=window.applySingleOperationImpact;
    const wrapped=function(r){
      if(!r||!['Cut Piece Return','Installer Return'].includes(r.type)||r.inventoryMode!=='Stock')return original(r);
      if(r.impactApplied&&r.status==='Completed'){
        const existing=existingChildFor(r);
        if(existing&&near(existing.length,r.quantity))return true;
        // Old builds could say Completed/linked even when the child never survived. Repair instead of trusting the flag.
        r.impactApplied=false;
      }
      const out=verifiedReturnImpact(r);
      return !!out?.ok;
    };
    wrapped.__build065=true;
    wrapped.__original=original;
    window.applySingleOperationImpact=wrapped;
    return true;
  }

  function childOperationFromItem(op,item,index){
    return {...op,...item,id:Number(op.id)+((index+1)/1000),items:[],status:'Completed',inventoryMode:item.inventoryMode||op.inventoryMode,type:item.type||op.type,po:op.po,customer:op.customer,operator:op.operator,notes:item.notes||op.notes};
  }

  function repairCompletedReturns(){
    if(typeof window.operationRecords!=='function'||typeof window.save!=='function'||typeof window.LOGDB==='undefined')return;
    const ops=window.operationRecords();
    let changed=false,repaired=0;
    for(const op of ops){
      if(op.status!=='Completed')continue;
      if(Array.isArray(op.items)&&op.items.length){
        op.items.forEach((item,index)=>{
          const type=item.type||op.type;
          if(!['Cut Piece Return','Installer Return'].includes(type)||!item.impactApplied)return;
          const childR=childOperationFromItem(op,item,index);
          if(existingChildFor(childR))return;
          const out=verifiedReturnImpact(childR,{repair:true});
          if(out?.ok){Object.assign(item,{impactApplied:true,impactResult:out.result,appliedAt:childR.appliedAt,returnedChildRoll:out.child.roll,inventoryVerified:true,inventoryVerifiedAt:childR.inventoryVerifiedAt});changed=true;repaired++;}
        });
      }else if(['Cut Piece Return','Installer Return'].includes(op.type)&&op.impactApplied&&op.inventoryMode==='Stock'){
        if(existingChildFor(op))continue;
        const out=verifiedReturnImpact(op,{repair:true});
        if(out?.ok){changed=true;repaired++;}
      }
    }
    if(changed){
      window.save(window.LOGDB,ops);
      try{if(typeof window.renderOperations==='function')window.renderOperations();if(typeof window.renderCarpetInventory==='function')window.renderCarpetInventory();}catch{}
      console.info(`[Build065] Recovered ${repaired} completed carpet return(s) whose child inventory was missing.`);
    }
  }

  function install(){
    showVersion();
    const ok=installImpactGuard();
    if(ok){setTimeout(repairCompletedReturns,500);setTimeout(repairCompletedReturns,2200)}
    return ok;
  }

  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>240)clearInterval(timer)},25);
  if(document.readyState==='complete')install();
  else window.addEventListener('load',install,{once:true});
})();
