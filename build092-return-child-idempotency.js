// RUNLU Warehouse AI V6.12.6 Build092 — Return Child Idempotency Guard
(() => {
  if(window.__RUNLU_BUILD092_RETURN_GUARD__) return;
  window.__RUNLU_BUILD092_RETURN_GUARD__=true;

  const CARPET='runlu_carpet_inventory_v52';
  const OPS='runlu_operations_log_v52';
  const RETURN_TYPES=new Set(['CUT PIECE RETURN','INSTALLER RETURN']);

  const parse=(raw,fallback)=>{try{const v=JSON.parse(raw);return v??fallback}catch{return fallback}};
  const rows=k=>{const v=parse(localStorage.getItem(k)||'[]',[]);return Array.isArray(v)?v:[]};
  const text=v=>String(v??'').trim();
  const upper=v=>text(v).toUpperCase();

  function expectedLegacySourceId(ref,operations){
    const raw=text(ref);
    const m=raw.match(/^op:(\d+):item:(\d+)$/i);
    if(!m) return raw;
    const base=m[1],index=Number(m[2]);
    const op=operations.find(x=>String(x?.id)===base);
    // Build065 uses the top-level operation id when the return is a single-line
    // operation, and Number(op.id)+((index+1)/1000) for explicit multi-item rows.
    if(!op||!Array.isArray(op.items)||!op.items.length) return base;
    return String(Number(base)+((index+1)/1000));
  }

  function normalizeReturnChildSourceIds(){
    const carpets=rows(CARPET),operations=rows(OPS);
    let changed=0;
    for(const r of carpets){
      if(!RETURN_TYPES.has(upper(r?.relationType))) continue;
      const before=text(r?.sourceOperationId);
      if(!before) continue;
      const after=expectedLegacySourceId(before,operations);
      if(after&&after!==before){r.sourceOperationId=after;changed++;}
    }
    // This is a compatibility view for old Build065's in-memory repair check.
    // Do not queue a cloud write merely to change identity notation.
    if(changed) localStorage.setItem(CARPET,JSON.stringify(carpets));
    return changed;
  }

  function installRuntimeGuard(){
    const current=window.applySingleOperationImpact;
    if(typeof current!=='function'||current.__build092) return false;
    const original=current;
    const wrapped=function(r){
      if(r&&['Cut Piece Return','Installer Return'].includes(r.type)&&r.inventoryMode==='Stock'){
        normalizeReturnChildSourceIds();
      }
      return original.apply(this,arguments);
    };
    wrapped.__build092=true;
    wrapped.__original=original;
    window.applySingleOperationImpact=wrapped;
    return true;
  }

  function boot(){
    // Run before Build065's delayed recovery passes (500ms / 2200ms) so an existing
    // child using the newer op:<id>:item:<n> notation is recognized as the same child.
    normalizeReturnChildSourceIds();
    installRuntimeGuard();
    setTimeout(()=>{normalizeReturnChildSourceIds();installRuntimeGuard()},80);
    setTimeout(()=>{normalizeReturnChildSourceIds();installRuntimeGuard()},300);
    setTimeout(()=>{normalizeReturnChildSourceIds();installRuntimeGuard()},1200);
    document.documentElement.setAttribute('data-runlu-return-child-guard','092');
  }

  window.runluNormalizeReturnChildSourceIds092=normalizeReturnChildSourceIds;
  boot();
  window.addEventListener('pageshow',()=>setTimeout(()=>{normalizeReturnChildSourceIds();installRuntimeGuard()},40));
})();
