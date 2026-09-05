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
const workspace={schemaVersion:2,mode:'local-first',organizationId,warehouseId,template:'flooring',createdAt:'2026-09-05T12:00:00.000Z',cloud:{provider:null,status:'not-configured',managedBy:'customer'},config:U.createRuntimeConfig({company:{name:'Northstar Flooring Supply',websiteUrl:'',supportEmail:'',currency:'CAD',locale:'en',timezone:'America/Edmonton'},warehouse:{name:'Main Warehouse',code:'MAIN',lowStock:{enabled:true,defaultQuantity:30,carpetFeet:50},cutAllowance:{enabled:false,inches:0}},catalog:{templateId:'flooring',categories:T.get('flooring').categories,units:T.get('flooring').units},features:{...T.get('flooring').features,multiDeviceSync:false}})};
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
 {productId:'prd_carpet_aurora',type:'Carpet',name:'Aurora Texture 12 ft',gcNumber:'NS-CPT-101',unit:'Roll',rollWidthFeet:12},
 {productId:'prd_lvp_cascade',type:'Vinyl / LVP',name:'Cascade Oak LVP',gcNumber:'NS-LVP-220',unit:'Carton',coverageValue:23.8,coveragePerUnit:23.8},
 {productId:'prd_underlay_quiet',type:'Underlayment',name:'QuietStep Underlayment',gcNumber:'NS-UND-310',unit:'Roll',coverageValue:200},
 {productId:'prd_adhesive_pro',type:'Adhesive',name:'ProBond Flooring Adhesive',gcNumber:'NS-ADH-410',unit:'Pail'},
 {productId:'prd_trim_silver',type:'Transition / Trim',name:'Silver Reducer 94 in',gcNumber:'NS-TRM-510',unit:'Each'}
];
const inventory=[
 {invId:'inv_001',productId:'prd_lvp_cascade',quantity:68,location:'A01',po:'PO-DEMO-001',receiveDate:'2026-09-03',note:'Fictional App Store demo data'},
 {invId:'inv_002',productId:'prd_underlay_quiet',quantity:24,location:'A02',po:'PO-DEMO-001',receiveDate:'2026-09-03',note:''},
 {invId:'inv_003',productId:'prd_adhesive_pro',quantity:18,location:'B01',po:'PO-DEMO-002',receiveDate:'2026-09-04',note:''},
 {invId:'inv_004',productId:'prd_trim_silver',quantity:42,location:'B02',po:'PO-DEMO-002',receiveDate:'2026-09-04',note:''}
];
const carpets=[
 {id:'carpet_001',inventoryId:'carpet_001',productId:'prd_carpet_aurora',rollNo:'DEMO-R101',currentLength:126.5,receivedLength:126.5,po:'PO-DEMO-003',location:'C01',receivedDate:'2026-09-05',status:'ACTIVE',note:'Fictional demo roll'},
 {id:'carpet_002',inventoryId:'carpet_002',productId:'prd_carpet_aurora',rollNo:'DEMO-R102',currentLength:84.0,receivedLength:96.0,po:'PO-DEMO-003',location:'C02',receivedDate:'2026-09-05',status:'ACTIVE',note:'12 ft demo cut completed'}
];
const receiving=[
 {receiptId:'rcv_demo_001',date:'2026-09-03',productId:'prd_lvp_cascade',quantity:68,location:'A01',po:'PO-DEMO-001',supplier:'Demo Flooring Distribution',receiver:'Demo Staff'},
 {receiptId:'rcv_demo_002',date:'2026-09-04',productId:'prd_adhesive_pro',quantity:18,location:'B01',po:'PO-DEMO-002',supplier:'Demo Materials Supply',receiver:'Demo Staff'}
];
const orders=[
 {orderId:'ord_demo_001',customerName:'Sample Project A',customerPhone:'',salesRep:'Demo Sales',workOrder:'WO-DEMO-101',po:'PO-DEMO-C01',reference:'Showroom renovation',note:'Fictional screenshot order',lines:[{lineId:'line_1',productId:'prd_lvp_cascade',quantity:12,location:'A01'}],status:'OPEN',createdAt:'2026-09-05T14:00:00.000Z',updatedAt:'2026-09-05T14:00:00.000Z'}
];
const operations=[
 {id:'op_demo_001',type:'TRANSFER',productId:'prd_lvp_cascade',quantity:6,fromLocation:'A01',toLocation:'A02',status:'COMPLETED',createdAt:'2026-09-05T15:00:00.000Z',note:'Fictional demo transfer'},
 {id:'op_demo_002',type:'PICK',productId:'prd_underlay_quiet',quantity:2,fromLocation:'A02',toLocation:'STAGING',status:'IN PROGRESS',createdAt:'2026-09-05T15:30:00.000Z',note:'Fictional demo pick'}
];
put('runlu_product_master_v21',products);
put('runlu_product_inventory_v21',inventory);
put('runlu_carpet_inventory_v21',carpets);
put('runlu_receiving_v21',receiving);
put('runlu_customer_orders_v1',orders);
put('runlu_operations_log_v1',operations);
put('runlu_event_history_v1',[{id:'evt_demo_001',type:'RECEIVING',summary:'Received PO-DEMO-001 into A01 / A02',createdAt:'2026-09-03T16:00:00.000Z'},{id:'evt_demo_002',type:'TRANSFER',summary:'Moved 6 cartons A01 → A02',createdAt:'2026-09-05T15:00:00.000Z'}]);
localStorage.setItem('runlu-appstore-screenshot-marker',MARKER);
await A.authenticate('owner','2468');
location.replace('universal/preview.html');
})().catch(err=>{document.body.innerHTML='<pre style="white-space:pre-wrap;padding:24px;font-family:-apple-system">Screenshot fixture failed: '+String(err?.message||err)+'</pre>';console.error(err)});`;
await writeFile(resolve(out,'screenshot-fixture.js'),fixture,'utf8');

const index=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>RUNLU Warehouse OS — Screenshot Fixture</title></head><body><div style="font-family:-apple-system;padding:24px">Preparing fictional Flooring demo workspace…</div><script src="universal/runtime-config.js"></script><script src="universal/templates.js"></script><script src="universal/workspace.js"></script><script src="universal/local-auth.js"></script><script src="screenshot-fixture.js"></script></body></html>`;
await writeFile(resolve(out,'index.html'),index,'utf8');

const shippingIndex=await readFile(resolve(source,'index.html'),'utf8');
for(const marker of ['Northstar Flooring Supply','PO-DEMO-001','RUNLU_SCREENSHOT_FIXTURE_V1']){
  if(shippingIndex.includes(marker))throw new Error('Screenshot fixture leaked into shipping index: '+marker);
}
console.log('RUNLU screenshot-only bundle prepared:',out);
console.log('Demo sign-in: owner / 2468 (fictional screenshot workspace only)');
