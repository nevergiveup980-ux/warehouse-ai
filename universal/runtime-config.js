/*
 * RUNLU Warehouse OS — Universal V1 runtime configuration
 * DEVELOPMENT ONLY. Not loaded by the production application.
 */
(function (global) {
  'use strict';

  const LEGACY_DATASETS = Object.freeze({
    generalInventory: 'runlu_inventory_v20',
    productMaster: 'runlu_product_master_v21',
    productInventory: 'runlu_inventory_records_v21',
    customerOrders: 'runlu_orders_v20',
    receiving: 'runlu_receiving_v50',
    tasks: 'runlu_tasks_v50',
    specialOrders: 'runlu_special_orders_v51',
    operationsLog: 'runlu_operations_log_v52',
    carpetInventory: 'runlu_carpet_inventory_v52',
    cuttingLog: 'runlu_cutting_log_v52',
    eventHistory: 'runlu_event_history_v52',
    tagPrintHistory: 'runlu_tag_print_history_v53',
    remnants: 'runlu_remnants_v55',
    settings: 'runlu_settings_v20',
    cycleCounts: 'runlu_count_sessions_v30',
    scanDictionary: 'runlu_scan_learning_dictionary',
    scanTemplates: 'runlu_scan_supplier_templates_v1'
  });

  const DEFAULT_PRODUCT = Object.freeze({
    productName: 'RUNLU Warehouse OS', productCode: 'warehouse-os', channel: 'universal-development', trialDays: 14,
    pricing: Object.freeze({monthlyUsd: 29.99, annualUsd: 299.99, includedUsers: 5, includedWarehouses: 1})
  });
  const DEFAULT_COMPANY = Object.freeze({name:'',logoUrl:'',websiteUrl:'',supportEmail:'',currency:'USD',locale:'en',timezone:'UTC'});
  const DEFAULT_WAREHOUSE = Object.freeze({name:'Main Warehouse',code:'MAIN',tagBaseUrl:'',lowStock:Object.freeze({enabled:true,defaultQuantity:30,carpetFeet:50}),cutAllowance:Object.freeze({enabled:false,inches:0})});
  const DEFAULT_CATALOG = Object.freeze({templateId:'general',categories:Object.freeze([]),units:Object.freeze([])});
  const FEATURE_DEFAULTS = Object.freeze({inventory:true,receiving:true,transfer:true,cutPick:true,shipping:true,returns:true,purchaseOrders:true,historyAudit:true,barcodeQr:true,commandCenter:true,lowStockAlerts:true,warehouseMap:true,multiDeviceSync:true,carpetIndustryTemplate:false});

  function cleanId(value,label){const v=String(value||'').trim();if(!v)throw new Error(label+' is required.');return v}
  function tenantContext(input){const value=input||{};return Object.freeze({organizationId:cleanId(value.organizationId,'organizationId'),warehouseId:cleanId(value.warehouseId,'warehouseId'),userId:cleanId(value.userId,'userId'),role:String(value.role||'member').trim().toLowerCase()})}
  function scopedStorageKey(context,legacyKey){const ctx=tenantContext(context),key=cleanId(legacyKey,'legacyKey');return ['runlu-universal-v1',ctx.organizationId,ctx.warehouseId,key].join('::')}
  function tenantDatasetIdentity(context,legacyKey){const ctx=tenantContext(context);return Object.freeze({organization_id:ctx.organizationId,warehouse_id:ctx.warehouseId,dataset_key:cleanId(legacyKey,'legacyKey')})}
  function resolveTagBaseUrl(company,warehouse){const explicit=String((warehouse||{}).tagBaseUrl||'').trim();if(explicit)return explicit.replace(/\/+$/,'')+'/';const website=String((company||{}).websiteUrl||'').trim();if(!website)return '';try{const u=new URL(website);return u.origin.replace(/\/+$/,'')+'/'}catch(_){return ''}}
  function createRuntimeConfig(overrides){const o=overrides||{},company=Object.assign({},DEFAULT_COMPANY,o.company||{}),warehouse=Object.assign({},DEFAULT_WAREHOUSE,o.warehouse||{}),catalog=Object.assign({},DEFAULT_CATALOG,o.catalog||{});warehouse.lowStock=Object.assign({},DEFAULT_WAREHOUSE.lowStock,(o.warehouse||{}).lowStock||{});warehouse.cutAllowance=Object.assign({},DEFAULT_WAREHOUSE.cutAllowance,(o.warehouse||{}).cutAllowance||{});catalog.categories=[...((o.catalog||{}).categories||DEFAULT_CATALOG.categories)];catalog.units=[...((o.catalog||{}).units||DEFAULT_CATALOG.units)];return Object.freeze({product:Object.freeze(Object.assign({},DEFAULT_PRODUCT,o.product||{})),company:Object.freeze(company),warehouse:Object.freeze(warehouse),catalog:Object.freeze(catalog),features:Object.freeze(Object.assign({},FEATURE_DEFAULTS,o.features||{})),legacyDatasets:LEGACY_DATASETS,tagBaseUrl:resolveTagBaseUrl(company,warehouse)})}

  global.RUNLUUniversal=Object.freeze({version:'0.2.0',LEGACY_DATASETS,DEFAULT_PRODUCT,DEFAULT_COMPANY,DEFAULT_WAREHOUSE,DEFAULT_CATALOG,FEATURE_DEFAULTS,tenantContext,scopedStorageKey,tenantDatasetIdentity,resolveTagBaseUrl,createRuntimeConfig});
})(typeof window!=='undefined'?window:globalThis);
