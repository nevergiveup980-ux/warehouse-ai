import fs from 'node:fs';

const input=process.argv[2]||'build072-hotfix.js';
const output=process.argv[3]||'/tmp/build072-hotfix-build145.js';
let s=fs.readFileSync(input,'utf8');

function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected exactly one anchor, found ${n}`);
  s=s.replace(from,to);
}

once(
`  function enqueue(dataset,id,op,payload,baseVersion){
    if(!dataset||!id)return;
    let q=queue(),idx=q.findIndex(x=>x.datasetKey===dataset&&x.recordId===id&&!x.blocked);
    if(idx>=0){
      const cur=q[idx];
      if(cur.baseVersion===0&&op==='delete'){q.splice(idx,1);write(QUEUE,q);renderPanel();return}
      q[idx]={...cur,op,payload:clone(payload),queuedAt:nowIso(),attempts:0};
    }else q.push({id:qid(),datasetKey:dataset,recordId:id,op,payload:clone(payload),baseVersion:Number(baseVersion||0),queuedAt:nowIso(),attempts:0,blocked:false});
    write(QUEUE,q);renderPanel();scheduleFlush();
  }`,
`  function enqueue(dataset,id,op,payload,baseVersion,source=''){
    if(!dataset||!id)return;
    let q=queue(),idx=q.findIndex(x=>x.datasetKey===dataset&&x.recordId===id&&!x.blocked);
    if(idx>=0){
      const cur=q[idx];
      if(cur.baseVersion===0&&op==='delete'){q.splice(idx,1);write(QUEUE,q);renderPanel();return}
      q[idx]={...cur,op,payload:clone(payload),queuedAt:nowIso(),attempts:0,source:source||cur.source||'',replayHeld:false,replayHoldReason:null,replayHeldAt:null};
    }else q.push({id:qid(),datasetKey:dataset,recordId:id,op,payload:clone(payload),baseVersion:Number(baseVersion||0),queuedAt:nowIso(),attempts:0,blocked:false,source:source||'',replayHeld:false});
    write(QUEUE,q);renderPanel();scheduleFlush();
  }`,
'enqueue provenance');

once(
`    for(const [id,row] of b){const old=a.get(id);if(!old||!eq(old,row))enqueue(dataset,id,'upsert',row,getVersion(dataset,id))}
    for(const [id,row] of a){if(!b.has(id))enqueue(dataset,id,'delete',row,getVersion(dataset,id))}`,
`    for(const [id,row] of b){const old=a.get(id);if(!old||!eq(old,row))enqueue(dataset,id,'upsert',row,getVersion(dataset,id),dataset===INV?'live-save':'')}
    for(const [id,row] of a){if(!b.has(id))enqueue(dataset,id,'delete',row,getVersion(dataset,id),dataset===INV?'live-save':'')}`,
'live-save tagging');

once(
`        if(!rr){enqueue(dataset,id,'upsert',row,0);audit.push({dataset,id,action:'adopt-local-only'});continue}`,
`        if(!rr){
          if(dataset===INV){audit.push({dataset,id,action:'replay-held-local-only'});continue}
          enqueue(dataset,id,'upsert',row,0);audit.push({dataset,id,action:'adopt-local-only'});continue
        }`,
'bootstrap local-only guard');

once(
`        if(rowMs(row)>rowMs(rr.payload)+1000&&!eq(row,rr.payload)){enqueue(dataset,id,'upsert',row,rr.version);audit.push({dataset,id,action:'adopt-newer-local'})}`,
`        if(rowMs(row)>rowMs(rr.payload)+1000&&!eq(row,rr.payload)){
          if(dataset===INV){audit.push({dataset,id,action:'replay-held-newer-local'});continue}
          enqueue(dataset,id,'upsert',row,rr.version);audit.push({dataset,id,action:'adopt-newer-local'})
        }`,
'bootstrap newer-local guard');

once(
`      const m=q[i];if(m.blocked)continue;
      try{`,
`      const m=q[i];if(m.blocked||m.replayHeld)continue;
      if(m.datasetKey===INV&&m.op==='upsert'&&m.source!=='live-save'){
        m.replayHeld=true;
        m.replayHoldReason='build145-unproven-inventory-replay';
        m.replayHeldAt=m.replayHeldAt||nowIso();
        continue;
      }
      try{`,
'queue replay quarantine');

fs.writeFileSync(output,s);
console.log(`Build145 integrated Build072 written to ${output}`);
