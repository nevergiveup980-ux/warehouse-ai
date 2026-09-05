import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iosDir = resolve(here, '..');
const out = resolve(iosDir, 'www');
const textExt = new Set(['.html', '.js', '.json', '.svg']);
const errors = [];

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}

const files = await walk(out);
const names = files.map(f => f.slice(out.length + 1).replaceAll('\\', '/'));

for (const forbiddenFile of ['carpet_seed.js']) {
  if (names.some(n => n.endsWith('/' + forbiddenFile) || n === forbiddenFile)) errors.push(`Forbidden distribution file present: ${forbiddenFile}`);
}
for (const prefix of [
  'build072-', 'build090-',
  'build094-', 'build095-', 'build096-', 'build097-', 'build098-', 'build099-',
  'build100-', 'build101-', 'build102-', 'build103-', 'build104-'
]) {
  if (names.some(name => name.startsWith(prefix))) errors.push(`Private/cloud build present: ${prefix}`);
}

const forbidden = [
  ['production Supabase origin', 'https://ekrnknlawekeoszzkamd.supabase.co'],
  ['production Supabase publishable key', 'sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn'],
  ['Cloud Master runtime', 'runluCloudMaster'],
  ['Cloud Master storage namespace', 'runlu_cloud_master_'],
  ['private company bridge name', 'Deerfoot'],
  ['internal training bridge label', 'Central Training pilot'],
  ['historical PO 181276', '181276'],
  ['historical PO 21228', '21228'],
  ['historical PO 805613-EDM', '805613-EDM'],
  ['historical carpet seed include', 'carpet_seed.js'],
  ['public self-service cloud account', 'Create App Login'],
  ['old monthly pricing hypothesis', '29.99'],
  ['old annual pricing hypothesis', '299.99']
];

for (const file of files) {
  if (!textExt.has(extname(file).toLowerCase())) continue;
  const text = await readFile(file, 'utf8');
  for (const [label, needle] of forbidden) {
    if (text.includes(needle)) errors.push(`${label} remains in ${file.slice(out.length + 1)}`);
  }
  const poLiteral = text.match(/\bPO\s*#?\s*\d{5,}(?:-[A-Z0-9-]+)?/i);
  if (poLiteral) errors.push(`Hard-coded PO literal remains in ${file.slice(out.length + 1)}: ${poLiteral[0]}`);
}

for (const required of [
  'index.html',
  'universal-app.html',
  'universal/onboarding.html',
  'universal/preview.html',
  'universal/settings.html',
  'release-loader.js'
]) {
  try { await access(resolve(out, required)); }
  catch { errors.push(`Required distribution file missing: ${required}`); }
}

const mature = await readFile(resolve(out, 'universal-app.html'), 'utf8');
if (mature.includes('Cloud login password') || mature.includes('Download Cloud Data')) errors.push('Cloud Sync UI remains in universal-app.html.');
if (!mature.includes("function restoreConversationOrders(){return {addedOrders:0,addedSpecial:0,distribution:'clean'};}")) errors.push('Historical order recovery was not neutralized.');
if (!mature.includes("function migrateLegacyCarpetData(){return {addedRolls:0,addedCuts:0,distribution:'clean'};}")) errors.push('Legacy carpet migration was not neutralized.');
if (!mature.includes('runlu-native.js')) errors.push('Native bridge is not injected into mature core.');

if (errors.length) {
  console.error('\nRUNLU App Store distribution verification FAILED:\n');
  for (const error of errors) console.error(' - ' + error);
  process.exit(1);
}

console.log(`RUNLU App Store distribution verification passed (${files.length} packaged files).`);
