import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(here,'../www');

async function rewrite(rel, fn){
  const p=resolve(out,rel);
  const before=await readFile(p,'utf8');
  const after=fn(before);
  await writeFile(p,after,'utf8');
}

// Private/company-specific layers intentionally excluded from the local-first
// App Store edition. Build073/074 hard-code the old 3-inch carpet allowance
// analytics; Build107 restores a RUNLU-hosted Cloudflare AI gateway. The public
// app keeps the mature generic carpet workflow with customer-configurable cut
// allowance, local OCR/barcode/camera and local voice.
for(const name of [
  'build073-hotfix.js',
  'build074-hotfix.js',
  'build107-scan-gateway-stop-snap.js'
])await rm(resolve(out,name),{force:true});
await rewrite('release-loader.js',text=>text.split('\n').filter(line=>
  !line.includes('build073-hotfix.js')&&
  !line.includes('build074-hotfix.js')&&
  !line.includes('build107-scan-gateway-stop-snap.js')
).join('\n'));

await rewrite('universal-app.html',text=>{
  text=text.replace("const WAREHOUSE_TAG_BASE_URL='https://warehouse.runlu.ca/';","const WAREHOUSE_TAG_BASE_URL='';");
  text=text.replaceAll('QR codes always point to warehouse.runlu.ca.','QR codes use the customer-configured tag base when one is set.');
  text=text.replaceAll('Sign in once on warehouse.runlu.ca.','Reconnect using your organization’s configured service.');
  text=text.replace("const CLOUD_URL='https://local-only.invalid';","const CLOUD_URL='';");
  text=text.replaceAll('https://runlu-gpt-gateway.nevergiveup980.workers.dev','');
  return text;
});

// Build089 only used the old production hostname in a source comment. Remove the
// identifier as well so the compiled App Store bundle has no ambiguous RUNLU
// warehouse-cloud hostname at all, even in non-executable text.
await rewrite('build089-cache-coherence.js',text=>text
  .replaceAll('warehouse.runlu.ca is a dedicated application origin.','This App Store build uses a dedicated local application origin.')
);

await rewrite('universal/preview.html',text=>text
  .replace("const tagNeedle=\"const WAREHOUSE_TAG_BASE_URL='https://warehouse.runlu.ca/';\";if(!html.includes(tagNeedle))throw new Error('Warehouse tag constant changed; preview transformation was stopped safely.');html=html.replace(tagNeedle,\"const WAREHOUSE_TAG_BASE_URL=RUNLUCoreAdapter.tagBaseUrl()||'https://universal-v1.invalid/';\");",
           "const tagNeedle=\"const WAREHOUSE_TAG_BASE_URL='';\";if(!html.includes(tagNeedle))throw new Error('Warehouse tag constant changed; preview transformation was stopped safely.');html=html.replace(tagNeedle,\"const WAREHOUSE_TAG_BASE_URL=RUNLUCoreAdapter.tagBaseUrl()||'';\");")
  .replaceAll('https://universal-v1.invalid/','')
);

await rewrite('universal/legacy-storage-shim.js',text=>text.replaceAll('https://local-only.invalid',''));

const forbidden=[
  'https://runlu-gpt-gateway.nevergiveup980.workers.dev',
  'warehouse.runlu.ca',
  'https://local-only.invalid',
  'https://universal-v1.invalid/'
];

async function walk(dir){
  const files=[];
  for(const e of await readdir(dir,{withFileTypes:true})){
    const p=resolve(dir,e.name);
    if(e.isDirectory())files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}

const checkFiles=(await walk(out)).filter(p=>['.html','.js','.json','.svg'].includes(extname(p).toLowerCase()));
const errors=[];
for(const p of checkFiles){
  const rel=p.slice(out.length+1).replaceAll('\\','/');
  // tesseract.min.js contains its upstream CDN default in bundled library code,
  // but RUNLU explicitly supplies local worker/core/lang paths at runtime.
  if(rel==='tesseract.min.js')continue;
  const text=await readFile(p,'utf8');
  for(const needle of forbidden)if(text.includes(needle))errors.push(`${needle} remains in ${rel}`);
}
for(const removed of ['build073-hotfix.js','build074-hotfix.js','build107-scan-gateway-stop-snap.js']){
  if(checkFiles.some(p=>p.endsWith('/'+removed)))errors.push(`Excluded private/company-specific layer remains: ${removed}`);
}
if(errors.length)throw new Error('Local-first network/business-rule sanitizer failed:\n'+errors.join('\n'));

console.log('RUNLU local-first sanitizer passed: no RUNLU-hosted cloud/gateway endpoint and no company-specific 3-inch analytics layers in the public runtime.');
