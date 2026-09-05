import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadHtml } from 'cheerio';

const here=dirname(fileURLToPath(import.meta.url));
const target=resolve(here,'../www/universal-app.html');
let html=await readFile(target,'utf8');

// App Store V1 is customer-generic and local-first. Do not ship supplier presets
// learned from RUNLU's private warehouse history. Customers can create their own
// local supplier templates from the same Scanner UI.
const supplierBlock=/const BUILTIN_SUPPLIER_TEMPLATES=\[[\s\S]*?\];/;
if(!supplierBlock.test(html))throw new Error('Public polish: supplier template block changed upstream.');
html=html.replace(supplierBlock,'const BUILTIN_SUPPLIER_TEMPLATES=[];');
const supplierParser=/function parseSupplierTemplate\(raw,template\)\{[\s\S]*?\n return result\n\}/;
if(!supplierParser.test(html))throw new Error('Public polish: supplier parser changed upstream.');
html=html.replace(supplierParser,String.raw`function parseSupplierTemplate(raw,template){
 if(!template)return null;
 const line=supplierLineGuess(raw);
 return {template,supplier:template.supplier,po:firstMatch(raw,[/\b(?:CUSTOMER\s+PO|CUST\s+PO|YOUR\s+REF|P\.?\s*O\.?)\s*[:#-]?\s*([A-Z0-9-]+)/i]),supplierOrder:firstMatch(raw,[/\b(?:ORDER\s+NUMBER|ORDER\s+NO\.?)\s*[:#-]?\s*([A-Z0-9-]+)/i]),customer:'',sales:'',...line}
}`);
html=html.replace('SHAW|MOHAWK|PRIMCO|TAIGA|TWELVE OAKS|BUCKWOLD','SUPPLIER|PACKING|PICKUP|WILL CALL|ORDER ACKNOWLEDGEMENT');
html=html.replaceAll('Correction remembered and included in synchronized data.','Correction saved in this local warehouse workspace.');
html=html.replaceAll('Supplier format remembered and included in synchronized data.','Supplier format saved in this local warehouse workspace.');
html=html.replaceAll('Shared AI Scan','Shared Scanner');
html=html.replaceAll('Open AI Scan from the page you want to fill.','Open Scan / OCR from the page you want to fill.');

// Web SpeechRecognition can otherwise choose a remote recognition service. The
// App Store edition must never make that fallback. Only enable microphone speech
// when the implementation exposes the strict on-device processLocally contract;
// otherwise the text Warehouse Assistant remains available with no microphone.
const voiceSetupNeedle='voiceRecognition=new SR();voiceRecognition.continuous=false;voiceRecognition.interimResults=true;voiceRecognition.maxAlternatives=10;';
const voiceSetupReplacement="voiceRecognition=new SR();if(!('processLocally' in voiceRecognition)){voiceRecognition=null;return}voiceRecognition.processLocally=true;voiceRecognition.continuous=false;voiceRecognition.interimResults=true;voiceRecognition.maxAlternatives=10;";
if(!html.includes(voiceSetupNeedle))throw new Error('Public polish: voice recognition setup changed upstream.');
html=html.replace(voiceSetupNeedle,voiceSetupReplacement);
const voiceStartNeedle="if(!voiceRecognition)voiceSetupRecognition();if(voiceContinuous)voiceMicWanted=true;";
const voiceStartReplacement="if(!voiceRecognition)voiceSetupRecognition();if(!voiceRecognition){voiceMicWanted=false;voiceSetState('idle',(voiceLastReplyLang||'en-CA')==='zh-CN'?'此设备当前不提供严格的本地语音识别，请使用下面的文字输入框。':'Strict on-device speech recognition is unavailable here. Use the text box below.');return}if(voiceContinuous)voiceMicWanted=true;";
if(!html.includes(voiceStartNeedle))throw new Error('Public polish: voice recognition start path changed upstream.');
html=html.replace(voiceStartNeedle,voiceStartReplacement);

const $=loadHtml(html,{decodeEntities:false});

// The outer native shell owns Settings, Users and Backup. Remove duplicate or
// internal-maintenance home entries from the mature operational core.
$('#home button.module').each((_,el)=>{
  const button=$(el), title=button.find('strong').first().text().trim();
  if(title==='Settings'||title==='Developer Tools'){button.remove();return;}
  if(title==='AI Scan'){
    button.find('strong').first().text('Scan / OCR');
    button.find('small').first().text('Local barcode and OCR capture with review before saving');
  }
});
$('#navSettings').remove();

// Keep the scanner's internal source value for mature-core compatibility while
// presenting accurate local-only wording to users and App Review.
$('#scan > .card').first().find('h2').first().text('Scan / OCR');
$('#scanContextNotice b').first().text('Shared Scanner');
$('#operationSource option').filter((_,el)=>$(el).text().trim()==='AI Scan').attr('value','AI Scan').text('Scan / OCR');
$('button').each((_,el)=>{
  const button=$(el),text=button.text();
  if(text.includes('AI Scan'))button.text(text.replaceAll('AI Scan','Scan / OCR'));
});

const voiceMeta=$('#voiceAssistant .voiceHero .meta').first();
if(voiceMeta.length)voiceMeta.text('Ask the live Warehouse OS by text, or by speech only when strict on-device recognition is available. Cloud AI is not enabled in this release.');

// Remove cloud-era claims from visible Flooring Edition copy. These are display
// changes only; local workflow behavior remains unchanged.
const visibleReplacements=new Map([
  ['Original carpet-web precision plus Warehouse OS receiving, multi-roll cutting, returns, REM, transfers, rack capacity, labels and cloud-shared history.','Flooring-ready receiving, multi-roll cutting, returns, transfers, rack capacity, labels and local operation history.'],
  ['Single-roll precision, shared operations and Supabase-ready cloud data.','Single-roll precision, shared operations and local-first warehouse data.'],
  ['Corrections and supplier templates synchronize with signed-in devices.','Corrections and supplier templates are stored in this local warehouse workspace.'],
  ['Recognizes familiar supplier forms.','Create supplier-specific forms when your warehouse needs them.'],
  ['Built-in formats include Primco, Taiga, Fuzion, Treeco, Buckwold, Centura, Oakel City and Twelve Oaks. Recognition only prepares fields for review; it never changes inventory by itself.','Saved supplier formats prepare fields for review and never change inventory by themselves.'],
  ['Rack usage updates automatically from live carpet inventory. One unopened/full roll equals one capacity unit; measured rolls are converted using a 120′ standard-roll average. Tap a location for product summaries, colours, quantities and roll details.','Rack usage updates from active carpet inventory and configured location capacity. Full and measured rolls are shown as estimated capacity use. Tap a location for product summaries, colours, quantities and roll details.']
]);
$('body *').contents().filter((_,node)=>node.type==='text').each((_,node)=>{
  const parent=node.parent?.name||node.parent?.tagName||'';
  if(parent==='script'||parent==='style')return;
  let text=node.data;
  for(const [from,to] of visibleReplacements)if(text.includes(from))text=text.replaceAll(from,to);
  node.data=text;
});

const result=$.html();

// Hard release assertions: these failures are preferable to shipping ambiguous
// cloud/AI or private supplier language in an otherwise local-first App Store app.
if(result.includes('<strong>AI Scan</strong>')||result.includes('>AI Scan</h2>')||result.includes('📷 AI Scan'))throw new Error('Public polish: user-facing AI Scan wording remains.');
if(result.includes('GPT is used only when a local answer is not enough'))throw new Error('Public polish: cloud-AI voice promise remains.');
if(result.includes('synchronize with signed-in devices'))throw new Error('Public polish: multi-device sync promise remains.');
if(!result.includes("voiceRecognition.processLocally=true"))throw new Error('Public polish: strict on-device speech enforcement is missing.');
if(!result.includes('Strict on-device speech recognition is unavailable here. Use the text box below.'))throw new Error('Public polish: safe speech fallback is missing.');
if(!result.includes('const BUILTIN_SUPPLIER_TEMPLATES=[];'))throw new Error('Public polish: supplier presets were not neutralized.');
for(const privateSupplier of ['Primco','Taiga','Fuzion','Treeco','Buckwold','Centura','Oakel City','Twelve Oaks']){
  if(new RegExp(privateSupplier.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(result))throw new Error(`Public polish: supplier-specific runtime remains: ${privateSupplier}`);
}
if($('#home button.module').filter((_,el)=>['Settings','Developer Tools'].includes($(el).find('strong').first().text().trim())).length)throw new Error('Public polish: duplicate internal home module remains.');
if($('#navSettings').length)throw new Error('Public polish: mature-core Settings footer remains.');
if(!result.includes('<strong>Scan / OCR</strong>'))throw new Error('Public polish: local Scan / OCR home module is missing.');

await writeFile(target,result,'utf8');
console.log('RUNLU App Store public runtime polished: local Scan/OCR, strict on-device-only speech, customer-defined supplier templates, no duplicate internal Settings/Developer entries.');
