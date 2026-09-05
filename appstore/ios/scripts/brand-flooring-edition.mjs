import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const www=resolve(here,'../www/universal');
const publicPages=['onboarding.html','sign-in.html','users.html','backup.html','settings.html','preview.html'];
const topLevelPages=new Set(['onboarding.html','sign-in.html','users.html','backup.html','settings.html']);

for(const name of publicPages){
  const path=resolve(www,name);
  let html=await readFile(path,'utf8');
  html=html.replaceAll('Universal Edition','Flooring Edition');

  // All full-page native screens must clear the iPhone status bar / Dynamic Island.
  // preview.html has its own more specialized safe-area shell treatment.
  if(topLevelPages.has(name)&&!html.includes('runluAppStorePageSafeArea')){
    html=html.replace('</head>',`<style id="runluAppStorePageSafeArea">body>header{padding-top:calc(16px + env(safe-area-inset-top))!important}</style></head>`);
  }

  if(name==='users.html'){
    const old="function labelRole(r){return r==='member'?'Staff':r.charAt(0).toUpperCase()+r.slice(1)}";
    const next="function labelRole(r){return {owner:'Owner',admin:'Administrator',manager:'Manager',member:'Staff',viewer:'Viewer'}[String(r||'').toLowerCase()]||'User'}";
    if(!html.includes(old))throw new Error('Local Users role-label function changed; review before App Store branding.');
    html=html.replace(old,next);
  }

  if(html.includes('Universal Edition'))throw new Error(`Public App Store page still exposes Universal Edition label: ${name}`);
  if(topLevelPages.has(name)&&!html.includes('runluAppStorePageSafeArea'))throw new Error(`Public App Store page lacks native safe-area protection: ${name}`);
  await writeFile(path,html,'utf8');
}

console.log('RUNLU Warehouse OS public positioning applied: Flooring Edition, top-level safe areas protected, role labels normalized.');
