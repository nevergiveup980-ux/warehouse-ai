import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../screenshot-www');

const controller=`/* RUNLU App Store screenshot scene controller — screenshot bundle only. */
(function(){
'use strict';
const START='runlu-appstore-screenshot-scene-start-v1';
const SCENE='runlu-appstore-screenshot-scene-v1';
const path=location.pathname.toLowerCase();
let start=Number(localStorage.getItem(START)||0);
if(!start||Date.now()-start>180000){start=Date.now();localStorage.setItem(START,String(start));}
const elapsed=()=>Date.now()-start;
function mark(name){localStorage.setItem(SCENE,name);document.documentElement.setAttribute('data-runlu-screenshot-scene',name);}
function inner(){const f=document.getElementById('app');return f&&f.contentWindow;}
function applyPreviewScene(name){
 const w=inner();if(!w||typeof w.showPage!=='function')return false;
 if(name==='dashboard'){w.showPage('home');return true;}
 if(name==='inventory'){w.showPage('inventory');return true;}
 if(name==='carpet'){w.showPage('carpetInventory');return true;}
 if(name==='receiving'){w.showPage('receivingHub');return true;}
 if(name==='transfer'){
   if(typeof w.startCommandOperation==='function'){w.startCommandOperation('Inventory Transfer');return true;}
   w.showPage('operations');return true;
 }
 if(name==='scan'){w.showPage('scan');return true;}
 return false;
}
function previewSceneFor(ms){
 if(ms<20000)return 'dashboard';
 if(ms<30000)return 'inventory';
 if(ms<40000)return 'carpet';
 if(ms<50000)return 'receiving';
 if(ms<60000)return 'transfer';
 if(ms<70000)return 'scan';
 return 'users';
}
if(path.endsWith('/preview.html')){
 let active='';
 const tick=()=>{
   const wanted=previewSceneFor(elapsed());
   if(wanted==='users'){
     mark('users');location.replace('users.html');return;
   }
   if(wanted!==active&&applyPreviewScene(wanted)){active=wanted;mark(wanted);}
 };
 setTimeout(tick,700);setInterval(tick,300);
 return;
}
if(path.endsWith('/users.html')){
 mark('users');
 const go=()=>{if(elapsed()>=80000)location.replace('backup.html');};
 setTimeout(go,300);setInterval(go,300);
 return;
}
if(path.endsWith('/backup.html')){mark('backup');return;}
})();`;
await writeFile(resolve(root,'screenshot-scenes.js'),controller,'utf8');

async function inject(rel,src){
  const p=resolve(root,rel);let html=await readFile(p,'utf8');
  if(!html.includes(src))html=html.replace('</body>',`<script src="${src}"></script></body>`);
  await writeFile(p,html,'utf8');
}
await inject('universal/preview.html','../screenshot-scenes.js');
await inject('universal/users.html','../screenshot-scenes.js');
await inject('universal/backup.html','../screenshot-scenes.js');

// This controller is an App Store capture aid only. The real shipping bundle must
// remain completely free of the file and its scene keys.
const shipping=resolve(here,'../www');
for(const rel of ['screenshot-scenes.js','universal/preview.html','universal/users.html','universal/backup.html']){
  if(rel==='screenshot-scenes.js')continue;
  const text=await readFile(resolve(shipping,rel),'utf8');
  if(text.includes('screenshot-scenes.js')||text.includes('runlu-appstore-screenshot-scene'))throw new Error(`Screenshot scene controller leaked into shipping ${rel}`);
}
console.log('RUNLU screenshot scenes prepared: dashboard, inventory, carpet, receiving, transfer, scan, users, backup.');
