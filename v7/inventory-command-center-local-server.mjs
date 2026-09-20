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
const STATIC=new Map([
  ['/','inventory-command-center.html'],
  ['/inventory-command-center.html','inventory-command-center.html'],
  ['/inventory-command-center-local-api-client.js','inventory-command-center-local-api-client.js'],
  ['/inventory-command-center-local-engineering-config.js','inventory-command-center-local-engineering-config.js'],
  ['/inventory-command-center.js','inventory-command-center.js'],
]);

const server=http.createServer((req,res)=>{
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
