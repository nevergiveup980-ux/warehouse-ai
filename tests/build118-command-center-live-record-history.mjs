import assert from 'node:assert/strict';

const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null};
const identity=x=>{const id=num(x.id);if(id)return `id:${id}`;return 'fp:'+[x.date||'',x.time||'',x.type||'',x.po||'',x.roll||'',x.product||x.collection||'',x.colour||'',Number(x.quantity||0),x.unit||'',x.location||'',x.customer||x.supplier||''].map(v=>String(v).trim().toLowerCase()).join('|')};
const stamp=x=>{for(const v of [x._cloudUpdatedAt,x.updatedAt,x.completedAt,x.appliedAt,x.reconciledAt,x.createdAt]){const n=Date.parse(v||'');if(Number.isFinite(n))return n}const n=Date.parse(`${x.date||''}T${x.time||'00:00'}:00`);return Number.isFinite(n)?n:0};
const rowToOperation=row=>{const p=row.payload&&typeof row.payload==='object'?row.payload:{};const id=num(p.id)||num(row.record_id);return {...p,id:id||p.id||row.record_id,_cloudUpdatedAt:row.updated_at||p.updatedAt||''}};
const merge=(baseRows,liveRows)=>{const map=new Map();for(const row of baseRows||[]){const k=identity(row),prior=map.get(k);if(!prior||stamp(row)>=stamp(prior))map.set(k,row)}for(const row of liveRows||[]){const k=identity(row),prior=map.get(k);if(!prior||stamp(row)>=stamp(prior))map.set(k,row)}return [...map.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||''))||stamp(b)-stamp(a))};

const local=[
  {id:1,date:'2026-09-04',time:'09:00',type:'Shipping',updatedAt:'2026-09-04T15:00:00Z'},
  {id:2,date:'2026-09-03',time:'09:00',type:'Receiving'}
];
const liveRows=[
  {record_id:'1788892235016',updated_at:'2026-09-08T18:30:37Z',payload:{id:1788892235016,date:'2026-09-08',time:'12:25',type:'Supplier Pickup / Receiving / Put-away',po:'181365',status:'Completed'}},
  {record_id:'1788975505878',updated_at:'2026-09-09T18:24:40Z',payload:{id:1788975505878,date:'2026-09-09',time:'11:36',type:'Carpet Cutting',po:'181603',roll:'RC2288',status:'Completed'}},
  {record_id:'1789062274426',updated_at:'2026-09-10T17:44:49Z',payload:{id:1789062274426,date:'2026-09-10',time:'11:41',type:'Carpet Cutting',po:'181572',roll:'RC2289',status:'Completed'}}
];
const cloud=liveRows.map(rowToOperation);
let out=merge(local,cloud);
assert.deepEqual([...new Set(out.map(x=>x.date))],['2026-09-10','2026-09-09','2026-09-08','2026-09-04','2026-09-03']);
assert.equal(out.find(x=>x.po==='181603')?.roll,'RC2288');
assert.equal(out.find(x=>x.po==='181572')?.roll,'RC2289');

out=merge([{id:9,date:'2026-09-10',status:'Waiting',updatedAt:'2026-09-10T16:00:00Z'}],[{id:9,date:'2026-09-10',status:'Completed',_cloudUpdatedAt:'2026-09-10T17:00:00Z'}]);
assert.equal(out.length,1);
assert.equal(out[0].status,'Completed');

out=merge([{id:10,date:'2026-09-10',status:'Completed',updatedAt:'2026-09-10T18:00:00Z'}],[{id:10,date:'2026-09-10',status:'Waiting',_cloudUpdatedAt:'2026-09-10T17:00:00Z'}]);
assert.equal(out[0].status,'Completed');

console.log('Warehouse Build118 live Command Center history: 6/6 PASS');
