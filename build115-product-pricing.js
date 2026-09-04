// RUNLU Warehouse OS V6.12.22 Build115 · Product Pricing Foundation.
// Adds backward-compatible product-level cost and selling-price fields to Product Master.
// Inventory quantities, locations, carpet rolls, orders and history remain unchanged.
(() => {
  'use strict';
  if (window.__RUNLU_BUILD115_PRODUCT_PRICING__) return;
  window.__RUNLU_BUILD115_PRODUCT_PRICING__ = true;

  const VERSION='6.12.22', BUILD='115';
  const PM='runlu_product_master_v21';
  const PRICE_FIELDS=[
    'supplier','purchaseUnit','sellUnit','conversionFactor',
    'standardCost','currentCost','retailPrice','priceSource','currency'
  ];
  const UNIT_OPTIONS=['SY','SF','LF','ROLL','BOX','CARTON','PAIL','BUCKET','TUBE','EACH','PIECE','PALLET','GAL','LITRE','OTHER'];

  const q=id=>document.getElementById(id);
  const text=v=>String(v??'').trim();
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const rows=()=>{const v=parse(localStorage.getItem(PM)||'null');return Array.isArray(v)?v:[]};
  const moneyInput=id=>{const raw=text(q(id)?.value);if(raw==='')return null;const n=Number(raw);return Number.isFinite(n)&&n>=0?Number(n.toFixed(4)):null};
  const factorInput=()=>{const raw=text(q('priceConversionFactor')?.value);if(raw==='')return 1;const n=Number(raw);return Number.isFinite(n)&&n>0?Number(n.toFixed(6)):1};
  const norm=v=>text(v).toLocaleLowerCase();
  const variantKey=x=>{
    const sku=norm(x?.sku||'');
    if(sku)return 'sku|'+sku;
    return ['variant',x?.brand,x?.name,x?.series,x?.color,x?.length,x?.width,x?.thickness].map(norm).join('|');
  };
  const formIdentity=()=>({
    name:text(q('name')?.value),brand:text(q('brand')?.value),series:text(q('series')?.value),
    color:text(q('color')?.value),sku:text(q('sku')?.value),length:text(q('length')?.value),
    width:text(q('width')?.value),thickness:text(q('thickness')?.value)
  });
  const unitOptions=selected=>'<option value="">— Select —</option>'+UNIT_OPTIONS.map(v=>`<option value="${v}"${v===selected?' selected':''}>${v}</option>`).join('');

  function findMasterLikeCore(value){
    const k=norm(value),products=rows();
    if(!k)return null;
    const bySku=products.find(p=>norm(p.sku)===k&&k);if(bySku)return bySku;
    const labels=products.filter(p=>norm([p.name,p.color,[p.length,p.width,p.thickness].filter(Boolean).join(' × '),p.sku?('SKU '+p.sku):''].filter(Boolean).join(' · '))===k);
    if(labels.length===1)return labels[0];
    const byName=products.filter(p=>norm(p.name)===k);
    return byName.length===1?byName[0]:null;
  }

  function ensureStyle(){
    if(q('build115PricingStyle'))return;
    const style=document.createElement('style');
    style.id='build115PricingStyle';
    style.textContent=`
      .build115PriceNote{border-left:4px solid #2d6cdf;background:#f3f7ff;padding:11px 12px;border-radius:11px;margin:8px 0 12px;color:#40516a;font-size:12px;line-height:1.45}
      .build115PriceGrid input[type=number]{font-variant-numeric:tabular-nums}
      .build115PriceStamp{grid-column:1/-1;color:var(--muted,#667085);font-size:12px;padding:2px 2px 0}
      .build115PriceValue{font-weight:900;color:#17345e}
    `;
    document.head.appendChild(style);
  }

  function ensurePricingUI(){
    const editor=q('editor');
    if(!editor||q('build115PricingSection'))return !!q('build115PricingSection');
    const titles=[...editor.querySelectorAll('.sectionTitle')];
    const before=titles.find(el=>/dimensions/i.test(text(el.textContent)))||titles[1]||null;
    if(!before)return false;
    ensureStyle();
    const wrap=document.createElement('div');
    wrap.id='build115PricingSection';
    wrap.innerHTML=`
      <div class="sectionTitle">Pricing &amp; Cost</div>
      <div class="build115PriceNote"><b>Product-level pricing foundation.</b><br>Costs and selling prices follow the Product Master record. Inventory quantities and locations stay separate. Currency: CAD.</div>
      <div class="formgrid build115PriceGrid">
        <div><label>Supplier</label><input id="priceSupplier" list="operation_supplier_memory" placeholder="Primary supplier"></div>
        <div><label>Price Source</label><input id="priceSource" placeholder="Supplier list / invoice / manual"></div>
        <div><label>Purchase Unit</label><select id="pricePurchaseUnit">${unitOptions('')}</select></div>
        <div><label>Sell Unit</label><select id="priceSellUnit">${unitOptions('')}</select></div>
        <div><label>Conversion Factor</label><input id="priceConversionFactor" type="number" inputmode="decimal" min="0.000001" step="0.000001" value="1"><div class="meta">Sell units represented by one purchase unit. Keep 1 when units match.</div></div>
        <div><label>Standard Cost (CAD)</label><input id="priceStandardCost" type="number" inputmode="decimal" min="0" step="0.0001" placeholder="0.00"></div>
        <div><label>Current / Last Supplier Cost (CAD)</label><input id="priceCurrentCost" type="number" inputmode="decimal" min="0" step="0.0001" placeholder="0.00"></div>
        <div><label>Standard Sell Price (CAD)</label><input id="priceRetailPrice" type="number" inputmode="decimal" min="0" step="0.0001" placeholder="0.00"></div>
        <div id="priceUpdatedAt" class="build115PriceStamp">Pricing not entered yet.</div>
      </div>`;
    before.insertAdjacentElement('beforebegin',wrap);
    const nameInput=q('name');
    if(nameInput&&!nameInput.dataset.build115PricingBound){
      nameInput.dataset.build115PricingBound='1';
      nameInput.addEventListener('change',()=>{const product=findMasterLikeCore(nameInput.value);if(product)setPricingUI(product)});
    }
    return true;
  }

  function pricingDraft(){
    return {
      supplier:text(q('priceSupplier')?.value),
      purchaseUnit:text(q('pricePurchaseUnit')?.value).toUpperCase(),
      sellUnit:text(q('priceSellUnit')?.value).toUpperCase(),
      conversionFactor:factorInput(),
      standardCost:moneyInput('priceStandardCost'),
      currentCost:moneyInput('priceCurrentCost'),
      retailPrice:moneyInput('priceRetailPrice'),
      priceSource:text(q('priceSource')?.value),
      currency:'CAD'
    };
  }

  function setPricingUI(product){
    ensurePricingUI();
    product=product||{};
    if(q('priceSupplier'))q('priceSupplier').value=text(product.supplier);
    if(q('pricePurchaseUnit'))q('pricePurchaseUnit').value=text(product.purchaseUnit).toUpperCase()||'';
    if(q('priceSellUnit'))q('priceSellUnit').value=text(product.sellUnit).toUpperCase()||'';
    if(q('priceConversionFactor'))q('priceConversionFactor').value=Number(product.conversionFactor)>0?String(product.conversionFactor):'1';
    if(q('priceStandardCost'))q('priceStandardCost').value=product.standardCost==null?'':String(product.standardCost);
    if(q('priceCurrentCost'))q('priceCurrentCost').value=product.currentCost==null?'':String(product.currentCost);
    if(q('priceRetailPrice'))q('priceRetailPrice').value=product.retailPrice==null?'':String(product.retailPrice);
    if(q('priceSource'))q('priceSource').value=text(product.priceSource);
    const stamp=q('priceUpdatedAt');
    if(stamp){
      const updated=text(product.priceUpdatedAt);
      stamp.innerHTML=updated?`Last pricing update: <span class="build115PriceValue">${updated}</span>`:'Pricing not entered yet.';
    }
  }

  function clearPricingUI(){
    setPricingUI({conversionFactor:1,currency:'CAD'});
  }

  function valuesEqual(a,b,key){
    if(['conversionFactor','standardCost','currentCost','retailPrice'].includes(key)){
      const av=a==null?'':Number(a),bv=b==null?'':Number(b);
      return av===bv;
    }
    return text(a)===text(b);
  }

  function mergePricing(product,draft){
    const changed=PRICE_FIELDS.some(key=>!valuesEqual(product?.[key],draft[key],key));
    Object.assign(product,draft);
    if(changed)product.priceUpdatedAt=new Date().toISOString();
    else if(!product.priceUpdatedAt&&PRICE_FIELDS.some(key=>draft[key]!=null&&text(draft[key])!==''))product.priceUpdatedAt=new Date().toISOString();
    return changed;
  }

  async function persistPricing(identity,draft){
    const products=rows();
    const key=variantKey(identity);
    const product=products.find(p=>variantKey(p)===key);
    if(!product)return false;
    const before=JSON.stringify(PRICE_FIELDS.map(k=>product[k]));
    mergePricing(product,draft);
    const after=JSON.stringify(PRICE_FIELDS.map(k=>product[k]));
    const changed=before!==after;
    if(!changed)return true;

    let saved=false;
    try{
      if(typeof window.save==='function')saved=window.save(PM,products)!==false;
      else{localStorage.setItem(PM,JSON.stringify(products));saved=true;}
    }catch(e){console.error('[Build115] local pricing save failed',e);return false;}
    if(!saved)return false;

    try{
      const enabled=localStorage.getItem('runlu_cloud_sync_enabled_v54')==='1';
      const session=typeof window.cloudSession==='function'?window.cloudSession():null;
      if(enabled&&session&&typeof window.flushAndVerifyDatasets==='function')await window.flushAndVerifyDatasets([PM]);
    }catch(e){
      console.warn('[Build115] pricing cloud verification failed',e);
      alert('Product was saved, but the new pricing fields have not been verified in Cloud yet. Keep this page open and reconnect Cloud before updating or reloading.\n\n'+(e?.message||e));
    }
    try{window.renderProducts?.();window.refreshMemory?.();}catch(_){}
    return true;
  }

  function installWrappers(){
    if(!ensurePricingUI())return false;
    let installedAny=false;

    const baseSave=window.saveProduct;
    if(typeof baseSave==='function'&&!baseSave.__build115PricingWrapped){
      const wrapped=async function(){
        const identity=formIdentity();
        const draft=pricingDraft();
        const result=await baseSave.apply(this,arguments);
        if(identity.name)await persistPricing(identity,draft);
        return result;
      };
      wrapped.__build115PricingWrapped=true;
      window.saveProduct=wrapped;
      installedAny=true;
    }

    const baseEdit=window.editItem;
    if(typeof baseEdit==='function'&&!baseEdit.__build115PricingWrapped){
      const wrapped=function(id){
        const product=rows().find(p=>String(p.id)===String(id))||{};
        const result=baseEdit.apply(this,arguments);
        setPricingUI(product);
        return result;
      };
      wrapped.__build115PricingWrapped=true;
      window.editItem=wrapped;
      installedAny=true;
    }

    const baseClear=window.clearForm;
    if(typeof baseClear==='function'&&!baseClear.__build115PricingWrapped){
      const wrapped=function(){const result=baseClear.apply(this,arguments);clearPricingUI();return result;};
      wrapped.__build115PricingWrapped=true;
      window.clearForm=wrapped;
      installedAny=true;
    }

    const baseAuto=window.autoFillMasterFromName;
    if(typeof baseAuto==='function'&&!baseAuto.__build115PricingWrapped){
      const wrapped=function(){
        const result=baseAuto.apply(this,arguments);
        const value=q('name')?.value||'';
        const product=(typeof window.findMasterByNameOrSku==='function'?window.findMasterByNameOrSku(value):null)||findMasterLikeCore(value);
        if(product)setPricingUI(product);
        return result;
      };
      wrapped.__build115PricingWrapped=true;
      window.autoFillMasterFromName=wrapped;
      installedAny=true;
    }

    document.documentElement.setAttribute('data-runlu-build115','product-pricing-foundation');
    return installedAny||(
      typeof window.saveProduct==='function'&&window.saveProduct.__build115PricingWrapped&&
      typeof window.editItem==='function'&&window.editItem.__build115PricingWrapped
    );
  }

  function boot(){
    ensurePricingUI();
    if(installWrappers())return;
    let tries=0;
    const timer=setInterval(()=>{
      ensurePricingUI();
      if(installWrappers()||++tries>=60)clearInterval(timer);
    },150);
  }

  window.runluProductPricing115={version:VERSION,build:BUILD,fields:[...PRICE_FIELDS,'priceUpdatedAt'],read:rows};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
