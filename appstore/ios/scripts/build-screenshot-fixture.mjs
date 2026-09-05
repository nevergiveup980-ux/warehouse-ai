import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const iosDir=resolve(here,'..');
const source=resolve(iosDir,'www');
const out=resolve(iosDir,'screenshot-www');

await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await cp(source,out,{recursive:true});

const fixture=`/* RUNLU App Store screenshot fixture — fictional data only. Never ship in www. */
(async function(){
'use strict';
const MARKER='RUNLU_SCREENSHOT_FIXTURE_V1';
const W=window.RUNLUWorkspace,A=window.RUNLULocalAuth,U=window.RUNLUUniversal,T=window.RUNLUUniversalTemplates;
if(!W||!A||!U||!T)throw new Error('Screenshot fixture runtime modules are missing.');
const organizationId='org_appstore_demo_northstar';
const warehouseId='wh_appstore_demo_main';
const now=new Date(),demoToday=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
const workspace={schemaVersion:2,mode:'local-first',organizationId,warehouseId,template:'flooring',createdAt:new Date().toISOString(),cloud:{provider:null,status:'not-configured',managedBy:'customer'},config:U.createRuntimeConfig({company:{name:'Northstar Flooring Supply',websiteUrl:'',supportEmail:'',currency:'CAD',locale:'en',timezone:'America/Edmonton'},warehouse:{name:'Main Warehouse',code:'MAIN',lowStock:{enabled:true,defaultQuantity:30,carpetFeet:50},cutAllowance:{enabled:false,inches:0}},catalog:{templateId:'flooring',categories:T.get('flooring').categories,units:T.get('flooring').units},features:{...T.get('flooring').features,multiDeviceSync:false}})};
localStorage.setItem(W.WORKSPACE_KEY,JSON.stringify(workspace));
if(!A.hasUsers()){
  await A.createOwner({displayName:'Demo Owner',username:'owner',email:'',pin:'2468'});
  await A.createUser({displayName:'Demo Administrator',username:'admin',email:'',pin:'2468',role:'admin'});
  await A.createUser({displayName:'Demo Manager',username:'manager',email:'',pin:'2468',role:'manager'});
  await A.createUser({displayName:'Demo Staff',username:'staff',email:'',pin:'2468',role:'member'});
  await A.createUser({displayName:'Demo Viewer',username:'viewer',email:'',pin:'2468',role:'viewer'});
}
const scoped=(key)=>'runlu-universal-v1::'+organizationId+'::'+warehouseId+'::'+key;
const put=(key,value)=>localStorage.setItem(scoped(key),JSON.stringify(value));
const products=[
 {id:'prd_carpet_aurora',productId:'prd_carpet_aurora',name:'Aurora Texture 12 ft',brand:'Northstar Demo',category:'Carpet Roll',coverageUnit:'Roll',sku:'NS-CPT-101',width:'12 ft'},
 {id:'prd_lvp_cascade',productId:'prd_lvp_cascade',name:'Cascade Oak LVP',brand:'Northstar Demo',category:'Vinyl Plank',coverageUnit:'Carton',sku:'NS-LVP-220',sfPerBox:23.8},
 {id:'prd_underlay_quiet',productId:'prd_underlay_quiet',name:'QuietStep Underlayment',brand:'Northstar Demo',category:'Underlay',coverageUnit:'Roll',sku:'NS-UND-310'},
 {id:'prd_adhesive_pro',productId:'prd_adhesive_pro',name:'ProBond Flooring Adhesive',brand:'Northstar Demo',category:'Adhesive',coverageUnit:'Pail',sku:'NS-ADH-410'},
 {id:'prd_trim_silver',productId:'prd_trim_silver',name:'Silver Reducer 94 in',brand:'Northstar Demo',category:'Trim',coverageUnit:'Piece',sku:'NS-TRM-510'}
];
const inventory=[
 {id:'inv_001',inventoryId:'INV-DEMO-001',masterId:'prd_lvp_cascade',quantity:68,unit:'Carton',locationType:'Rack',location:'A01',lotNumber:'LVP-A',poNumber:'PO-DEMO-001',inventoryType:'GENERAL',lifecycleStatus:'ACTIVE',warehouseScope:'warehouse',createdAt:new Date().toISOString(),updated:new Date().toLocaleString()},
 {id:'inv_002',inventoryId:'INV-DEMO-002',masterId:'prd_underlay_quiet',quantity:24,unit:'Roll',locationType:'Rack',location:'A02',lotNumber:'UND-A',poNumber:'PO-DEMO-001',inventoryType:'GENERAL',lifecycleStatus:'ACTIVE',warehouseScope:'warehouse',createdAt:new Date().toISOString(),updated:new Date().toLocaleString()},
 {id:'inv_003',inventoryId:'INV-DEMO-003',masterId:'prd_adhesive_pro',quantity:18,unit:'Pail',locationType:'Rack',location:'B01',lotNumber:'ADH-A',poNumber:'PO-DEMO-002',inventoryType:'GENERAL',lifecycleStatus:'ACTIVE',warehouseScope:'warehouse',createdAt:new Date().toISOString(),updated:new Date().toLocaleString()},
 {id:'inv_004',inventoryId:'INV-DEMO-004',masterId:'prd_trim_silver',quantity:42,unit:'Piece',locationType:'Rack',location:'B02',lotNumber:'TRM-A',poNumber:'PO-DEMO-002',inventoryType:'GENERAL',lifecycleStatus:'ACTIVE',warehouseScope:'warehouse',createdAt:new Date().toISOString(),updated:new Date().toLocaleString()}
];
const carpets=[
 {id:9001,roll:'DEMO-R101',manufacturerRoll:'MFG-101',collection:'Aurora Texture 12 ft',colour:'Sandstone',length:126.5,originalLength:126.5,width:'12',po:'PO-DEMO-003',location:'C01',receivedDate:demoToday,measure:'FULL',status:'Active',warehouseScope:'warehouse',note:'Fictional demo roll'},
 {id:9002,roll:'DEMO-R102',manufacturerRoll:'MFG-102',collection:'Aurora Texture 12 ft',colour:'Sandstone',length:84,originalLength:96,width:'12',po:'PO-DEMO-003',location:'C02',receivedDate:demoToday,measure:'CAL',status:'Active',warehouseScope:'warehouse',note:'Fictional demo roll'},
 {id:9003,roll:'DEMO-R103',manufacturerRoll:'MFG-103',collection:'Aurora Texture 12 ft',colour:'Pebble',length:36,originalLength:110,width:'12',po:'PO-DEMO-004',location:'C03',receivedDate:demoToday,measure:'CAL',status:'Active',warehouseScope:'warehouse',note:'Fictional low-stock demo roll'}
];
const receiving=[
 {id:7001,receiptId:'RCV-DEMO-001',date:demoToday,productId:'prd_lvp_cascade',quantity:68,unit:'Carton',location:'A01',po:'PO-DEMO-001',supplier:'Demo Flooring Distribution',receiver:'Demo Staff',status:'Put Away'},
 {id:7002,receiptId:'RCV-DEMO-002',date:demoToday,productId:'prd_adhesive_pro',quantity:18,unit:'Pail',location:'B01',po:'PO-DEMO-002',supplier:'Demo Materials Supply',receiver:'Demo Staff',status:'Completed'}
];
const orders=[
 {id:6001,orderId:'ORD-DEMO-001',customer:'Sample Project A',customerName:'Sample Project A',sales:'Demo Sales',poNumber:'PO-DEMO-C01',po:'PO-DEMO-C01',status:'Open',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
];
const operations=[
 {id:5001,date:demoToday,time:'08:10',type:'Inventory Transfer',status:'Waiting',po:'PO-DEMO-T01',customer:'Sample Project A',product:'Cascade Oak LVP',quantity:6,unit:'Carton',location:'A01',toLocation:'A02',source:'Manual',operator:'Demo Staff',inventoryMode:'Stock',impactApplied:false},
 {id:5002,date:demoToday,time:'09:25',type:'Order Picking & Preparation',status:'In Progress',po:'PO-DEMO-C01',customer:'Sample Project A',product:'QuietStep Underlayment',quantity:2,unit:'Roll',location:'A02',toLocation:'Staging',source:'Manual',operator:'Demo Staff',inventoryMode:'Stock',impactApplied:false},
 {id:5003,date:demoToday,time:'10:40',type:'Supplier Pickup / Receiving / Put-away',status:'Completed',po:'PO-DEMO-002',supplier:'Demo Materials Supply',product:'ProBond Flooring Adhesive',quantity:18,unit:'Pail',location:'B01',source:'Manual',operator:'Demo Staff',inventoryMode:'Record Only',impactApplied:true}
];
const locations=[
 {code:'A01',capacity:120,notes:'LVP cartons'},
 {code:'A02',capacity:60,notes:'Underlayment'},
 {code:'B01',capacity:40,notes:'Adhesive'},
 {code:'B02',capacity:80,notes:'Trim'},
 {code:'C01',capacity:6,notes:'Carpet rack'},
 {code:'C02',capacity:6,notes:'Carpet rack'},
 {code:'C03',capacity:6,notes:'Carpet rack'}
];
put('runlu_product_master_v21',products);
put('runlu_inventory_records_v21',inventory);
put('runlu_carpet_inventory_v52',carpets);
put('runlu_receiving_v50',receiving);
put('runlu_orders_v20',orders);
put('runlu_operations_log_v52',operations);
put('runlu_location_master_v5518',locations);
put('runlu_event_history_v52',[{id:'evt_demo_001',type:'RECEIVING',summary:'Received PO-DEMO-001 into A01 / A02',createdAt:new Date().toISOString()},{id:'evt_demo_002',type:'TRANSFER',summary:'Prepared 6 cartons A01 → A02',createdAt:new Date().toISOString()}]);
localStorage.setItem('runlu-appstore-screenshot-marker',MARKER);
await A.authenticate('owner','2468');
location.replace('universal/preview.html');
})().catch(err=>{document.body.innerHTML='<pre style="white-space:pre-wrap;padding:24px;font-family:-apple-system">Screenshot fixture failed: '+String(err?.message||err)+'</pre>';console.error(err)});`;
await writeFile(resolve(out,'screenshot-fixture.js'),fixture,'utf8');

const index=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>RUNLU Warehouse OS — Screenshot Fixture</title></head><body><div style="font-family:-apple-system;padding:24px">Preparing fictional Flooring demo workspace…</div><script src="universal/runtime-config.js"></script><script src="universal/templates.js"></script><script src="universal/workspace.js"></script><script src="universal/local-auth.js"></script><script src="screenshot-fixture.js"></script></body></html>`;
await writeFile(resolve(out,'index.html'),index,'utf8');

const shippingIndex=await readFile(resolve(source,'index.html'),'utf8');
for(const marker of ['Northstar Flooring Supply','PO-DEMO-001','RUNLU_SCREENSHOT_FIXTURE_V1'])if(shippingIndex.includes(marker))throw new Error('Screenshot fixture leaked into shipping index: '+marker);
console.log('RUNLU screenshot-only bundle prepared:',out);
console.log('Demo sign-in: owner / 2468 (fictional screenshot workspace only)');
