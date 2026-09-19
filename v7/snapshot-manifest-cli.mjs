import fs from 'node:fs';
import {classifySnapshot} from './snapshot-transformer.mjs';

const input=process.argv[2];
if(!input){
  console.error('usage: node v7/snapshot-manifest-cli.mjs <snapshot.json>');
  process.exit(2);
}
const rows=JSON.parse(fs.readFileSync(input,'utf8'));
if(!Array.isArray(rows)) throw new Error('snapshot must be a JSON array');
const manifest=classifySnapshot(rows);
process.stdout.write(JSON.stringify(manifest,null,2)+'\n');
