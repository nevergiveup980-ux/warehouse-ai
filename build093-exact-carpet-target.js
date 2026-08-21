// RUNLU Warehouse AI V6.12.7 Build093 — Exact Carpet Target Lock
(() => {
  if(window.__RUNLU_BUILD093_EXACT_CARPET_TARGET__) return;
  window.__RUNLU_BUILD093_EXACT_CARPET_TARGET__=true;

  const VERSION='6.12.7', BUILD='093';
  const text=v=>String(v??'').trim();
  const key=v=>{
    try{return typeof window.carpetRollKey==='function'?window.carpetRollKey(v):text(v).toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^RC(?=\d)/,'').replace(/^0+(?=\d)/,'')}
    catch{return text(v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
  };

  // Destructive carpet work must never resolve through sourceRoll, parentRoll,
  // manufacturerRoll or any other alias. Only exact record id + exact operational
  // Roll # is acceptable when an id is present; otherwise exact Roll # only.
  function exactCarpetTarget(records,carpetRecordId,rollValue){
    const rows=Array.isArray(records)?records:[];
    const rollKey=key(rollValue);
    const hasId=carpetRecordId!==undefined&&carpetRecordId!==null&&text(carpetRecordId)!=='';
    if(hasId){
      const byId=rows.find(r=>String(r?.id)===String(carpetRecordId));
      if(!byId) return null;
      if(rollKey&&key(byId.roll)!==rollKey) return null;
      return byId;
    }
    if(!rollKey) return null;
    return rows.find(r=>key(r?.roll)===rollKey)||null;
  }

  window.findCarpetRollForOperation=exactCarpetTarget;
  window.runluExactCarpetTarget093=exactCarpetTarget;

  function currentCutTarget(){
    try{
      const rollEl=document.getElementById('operationRoll');
      const picker=document.getElementById('operationCarpetRollPicker');
      const id=rollEl?.dataset?.carpetRecordId||picker?.value||'';
      const roll=rollEl?.value||'';
      return {id,roll,target:exactCarpetTarget(window.carpetRecords?.()||[],id,roll)};
    }catch{return {id:'',roll:'',target:null}}
  }

  function installPreviewGuard(){
    const current=window.updateOperationCalculationPreview;
    if(typeof current!=='function'||current.__build093) return false;
    const original=current;
    const wrapped=function(){
      const type=document.getElementById('operationLineType')?.value||document.getElementById('operationType')?.value;
      const mode=document.getElementById('operationLineInventoryMode')?.value||document.getElementById('operationInventoryMode')?.value;
      if(type==='Carpet Cutting'&&mode==='Stock'){
        const info=currentCutTarget();
        if(text(info.roll)&&!info.target){
          const el=document.getElementById('operationCalculationPreview');
          if(el){
            el.innerHTML='<b>CUT BLOCKED — exact carpet target mismatch.</b> Re-open this roll from Carpet Inventory. The system will not guess from Source Roll, Parent Roll or Manufacturer Roll.';
            el.style.display='block';
            el.style.background='#fff0f1';
            el.style.color='#8b1e2d';
          }
          return;
        }
      }
      const out=original.apply(this,arguments);
      const el=document.getElementById('operationCalculationPreview');
      if(el){el.style.background='';el.style.color=''}
      return out;
    };
    wrapped.__build093=true;wrapped.__original=original;
    window.updateOperationCalculationPreview=wrapped;
    return true;
  }

  function installItemGuard(){
    const current=window.operationItemFromForm;
    if(typeof current!=='function'||current.__build093) return false;
    const original=current;
    const wrapped=function(){
      const item=original.apply(this,arguments);
      if(!item||item.type!=='Carpet Cutting'||item.inventoryMode!=='Stock') return item;
      const target=exactCarpetTarget(window.carpetRecords?.()||[],item.carpetRecordId,item.roll);
      if(target){
        item.carpetRecordId=String(target.id);
        item.roll=target.roll;
        item.exactCarpetTargetLocked=true;
      }else item.exactCarpetTargetLocked=false;
      return item;
    };
    wrapped.__build093=true;wrapped.__original=original;
    window.operationItemFromForm=wrapped;
    return true;
  }

  function installImpactGuard(){
    const current=window.applySingleOperationImpact;
    if(typeof current!=='function'||current.__build093) return false;
    const original=current;
    const wrapped=function(r){
      if(r&&r.type==='Carpet Cutting'&&r.inventoryMode==='Stock'){
        const target=exactCarpetTarget(window.carpetRecords?.()||[],r.carpetRecordId,r.roll);
        if(!target){
          alert('CUT BLOCKED: the selected Carpet Roll identity does not match the inventory record. Re-open the exact roll from Carpet Inventory and try again. No carpet was deducted.');
          return false;
        }
        if(key(target.roll)!==key(r.roll)){
          alert('CUT BLOCKED: Roll # and inventory record do not match. No carpet was deducted.');
          return false;
        }
        r.carpetRecordId=target.id;
        r.roll=target.roll;
        r.exactCarpetTargetLocked=true;
      }
      return original.apply(this,arguments);
    };
    wrapped.__build093=true;wrapped.__original=original;
    window.applySingleOperationImpact=wrapped;
    return true;
  }

  function install(){
    window.findCarpetRollForOperation=exactCarpetTarget;
    installPreviewGuard();installItemGuard();installImpactGuard();
    document.documentElement.setAttribute('data-runlu-exact-carpet-target',BUILD);
    return true;
  }

  install();
  let tries=0;const timer=setInterval(()=>{install();if(++tries>80)clearInterval(timer)},100);
  window.addEventListener('pageshow',()=>setTimeout(install,30));
})();
