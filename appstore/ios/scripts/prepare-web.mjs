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
const bridgeTag = '<script src="runlu-native.js"></script>';
if (!html.includes(bridgeTag)) {
  html = html.includes('</body>') ? html.replace('</body>', `${bridgeTag}\n</body>`) : `${html}\n${bridgeTag}\n`;
  await writeFile(indexPath, html, 'utf8');
}

console.log('RUNLU Warehouse App Store web bundle prepared at', webDir);
