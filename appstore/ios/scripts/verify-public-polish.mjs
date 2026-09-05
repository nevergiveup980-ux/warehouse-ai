import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadHtml } from 'cheerio';

const here=dirname(fileURLToPath(import.meta.url));
const target=resolve(here,'../www/universal-app.html');
const html=await readFile(target,'utf8');
const $=loadHtml(html,{decodeEntities:false});
const errors=[];

const homeTitles=$('#home button.module strong').map((_,el)=>$(el).text().trim()).get();
if(!homeTitles.includes('Scan / OCR'))errors.push('Home is missing Scan / OCR.');
for(const forbidden of ['AI Scan','Settings','Developer Tools'])if(homeTitles.includes(forbidden))errors.push(`Home still exposes ${forbidden}.`);
if($('#navSettings').length)errors.push('Mature-core footer still exposes duplicate Settings.');
if($('#scan > .card').first().find('h2').first().text().trim()!=='Scan / OCR')errors.push('Scanner page is not titled Scan / OCR.');

const bodyText=$('body').text().replace(/\s+/g,' ');
for(const phrase of [
  'GPT is used only when a local answer is not enough',
  'synchronize with signed-in devices',
  'cloud-shared history',
  'Supabase-ready cloud data',
  'Shared AI Scan'
])if(bodyText.includes(phrase))errors.push(`Public local-first copy still contains: ${phrase}`);

if(!bodyText.includes('Cloud AI is not enabled in this release.'))errors.push('Local-only Cloud AI status is not visible.');
if(!html.includes("if(!('processLocally' in voiceRecognition)){voiceRecognition=null;return}"))errors.push('Speech recognition does not fail closed when strict on-device mode is unavailable.');
if(!html.includes('voiceRecognition.processLocally=true'))errors.push('Speech recognition is not forced to processLocally=true.');
if(!html.includes('Strict on-device speech recognition is unavailable here. Use the text box below.'))errors.push('Safe text-only fallback for unsupported on-device speech is missing.');
if(!html.includes('const BUILTIN_SUPPLIER_TEMPLATES=[];'))errors.push('Built-in supplier presets are not neutralized.');
for(const supplier of ['Primco','Taiga','Fuzion','Treeco','Buckwold','Centura','Oakel City','Twelve Oaks']){
  if(new RegExp(supplier.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(html))errors.push(`Private supplier-specific runtime remains: ${supplier}`);
}

// Internal mature-core values may still use the legacy token "AI Scan" for
// compatibility. The release gate checks only user-visible labels/headings,
// not those internal source values.
if($('#home button.module strong').filter((_,el)=>$(el).text().trim()==='AI Scan').length)errors.push('User-visible AI Scan home label remains.');
if($('#scan h2').filter((_,el)=>$(el).text().trim()==='AI Scan').length)errors.push('User-visible AI Scan page title remains.');
$('button').each((_,el)=>{if($(el).text().includes('AI Scan'))errors.push(`User-visible button still says AI Scan: ${$(el).text().trim()}`)});

if(errors.length){
  console.error('\nRUNLU App Store public polish verification FAILED:\n');
  for(const error of [...new Set(errors)])console.error(' - '+error);
  process.exit(1);
}
console.log('RUNLU App Store public polish verification passed: local Scan/OCR, strict on-device-only speech, and customer-generic supplier runtime confirmed.');
