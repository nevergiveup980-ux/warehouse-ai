import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadHtml } from 'cheerio';

const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(here,'../www');

// The mature private warehouse core still contains its old cloud-login boot gate.
// The App Store edition has its own local Owner/role sign-in shell, so that legacy
// private-cloud gate must never cover or compete with the local-first workspace.
{
  const path=resolve(out,'universal-app.html');
  const html=await readFile(path,'utf8');
  const $=loadHtml(html,{decodeEntities:false});
  $('head').append(`<style id="runluAppStoreLocalFirstAccessGate">
#accessGate,#bootStage,#accessStage{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}
</style>`);
  $('#accessGate').attr('aria-hidden','true');
  $('.bootTitle').text('RUNLU Warehouse OS');
  $('.bootSub').text('Flooring Warehouse Operating System');
  $('#bootCloudText').text('Local workspace ready');
  const result=$.html();
  if(!result.includes('runluAppStoreLocalFirstAccessGate'))throw new Error('Could not install App Store local-first access gate override.');
  if(result.includes('Connecting to Warehouse Cloud'))throw new Error('Legacy cloud boot copy remains in App Store mature core.');
  await writeFile(path,result,'utf8');
}

// Respect the iPhone Dynamic Island / status bar. Keep the operational header
// compact but move it below the safe area instead of allowing controls to sit
// under system UI.
{
  const path=resolve(out,'universal/preview.html');
  const html=await readFile(path,'utf8');
  const $=loadHtml(html,{decodeEntities:false});
  $('head').append(`<style id="runluAppStoreSafeArea">
.bar{padding-top:calc(7px + env(safe-area-inset-top))!important;padding-left:12px!important;padding-right:12px!important;min-height:calc(56px + env(safe-area-inset-top))!important}
iframe{height:calc(100% - 68px - env(safe-area-inset-top))!important}
@media(max-width:520px){.bar{gap:7px}.bar b{font-size:12px}.bar span{font-size:9px}.bar a,.bar button{font-size:10px;padding:6px 8px}}
</style>`);
  const result=$.html();
  if(!result.includes('runluAppStoreSafeArea'))throw new Error('Could not install App Store safe-area shell styling.');
  await writeFile(path,result,'utf8');
}

console.log('RUNLU App Store shell adapted: legacy cloud gate hidden, local-first branding applied, iPhone safe area protected.');
