import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const HOST='127.0.0.1';
const PORT=Number(process.env.RUNLU_V7_INVENTORY_PORT || '8788');
const DB=process.env.PGDATABASE || 'warehouse_v7_test';
const TENANT=String(process.env.RUNLU_V7_TENANT || '');
const ACTOR=String(process.env.RUNLU_V7_ACTOR || '');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=new Set(['ALL','STOCK','CARPET','SHARED','REVIEW','CONFLICT']);

if(DB!=='warehouse_v7_test')throw new Error('INVENTORY_COMMAND_CENTER_REFUSES_DATABASE:'+DB);
if(!UUID.test(TENANT))throw new Error('RUNLU_V7_TENANT_REQUIRED');
if(!UUID.test(ACTOR))throw new Error('RUNLU_V7_ACTOR_REQUIRED');
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw new Error('RUNLU_V7_INVENTORY_PORT_INVALID');

const conn=[
  'host='+(process.env.PGHOST || '127.0.0.1'),
  'port='+(process.env.PGPORT || '5432'),
  'dbname='+DB,
  'user='+(process.env.PGUSER || 'postgres'),
  'password='+(process.env.PGPASSWORD || 'postgres'),
].join(' ');

function q(v){return "'" + String(v).replaceAll("'","''") + "'";}
function sql(statement){
  const out=execFileSync('psql',[conn,'-v','ON_ERROR_STOP=1','-Atc',statement],{
    encoding:'utf8',env:{...process.env,PGPASSWORD:process.env.PGPASSWORD || 'postgres'},stdio:['ignore','pipe','pipe']
  });
  const lines=out.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&x!=='SET');
  return lines.at(-1)||'';
}
function queryJson(statement){const raw=sql(statement);return raw?JSON.parse(raw):null;}
function send(res,status,body,type='application/json; charset=utf-8'){
  const payload=type.startsWith('application/json')?JSON.stringify(body):String(body);
  res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'});
  res.end(payload);
}
function loopback(req){
  const a=req.socket.remoteAddress || '';
  return a==='127.0.0.1'||a==='::1'||a==='::ffff:127.0.0.1';
}
function overview(){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.get_inventory_command_center('+q(TENANT)+'::uuid)::text;');
}
function list(kind,query,location,limit){
  const qs=query?q(query)+'::text':'null',ls=location?q(location)+'::text':'null';
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.list_inventory_command_center('+
    q(TENANT)+'::uuid,'+q(kind)+'::text,'+qs+','+ls+','+String(limit)+'::integer)::text;');
}
function reviewList(status){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.list_carpet_review_workbench('+
    q(TENANT)+'::uuid,'+q(status)+'::text)::text;');
}
function reviewGet(dataset,record){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.get_carpet_review_workbench_case('+
    q(TENANT)+'::uuid,'+q(dataset)+'::text,'+q(record)+'::text)::text;');
}
function reviewGate(){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.get_carpet_review_promotion_gate('+
    q(TENANT)+'::uuid)::text;');
}
function reviewPreview(dataset,record){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.preview_carpet_review_promotion_case('+
    q(TENANT)+'::uuid,'+q(dataset)+'::text,'+q(record)+'::text)::text;');
}
function reviewResolve(dataset,record,version,resolution){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.resolve_carpet_review('+
    q(TENANT)+'::uuid,'+q(dataset)+'::text,'+q(record)+'::text,'+String(version)+'::bigint,'+
    q(JSON.stringify(resolution))+'::jsonb,'+q(ACTOR)+'::uuid)::text;');
}
function reviewReopen(dataset,record,version){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.reopen_carpet_review('+
    q(TENANT)+'::uuid,'+q(dataset)+'::text,'+q(record)+'::text,'+String(version)+'::bigint,'+q(ACTOR)+'::uuid)::text;');
}
function validReviewCase(dataset,record){
  return (dataset==='derived_carpet_review_v7'||dataset==='derived_carpet_identity_v7')&&record&&record.length<=240;
}
async function readJsonBody(req){
  return await new Promise((resolve,reject)=>{
    let raw='';req.setEncoding('utf8');
    req.on('data',chunk=>{raw+=chunk;if(raw.length>20000){reject(new Error('REQUEST_TOO_LARGE'));req.destroy();}});
    req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('INVALID_JSON'));}});
    req.on('error',reject);
  });
}
function safeReviewError(err){
  const raw=String(err?.stderr||err?.message||'CARPET_REVIEW_LOCAL_ERROR');
  const known=[
    'CARPET_REVIEW_VERSION_CONFLICT','CARPET_REVIEW_LOCATION_REQUIRED','CARPET_REVIEW_MEASURE_REQUIRED',
    'CARPET_REVIEW_PRODUCT_NAME_REQUIRED','CARPET_REVIEW_COMPANY_ROLL_REQUIRED','CARPET_REVIEW_MEASURE_INVALID',
    'CARPET_REVIEW_EXPLICIT_RESOLUTION_REQUIRED','CARPET_REVIEW_RESOLUTION_FIELD_UNSUPPORTED',
    'CARPET_REVIEW_CASE_NOT_FOUND','CARPET_REVIEW_RESOLUTION_NOT_FOUND','CARPET_REVIEW_ALREADY_PROMOTED',
    'ADMIN_ROLE_REQUIRED'
  ];
  return known.find(x=>raw.includes(x))||'CARPET_REVIEW_LOCAL_ERROR';
}
const STATIC=new Map([
  ['/','inventory-command-center.html'],
  ['/inventory-command-center.html','inventory-command-center.html'],
  ['/inventory-command-center-local-api-client.js','inventory-command-center-local-api-client.js'],
  ['/inventory-command-center-local-engineering-config.js','inventory-command-center-local-engineering-config.js'],
  ['/inventory-command-center.js','inventory-command-center.js'],
  ['/carpet-review-workbench.html','carpet-review-workbench.html'],
  ['/carpet-review-workbench.js','carpet-review-workbench.js'],
  ['/carpet-review-workbench-local-api-client.js','carpet-review-workbench-local-api-client.js'],
  ['/carpet-review-workbench-local-engineering-config.js','carpet-review-workbench-local-engineering-config.js'],
]);

const server=http.createServer(async(req,res)=>{
  if(!loopback(req))return send(res,403,{error:'LOCALHOST_ONLY'});
  try{
    const url=new URL(req.url||'/','http://'+HOST+':'+PORT);
    if(req.method==='GET'&&url.pathname==='/healthz'){
      const data=overview();
      return send(res,200,{ok:true,data:{mode:'V7_INVENTORY_DISPOSABLE_LOCAL_ENGINEERING',database:sql('select current_database();'),tenant_id:TENANT,carpet_physical_instances:data?.summary?.carpet_physical_instances??null,production_reachable:false}});
    }
    if(url.pathname==='/api/inventory-command-center'&&req.method==='GET'){
      const action=url.searchParams.get('action')||'overview';
      if(action==='overview')return send(res,200,{ok:true,data:overview()});
      if(action==='list'){
        const kind=String(url.searchParams.get('kind')||'ALL').toUpperCase();
        const query=String(url.searchParams.get('q')||'').trim()||null;
        const location=String(url.searchParams.get('location')||'').trim()||null;
        const limit=Number(url.searchParams.get('limit')||'50');
        if(!KINDS.has(kind))return send(res,400,{error:'INVALID_INVENTORY_KIND_FILTER'});
        if(query&&query.length>100)return send(res,400,{error:'INVALID_INVENTORY_QUERY'});
        if(location&&location.length>100)return send(res,400,{error:'INVALID_INVENTORY_LOCATION_FILTER'});
        if(!Number.isInteger(limit)||limit<1||limit>100)return send(res,400,{error:'INVALID_INVENTORY_LIMIT'});
        return send(res,200,{ok:true,data:list(kind,query,location,limit)});
      }
      return send(res,400,{error:'UNKNOWN_ACTION'});
    }
    if(url.pathname==='/api/inventory-command-center')return send(res,405,{error:'INVENTORY_COMMAND_CENTER_READ_ONLY'});
    if(url.pathname==='/api/carpet-review'&&req.method==='GET'){
      const action=url.searchParams.get('action')||'list';
      if(action==='list'){
        const status=String(url.searchParams.get('status')||'open').toLowerCase();
        if(!['open','resolved','all'].includes(status))return send(res,400,{error:'INVALID_CARPET_REVIEW_STATUS'});
        return send(res,200,{ok:true,data:reviewList(status)});
      }
      if(action==='get'||action==='preview'){
        const dataset=String(url.searchParams.get('dataset')||'');
        const record=String(url.searchParams.get('record')||'');
        if(!validReviewCase(dataset,record))return send(res,400,{error:'INVALID_CARPET_REVIEW_CASE'});
        const data=action==='get'?reviewGet(dataset,record):reviewPreview(dataset,record);
        return send(res,data?200:404,{ok:!!data,data});
      }
      if(action==='gate')return send(res,200,{ok:true,data:reviewGate()});
      return send(res,400,{error:'UNKNOWN_ACTION'});
    }
    if(url.pathname==='/api/carpet-review'&&req.method==='POST'){
      try{
        const body=await readJsonBody(req);
        const action=String(body.action||'');
        const dataset=String(body.source_dataset||'');
        const record=String(body.source_record_id||'');
        const version=Number(body.expected_version);
        if(!validReviewCase(dataset,record)||!Number.isInteger(version)||version<0){
          return send(res,400,{error:'INVALID_CARPET_REVIEW_REQUEST'});
        }
        if(action==='resolve'){
          if(!body.resolution||typeof body.resolution!=='object'||Array.isArray(body.resolution)){
            return send(res,400,{error:'INVALID_CARPET_REVIEW_RESOLUTION'});
          }
          return send(res,200,{ok:true,data:reviewResolve(dataset,record,version,body.resolution)});
        }
        if(action==='reopen')return send(res,200,{ok:true,data:reviewReopen(dataset,record,version)});
        return send(res,400,{error:'UNKNOWN_ACTION'});
      }catch(err){
        const safe=safeReviewError(err);
        const status=safe==='CARPET_REVIEW_VERSION_CONFLICT'?409:
          safe.endsWith('_NOT_FOUND')?404:
          safe==='ADMIN_ROLE_REQUIRED'?403:400;
        return send(res,status,{error:safe});
      }
    }
    if(req.method==='GET'&&STATIC.has(url.pathname)){
      const file=path.join(HERE,STATIC.get(url.pathname));
      const type=path.extname(file)==='.html'?'text/html; charset=utf-8':'application/javascript; charset=utf-8';
      return send(res,200,fs.readFileSync(file,'utf8'),type);
    }
    return send(res,404,{error:'NOT_FOUND'});
  }catch(err){
    const message=err instanceof Error?err.message:'LOCAL_INVENTORY_COMMAND_CENTER_ERROR';
    const safe=/^[A-Z0-9_:.-]+$/.test(message)?message:'LOCAL_INVENTORY_COMMAND_CENTER_ERROR';
    return send(res,500,{error:safe});
  }
});
server.listen(PORT,HOST,()=>process.stdout.write('RUNLU V7 Inventory Command Center listening on http://'+HOST+':'+PORT+'\n'));
