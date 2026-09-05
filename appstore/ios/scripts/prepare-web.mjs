import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const repoRoot = resolve(appDir, '../..');
const webDir = resolve(appDir, 'www');
const runtimeExtensions = new Set(['.html', '.js', '.json', '.jpg', '.jpeg', '.png', '.svg', '.wasm', '.gz']);

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const entry of await readdir(repoRoot, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!runtimeExtensions.has(extname(entry.name).toLowerCase())) continue;
  await cp(resolve(repoRoot, entry.name), resolve(webDir, entry.name));
}

const voiceSrc = resolve(repoRoot, 'voice');
const voiceDst = resolve(webDir, 'voice');
await cp(voiceSrc, voiceDst, { recursive: true });

const indexPath = resolve(webDir, 'index.html');
let html = await readFile(indexPath, 'utf8');

// The public App Store binary does not offer self-service account creation.
// Warehouse cloud accounts are provisioned by the user's organization/admin.
// This protects the production Supabase project and keeps the public binary's
// account model consistent with its business/organization use case.
const signUpButton = '<button onclick="cloudSignUp()">Create App Login</button>';
if (!html.includes(signUpButton)) {
  throw new Error('App Store packaging guard failed: Create App Login button was not found. Review upstream login UI before shipping.');
}
html = html.replace(signUpButton, '');

const cloudActionsEnd = '<button onclick="cloudSignOut()">Sign Out</button></div>';
const legalLinks = `${cloudActionsEnd}\n<div class="meta" data-runlu-appstore-legal style="margin-top:10px">App Store accounts are provided by your organization. <a href="https://runlu.ca/warehouse-privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="https://runlu.ca/warehouse-support.html" target="_blank" rel="noopener">Support</a> · <a href="https://runlu.ca/warehouse-account-deletion.html" target="_blank" rel="noopener">Account & data removal</a></div>`;
if (!html.includes(cloudActionsEnd)) {
  throw new Error('App Store packaging guard failed: Cloud Sync actions block was not found. Review upstream Settings UI before shipping.');
}
html = html.replace(cloudActionsEnd, legalLinks);

const bridgeTag = '<script src="runlu-native.js"></script>';
if (!html.includes(bridgeTag)) {
  html = html.includes('</body>') ? html.replace('</body>', `${bridgeTag}\n</body>`) : `${html}\n${bridgeTag}\n`;
}

await writeFile(indexPath, html, 'utf8');
console.log('RUNLU Warehouse App Store web bundle prepared at', webDir);
