import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const www=resolve(here,'../www/universal');
const publicPages=['onboarding.html','sign-in.html','users.html','backup.html','settings.html','preview.html'];

for(const name of publicPages){
  const path=resolve(www,name);
  let html=await readFile(path,'utf8');
  html=html.replaceAll('Universal Edition','Flooring Edition');
  if(html.includes('Universal Edition'))throw new Error(`Public App Store page still exposes Universal Edition label: ${name}`);
  await writeFile(path,html,'utf8');
}

console.log('RUNLU Warehouse OS public positioning applied: Flooring Edition');
