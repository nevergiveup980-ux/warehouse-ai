import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(here,'../www');
const textExt=new Set(['.html','.js','.json','.svg','.txt','.md']);
const forbiddenNames=new Set(['screenshot-fixture.js']);
const markers=['RUNLU_SCREENSHOT_FIXTURE_V1','Northstar Flooring Supply','PO-DEMO-001','PO-DEMO-002','PO-DEMO-003','Demo Flooring Distribution','Demo Materials Supply'];

async function walk(dir){
  const rows=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const p=resolve(dir,entry.name);
    if(entry.isDirectory())rows.push(...await walk(p));
    else rows.push(p);
  }
  return rows;
}

const files=await walk(out);
const errors=[];
for(const file of files){
  const name=file.slice(out.length+1).replaceAll('\\','/');
  if(forbiddenNames.has(name)||forbiddenNames.has(name.split('/').pop()))errors.push(`Screenshot-only file leaked into shipping bundle: ${name}`);
  if(!textExt.has(extname(file).toLowerCase()))continue;
  const text=await readFile(file,'utf8');
  for(const marker of markers)if(text.includes(marker))errors.push(`Screenshot-only marker leaked into shipping bundle: ${marker} in ${name}`);
}
if(errors.length){
  console.error('\nRUNLU screenshot-fixture isolation FAILED:\n');
  for(const error of errors)console.error(' - '+error);
  process.exit(1);
}
console.log('RUNLU screenshot fixture isolation passed: shipping www contains no demo fixture markers.');
