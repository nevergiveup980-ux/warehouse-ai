import assert from 'node:assert/strict';

const normalize=x=>({...x,id:Number(x.id),date:x.date||'',time:x.time||''});
const identity=x=>x.id?`id:${x.id}`:`fp:${[x.date,x.time,x.type,x.po,x.roll,x.product,x.collection,x.colour,x.quantity,x.unit,x.location,x.customer,x.supplier].map(v=>String(v??'').trim().toLowerCase()).join('|')}`;
const stamp=x=>{
  for(const v of [x.updatedAt,x.completedAt,x.appliedAt,x.reconciledAt,x.createdAt]){
    const n=Date.parse(v||'');if(Number.isFinite(n))return n;
  }
  const n=Date.parse(`${x.date||''}T${x.time||'00:00'}:00`);return Number.isFinite(n)?n:0;
};
const merge=(localRows,cloudRows)=>{
  const map=new Map();
  for(const row of cloudRows){const n=normalize(row);map.set(identity(n),n)}
  for(const row of localRows){const n=normalize(row),k=identity(n),prior=map.get(k);if(!prior||stamp(n)>=stamp(prior))map.set(k,n)}
  return [...map.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.time).localeCompare(String(a.time))||stamp(b)-stamp(a));
};

const local=[
  {id:1,date:'2026-09-04',time:'09:00',type:'Shipping',updatedAt:'2026-09-04T09:00:00Z'},
  {id:2,date:'2026-09-03',time:'09:00',type:'Receiving'}
];
const cloud=[
  {id:3,date:'2026-09-08',time:'08:00',type:'Supplier Pickup'},
  {id:4,date:'2026-09-09',time:'10:00',type:'Carpet Cutting',po:'181603'},
  {id:5,date:'2026-09-10',time:'11:00',type:'Carpet Cutting',po:'181572'}
];
let out=merge(local,cloud);
assert.deepEqual([...new Set(out.map(x=>x.date))].slice(0,5),['2026-09-10','2026-09-09','2026-09-08','2026-09-04','2026-09-03']);
assert.equal(out.length,5);

out=merge(
  [{id:9,date:'2026-09-10',status:'Waiting',updatedAt:'2026-09-10T10:00:00Z'}],
  [{id:9,date:'2026-09-10',status:'Completed',updatedAt:'2026-09-10T11:00:00Z'}]
);
assert.equal(out.length,1);
assert.equal(out[0].status,'Completed');

out=merge(
  [{id:9,date:'2026-09-10',status:'Completed',updatedAt:'2026-09-10T12:00:00Z'}],
  [{id:9,date:'2026-09-10',status:'Waiting',updatedAt:'2026-09-10T11:00:00Z'}]
);
assert.equal(out[0].status,'Completed');

console.log('Warehouse Build117 command history merge: 5/5 PASS');
