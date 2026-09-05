import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadHtml } from 'cheerio';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../www/universal-app.html');
let html = await readFile(target, 'utf8');

const scanRe = /function\s+scanGptEnabled\s*\(\s*\)\s*\{\s*return\s+localStorage\.getItem\(SCAN_GPT_ENABLED_KEY\)\s*===\s*['"]1['"]\s*;?\s*\}/;
const voiceRe = /function\s+voiceGptEnabled\s*\(\s*\)\s*\{\s*return\s+localStorage\.getItem\(VOICE_GPT_ENABLED_KEY\)\s*===\s*['"]1['"]\s*;?\s*\}/;
if (!scanRe.test(html)) throw new Error('Local-only guard: scanGptEnabled function changed upstream.');
if (!voiceRe.test(html)) throw new Error('Local-only guard: voiceGptEnabled function changed upstream.');
html = html.replace(scanRe, 'function scanGptEnabled(){return false}');
html = html.replace(voiceRe, 'function voiceGptEnabled(){return false}');

const $ = loadHtml(html, { decodeEntities: false });
function replaceModeCard(selector, title, body) {
  const control = $(selector).first();
  if (!control.length) throw new Error(`Local-only guard: ${selector} was not found.`);
  const card = control.closest('.card');
  if (!card.length) throw new Error(`Local-only guard: ${selector} is no longer inside a card.`);
  card.replaceWith(`<div class="card"><div class="cardTitle">${title}</div><div class="muted" style="margin-top:8px">${body}</div></div>`);
}
replaceModeCard('#scanAiMode', 'Scan Mode', '<b>Local OCR / Barcode</b><br>Scanning is processed on this device. Cloud Vision is not enabled in this release.');
replaceModeCard('#voiceAiMode', 'Voice Mode', '<b>Local Warehouse Voice</b><br>Voice commands stay in the local warehouse workflow. Cloud AI is not enabled in this release.');
const usage = $('#aiUsageMonth').first();
if (usage.length) usage.closest('.card').remove();

await writeFile(target, $.html(), 'utf8');
console.log('RUNLU App Store local-only AI guard applied.');
