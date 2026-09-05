import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { load as loadHtml } from 'cheerio';

const here = dirname(fileURLToPath(import.meta.url));
const iosDir = resolve(here, '..');
const repoRoot = resolve(iosDir, '../..');
const out = resolve(iosDir, 'www');
const universalSrc = resolve(repoRoot, 'universal');
const universalOut = resolve(out, 'universal');

const OMIT_ROOT = new Set([
  'index.html',
  'universal-app.html',
  'carpet_seed.js',
  'worker.js',
  'worker.min.js'
]);
const INTERNAL_BRIDGE_RE = /^build(?:094|095|096|097|098|099|100|101|102|103|104)-/i;
const COPY_EXTENSIONS = new Set(['.js', '.json', '.jpg', '.jpeg', '.png', '.svg', '.wasm', '.gz']);

const replacements = new Map([
  ['initializeSeedDatabase', "function initializeSeedDatabase(){return {addedMasters:0,addedInventory:0,distribution:'clean'};}"],
  ['autoInitializeSeed', "function autoInitializeSeed(){return false;}"],
  ['applyV516WarehouseDataset', "function applyV516WarehouseDataset(){return {addedMasters:0,addedInventory:0,distribution:'clean'};}"],
  ['applyV5515FieldProducts', "function applyV5515FieldProducts(){return {addedM:0,addedI:0,distribution:'clean'};}"],
  ['restoreConversationOrders', "function restoreConversationOrders(){return {addedOrders:0,addedSpecial:0,distribution:'clean'};}"],
  ['migrateLegacyCarpetData', "function migrateLegacyCarpetData(){return {addedRolls:0,addedCuts:0,distribution:'clean'};}"],
  ['cloudSignUp', "async function cloudSignUp(){return null;}"],
  ['cloudSignIn', "async function cloudSignIn(){return null;}"],
  ['cloudChangePassword', "async function cloudChangePassword(){return null;}"],
  ['cloudSignOut', "function cloudSignOut(){return null;}"],
  ['cloudAutoRefresh', "async function cloudAutoRefresh(){return null;}"],
  ['startCloudPolling', "function startCloudPolling(){return null;}"],
  ['cloudSyncNow', "async function cloudSyncNow(){return null;}"],
  ['cloudUploadAll', "async function cloudUploadAll(){return null;}"],
  ['cloudDownloadAll', "async function cloudDownloadAll(){return null;}"],
  ['cloudResolveConflictsFromCloud', "async function cloudResolveConflictsFromCloud(){return null;}"],
  ['cloudResolveConflictsFromDevice', "async function cloudResolveConflictsFromDevice(){return null;}"],
]);

await rm(out, { recursive: true, force: true });
await mkdir(universalOut, { recursive: true });

// Copy root runtime assets, but never copy production HTML, historical carpet seed,
// server worker source, or the private Flooring OS / Accounting bridge builds 094-104.
for (const entry of await readdir(repoRoot, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (OMIT_ROOT.has(entry.name)) continue;
  if (INTERNAL_BRIDGE_RE.test(entry.name)) continue;
  if (!COPY_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
  await cp(resolve(repoRoot, entry.name), resolve(out, entry.name));
}

// The release loader must agree with the files above.
const loaderPath = resolve(out, 'release-loader.js');
let loader = await readFile(loaderPath, 'utf8');
loader = loader.split('\n').filter(line => !INTERNAL_BRIDGE_RE.test(line.replace(/[ '\",]/g, ''))).join('\n');
if (/build(?:094|095|096|097|098|099|100|101|102|103|104)-/i.test(loader)) {
  throw new Error('Distribution guard: an internal Build094-104 bridge remains in release-loader.js.');
}
await writeFile(loaderPath, loader, 'utf8');

// Ship only the Universal runtime required by the user-facing build.
for (const name of [
  'onboarding.html', 'preview.html', 'settings.html',
  'runtime-config.js', 'templates.js', 'workspace.js',
  'storage-adapter.js', 'core-adapter.js', 'legacy-storage-shim.js'
]) {
  await cp(resolve(universalSrc, name), resolve(universalOut, name));
}

// Public V1 is local-first. Multi-device sync will return only after a dedicated
// Universal cloud environment exists; it must never point at production Warehouse OS.
for (const name of ['runtime-config.js', 'templates.js']) {
  const p = resolve(universalOut, name);
  let text = await readFile(p, 'utf8');
  text = text.replaceAll('multiDeviceSync:true', 'multiDeviceSync:false');
  await writeFile(p, text, 'utf8');
}
{
  const p = resolve(universalOut, 'legacy-storage-shim.js');
  let text = await readFile(p, 'utf8');
  text = text.replace("const productionCloudOrigin='https://ekrnknlawekeoszzkamd.supabase.co';", "const productionCloudOrigin='https://local-only.invalid';");
  await writeFile(p, text, 'utf8');
}

function neutralizeFunctions(html) {
  let found = new Set();
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  html = html.replace(scriptRe, (whole, attrs, code) => {
    if (/\bsrc\s*=/.test(attrs)) return whole;
    let ast;
    try {
      ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    } catch (error) {
      throw new Error(`Distribution guard: could not parse an inline script: ${error.message}`);
    }
    const edits = [];
    walk.simple(ast, {
      FunctionDeclaration(node) {
        const name = node.id?.name;
        if (name && replacements.has(name)) {
          edits.push({ start: node.start, end: node.end, text: replacements.get(name) });
          found.add(name);
        }
      }
    });
    edits.sort((a, b) => b.start - a.start);
    for (const edit of edits) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
    return `<script${attrs}>${code}</script>`;
  });

  for (const required of [
    'initializeSeedDatabase', 'autoInitializeSeed', 'applyV516WarehouseDataset',
    'applyV5515FieldProducts', 'restoreConversationOrders', 'migrateLegacyCarpetData',
    'cloudSignUp', 'cloudSignIn', 'cloudAutoRefresh', 'startCloudPolling'
  ]) {
    if (!found.has(required)) throw new Error(`Distribution guard: expected function ${required} was not found. Upstream core changed; review before shipping.`);
  }
  return html;
}

function cleanMatureCore(html) {
  html = neutralizeFunctions(html);
  html = html.replace("const CLOUD_URL='https://ekrnknlawekeoszzkamd.supabase.co';", "const CLOUD_URL='https://local-only.invalid';");
  html = html.replace(/const CLOUD_KEY='[^']*';/, "const CLOUD_KEY='';");

  const $ = loadHtml(html, { decodeEntities: false });
  $('script[src="carpet_seed.js"]').remove();
  $('#headerCloudPill').remove();
  $('.settingRow').each((_, el) => {
    const title = $(el).find('.name').first().text().trim();
    if (title === 'Cloud Sync' || title === 'Carpet Management Link') $(el).remove();
  });
  $('body').append('<script src="runlu-native.js"></script>');
  return $.html();
}

let mature = await readFile(resolve(repoRoot, 'universal-app.html'), 'utf8');
mature = cleanMatureCore(mature);
await writeFile(resolve(out, 'universal-app.html'), mature, 'utf8');

function publicOnboarding(html) {
  const $ = loadHtml(html, { decodeEntities: false });
  $('.eyebrow').text('Universal Edition');
  $('header p').text('Create your company and first warehouse. Your operational data stays in this workspace on this device.');
  $('.notice').first().remove();
  $('section.card').each((_, el) => {
    if ($(el).find('h2').first().text().trim() === 'Commercial preview') $(el).remove();
  });
  $('section.card').each((_, el) => {
    if ($(el).find('h2').first().text().trim() === 'Workspace owner') {
      $(el).find('.sub').text('This name identifies the local workspace owner. Sign-in and team cloud access are not enabled in this local-first release.');
    }
  });
  $('button[type="submit"]').text('Create Workspace');
  $('.footer').text('RUNLU Warehouse OS · Universal Edition');
  const text = $.html().replaceAll('Universal development workspace created.', 'Workspace created.')
    .replaceAll('href="index.html">Open workspace', 'href="preview.html">Open Warehouse OS');
  return text;
}

function publicSettings(html) {
  const $ = loadHtml(html, { decodeEntities: false });
  $('title').text('RUNLU Warehouse OS Settings');
  $('.topsub').text('Universal Edition · local-first workspace');
  $('[data-feature="multiDeviceSync"]').closest('label').remove();
  $('button[type="submit"]').text('Save Settings');
  $('a[href="index.html"]').attr('href', 'preview.html').text('Back to Warehouse OS');
  $('#saved').text('Settings saved to this workspace.');
  let text = $.html();
  text = text.replace("multiDeviceSync:'Multi-device Sync',", '');
  text = text.replaceAll("location.replace('index.html')", "location.replace('preview.html')");
  return text;
}

function publicPreview(html) {
  const $ = loadHtml(html, { decodeEntities: false });
  $('title').text('RUNLU Warehouse OS');
  $('.bar b').text('RUNLU Warehouse OS · Universal Edition');
  $('.bar span').text('Local-first workspace · company and warehouse data isolated on this device');
  $('.bar a').attr('href', 'settings.html').text('Settings');
  return $.html();
}

{
  const p = resolve(universalOut, 'onboarding.html');
  await writeFile(p, publicOnboarding(await readFile(p, 'utf8')), 'utf8');
}
{
  const p = resolve(universalOut, 'settings.html');
  await writeFile(p, publicSettings(await readFile(p, 'utf8')), 'utf8');
}
{
  const p = resolve(universalOut, 'preview.html');
  await writeFile(p, publicPreview(await readFile(p, 'utf8')), 'utf8');
}

await writeFile(resolve(out, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>RUNLU Warehouse OS</title></head><body><script>location.replace('universal/preview.html')</script><a href="universal/preview.html">Open RUNLU Warehouse OS</a></body></html>`, 'utf8');

console.log('RUNLU Warehouse OS App Store web bundle prepared:', out);
