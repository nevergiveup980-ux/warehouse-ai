import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../screenshot-www');

const controller=`/* RUNLU App Store screenshot scene controller — screenshot bundle only. */
(function(){
'use strict';
const SCENE='runlu-appstore-screenshot-scene-v2';
const path=location.pathname.toLowerCase();
const mobile=window.innerWidth<700;
function mark(name){localStorage.setItem(SCENE,name);document.documentElement.setAttribute('data-runlu-screenshot-scene',name);}
function inner(){const f=document.getElementById('app');return f&&f.contentWindow;}
function applyPreviewScene(name){
 const w=inner();if(!w||typeof w.showPage!=='function')return false;
 if(name==='dashboard'){w.showPage('home');return true;}
 if(name==='inventory'){w.showPage('inventory');return true;}
 if(name==='carpet'){w.showPage('carpetInventory');return true;}
 if(name==='receiving'){w.showPage('receivingHub');return true;}
 if(name==='transfer'){
   if(typeof w.startCommandOperation==='function'){
     w.startCommandOperation('Inventory Transfer');
     if(mobile)setTimeout(()=>{
       const field=w.document?.getElementById('operationLineType')||w.document?.getElementById('operationType');
       field?.scrollIntoView?.({block:'center',behavior:'auto'});
     },900);
     return true;
   }
   w.showPage('operations');return true;
 }
 if(name==='scan'){w.showPage('scan');return true;}
 return false;
}
function routeScene(name){
 if(!name)return false;
 if(name==='users'){
   mark('users');
   if(!path.endsWith('/users.html'))location.replace('users.html');
   return true;
 }
 if(name==='backup'){
   mark('backup');
   if(!path.endsWith('/backup.html'))location.replace('backup.html');
   return true;
 }
 if(path.endsWith('/preview.html')){
   const apply=()=>{if(applyPreviewScene(name)){mark(name);return true;}return false;};
   if(apply())return true;
   let tries=0;
   const timer=setInterval(()=>{tries+=1;if(apply()||tries>40)clearInterval(timer);},250);
   return true;
 }
 return false;
}
function sceneFromUrl(url){
 try{
   const u=new URL(url);
   if(u.protocol!=='runlu-shot:')return '';
   const host=(u.hostname||'').toLowerCase();
   const seg=(u.pathname||'').split('/').filter(Boolean).pop()||'';
   return (host==='scene'?seg:host||seg).toLowerCase();
 }catch{return '';}
}
function listenForCommands(){
 const attach=()=>{
   const app=window.Capacitor?.Plugins?.App;
   if(!app?.addListener)return false;
   app.addListener('appUrlOpen',event=>routeScene(sceneFromUrl(event?.url||'')));
   return true;
 };
 if(attach())return;
 let tries=0;
 const timer=setInterval(()=>{tries+=1;if(attach()||tries>40)clearInterval(timer);},250);
}
listenForCommands();
if(path.endsWith('/preview.html')){
 setTimeout(()=>routeScene('dashboard'),700);
 return;
}
if(path.endsWith('/users.html')){mark('users');return;}
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
console.log('RUNLU screenshot scenes prepared with deterministic URL commands: dashboard, inventory, carpet, receiving, transfer, scan, users, backup.');
