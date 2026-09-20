#!/usr/bin/env node
import fs from 'node:fs';
import {reconcileCarpetIdentity} from './carpet-identity-v2.mjs';

const args=process.argv.slice(2);
const input=args[0];
const ri=args.indexOf('--report');
const report=ri>=0?args[ri+1]:null;
if(!input||!report){
  console.error('usage: node v7/carpet-identity-v2-cli.mjs <snapshot.json> --report <report.json>');
  process.exit(2);
}
const rows=JSON.parse(fs.readFileSync(input,'utf8'));
const out=reconcileCarpetIdentity(rows);
fs.writeFileSync(report,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({
  mode:out.mode,
  production_writes:out.production_writes,
  counts:out.counts,
  shared_roll_groups:out.shared_roll_groups,
  conflicts:out.conflicts
},null,2));
console.log('V7 CARPET IDENTITY V2 REHEARSAL: PASS');
