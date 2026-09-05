/* RUNLU Warehouse OS — Universal V1 industry templates. */
(function(global){
'use strict';
const GENERAL=Object.freeze({
 id:'general',name:'General Warehouse',description:'Neutral defaults for small distribution and stock rooms.',
 categories:['Finished Goods','Raw Materials','Supplies','Parts','Packaging','Other'],
 units:['Each','Box','Carton','Case','Pallet','Roll','Bag','Pail','Tube','Foot','Yard','Meter'],
 warehouse:{lowStock:{enabled:true,defaultQuantity:30,carpetFeet:50},cutAllowance:{enabled:false,inches:0}},
 features:{inventory:true,receiving:true,transfer:true,cutPick:true,shipping:true,returns:true,purchaseOrders:true,historyAudit:true,barcodeQr:true,commandCenter:true,lowStockAlerts:true,warehouseMap:true,multiDeviceSync:true,carpetIndustryTemplate:false}
});
const FLOORING=Object.freeze({
 id:'flooring',name:'Flooring / Building Materials',description:'Flooring-ready defaults built from proven warehouse workflows. Cut allowance is company-configurable and has no industry-wide default.',
 categories:['Carpet','Hardwood','Laminate','Vinyl / LVP','Tile','Underlayment','Adhesive','Transition / Trim','Accessories','Other'],
 units:['Roll','Box','Carton','Pail','Bucket','Tube','Gallon','Each','Foot','Yard','Square Foot','Square Yard'],
 warehouse:{lowStock:{enabled:true,defaultQuantity:30,carpetFeet:50},cutAllowance:{enabled:false,inches:0}},
 features:{inventory:true,receiving:true,transfer:true,cutPick:true,shipping:true,returns:true,purchaseOrders:true,historyAudit:true,barcodeQr:true,commandCenter:true,lowStockAlerts:true,warehouseMap:true,multiDeviceSync:true,carpetIndustryTemplate:true}
});
const EMPTY=Object.freeze({id:'empty',name:'Empty / Custom',description:'Start with core modules and define categories, units and thresholds yourself.',categories:[],units:[],warehouse:{lowStock:{enabled:false,defaultQuantity:0,carpetFeet:0},cutAllowance:{enabled:false,inches:0}},features:{inventory:true,receiving:true,transfer:true,cutPick:true,shipping:true,returns:true,purchaseOrders:true,historyAudit:true,barcodeQr:true,commandCenter:true,lowStockAlerts:false,warehouseMap:true,multiDeviceSync:true,carpetIndustryTemplate:false}});
const TEMPLATES=Object.freeze({general:GENERAL,flooring:FLOORING,empty:EMPTY});
function get(id){return TEMPLATES[String(id||'general').toLowerCase()]||GENERAL}
function apply(id,overrides){const t=get(id),o=overrides||{};return {templateId:t.id,categories:[...(o.categories||t.categories)],units:[...(o.units||t.units)],warehouse:{...t.warehouse,...(o.warehouse||{}),lowStock:{...t.warehouse.lowStock,...(o.warehouse||{}).lowStock},cutAllowance:{...t.warehouse.cutAllowance,...(o.warehouse||{}).cutAllowance}},features:{...t.features,...(o.features||{})}}}
global.RUNLUUniversalTemplates=Object.freeze({TEMPLATES,get,apply});
})(typeof window!=='undefined'?window:globalThis);
