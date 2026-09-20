#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HOST='127.0.0.1';
const PORT=Number(process.env.RUNLU_V7_LOCAL_PORT || 8787);
const DB=process.env.PGDATABASE || '';
const TENANT=process.env.RUNLU_V7_TENANT || '';
const ACTOR=process.env.RUNLU_V7_ACTOR || '';
const DEVICE='V7_LOCAL_DISPOSABLE_WORKBENCH';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES=new Set(['open','resolved','needs_review']);
const EXECUTION_STATUSES=new Set(['open','completed','all']);
const KINDS=new Set(['STANDARD','SPECIAL']);
const LIFECYCLES=new Set(['draft','in_progress','completed','archived']);
const FULFILLMENT=new Set(['unverified','pending','received','backorder','ready_for_pickup','picked_up','completed']);

if(DB!=='warehouse_v7_test') throw new Error('LOCAL_WORKBENCH_REFUSES_DATABASE:'+DB);
if(!UUID.test(TENANT)) throw new Error('RUNLU_V7_TENANT_REQUIRED');
if(!UUID.test(ACTOR)) throw new Error('RUNLU_V7_ACTOR_REQUIRED');
if(!Number.isInteger(PORT) || PORT<1024 || PORT>65535) throw new Error('RUNLU_V7_LOCAL_PORT_INVALID');

const conn=[
  'host='+(process.env.PGHOST || '127.0.0.1'),
  'port='+(process.env.PGPORT || '5432'),
  'dbname='+DB,
  'user='+(process.env.PGUSER || 'postgres'),
  'password='+(process.env.PGPASSWORD || 'postgres'),
].join(' ');

function q(v){ return "'" + String(v).replaceAll("'","''") + "'"; }
function sql(statement){
  const out=execFileSync('psql',[conn,'-v','ON_ERROR_STOP=1','-Atc',statement],{
    encoding:'utf8',
    env:{...process.env,PGPASSWORD:process.env.PGPASSWORD || 'postgres'},
    stdio:['ignore','pipe','pipe'],
  });
  const lines=out.split(/\r?\n/).map(x=>x.trim()).filter(x=>x && x!=='SET');
  return lines.at(-1) || '';
}
function queryJson(statement){ const raw=sql(statement); return raw ? JSON.parse(raw) : null; }
function send(res,status,body,type='application/json; charset=utf-8'){
  const payload=type.startsWith('application/json') ? JSON.stringify(body) : String(body);
  res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'});
  res.end(payload);
}
function requestIsLoopback(req){
  const a=req.socket.remoteAddress || '';
  return a==='127.0.0.1' || a==='::1' || a==='::ffff:127.0.0.1';
}
function list(status){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.list_order_exception_workbench('+q(TENANT)+'::uuid,'+q(status)+'::text)::text;');
}
function getCase(caseId){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.get_order_exception_workbench_case('+q(TENANT)+'::uuid,'+q(caseId)+'::uuid)::text;');
}
function executionList(status){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.list_order_execution_workbench('+q(TENANT)+'::uuid,'+q(status)+'::text)::text;');
}
function executionGet(orderId){
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.get_order_execution_workbench_task('+q(TENANT)+'::uuid,'+q(orderId)+'::uuid)::text;');
}
function executeOrderTask(body){
  const orderId=String(body.order_id || ''), commandId=String(body.command_id || '');
  const stockId=body.stock_item_id ? String(body.stock_item_id) : null;
  const orderVersion=Number(body.expected_order_version), stockVersion=Number(body.expected_stock_version), quantity=Number(body.quantity);
  if(!UUID.test(orderId)) throw Object.assign(new Error('ORDER_ID_REQUIRED'),{http:400});
  if(!UUID.test(commandId)) throw Object.assign(new Error('COMMAND_ID_REQUIRED'),{http:400});
  if(stockId!==null && !UUID.test(stockId)) throw Object.assign(new Error('STOCK_ITEM_ID_INVALID'),{http:400});
  if(!Number.isInteger(orderVersion) || orderVersion<1) throw Object.assign(new Error('EXPECTED_ORDER_VERSION_REQUIRED'),{http:400});
  if(!Number.isInteger(stockVersion) || stockVersion<0) throw Object.assign(new Error('EXPECTED_STOCK_VERSION_REQUIRED'),{http:400});
  if(!Number.isFinite(quantity) || quantity<=0) throw Object.assign(new Error('INVALID_EXECUTION_QUANTITY'),{http:400});
  const task=executionGet(orderId);
  if(!task) throw Object.assign(new Error('ORDER_EXECUTION_TASK_NOT_FOUND'),{http:404});
  if(task.task_status!=='open') throw Object.assign(new Error('ORDER_EXECUTION_TASK_COMPLETED'),{http:409});
  if(task.flow==='INBOUND'){
    if(!stockId) throw Object.assign(new Error('INBOUND_STOCK_ITEM_ID_REQUIRED'),{http:400});
    return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.receive_bound_order_stock('+q(TENANT)+'::uuid,'+q(commandId)+'::uuid,'+q(orderId)+'::uuid,'+String(orderVersion)+'::bigint,'+q(stockId)+'::uuid,'+String(stockVersion)+'::bigint,'+String(quantity)+'::numeric,jsonb_build_object(\'workbench\',\'local_execution\'),'+q(ACTOR)+'::uuid,'+q(DEVICE)+'::text)::text;');
  }
  return queryJson('set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.ship_bound_order_stock('+q(TENANT)+'::uuid,'+q(commandId)+'::uuid,'+q(orderId)+'::uuid,'+String(orderVersion)+'::bigint,'+String(stockVersion)+'::bigint,'+String(quantity)+'::numeric,jsonb_build_object(\'workbench\',\'local_execution\'),'+q(ACTOR)+'::uuid,'+q(DEVICE)+'::text)::text;');
}
function resolveCase(body){
  const caseId=String(body.case_id || ''), commandId=String(body.command_id || '');
  const expected=Number(body.expected_version), kind=String(body.order_kind || '');
  const lifecycle=String(body.lifecycle || ''), fulfillment=String(body.fulfillment_status || '');
  const fields=body.fields && typeof body.fields==='object' && !Array.isArray(body.fields) ? body.fields : {};
  const note=String(body.resolution_note || '');
  if(!UUID.test(caseId)) throw Object.assign(new Error('CASE_ID_REQUIRED'),{http:400});
  if(!UUID.test(commandId)) throw Object.assign(new Error('COMMAND_ID_REQUIRED'),{http:400});
  if(!Number.isInteger(expected) || expected<1) throw Object.assign(new Error('EXPECTED_VERSION_REQUIRED'),{http:400});
  if(!KINDS.has(kind)) throw Object.assign(new Error('ORDER_KIND_INVALID'),{http:400});
  if(!LIFECYCLES.has(lifecycle)) throw Object.assign(new Error('LIFECYCLE_INVALID'),{http:400});
  if(!FULFILLMENT.has(fulfillment)) throw Object.assign(new Error('FULFILLMENT_STATUS_INVALID'),{http:400});
  if(!note.trim()) throw Object.assign(new Error('RESOLUTION_NOTE_REQUIRED'),{http:400});
  return queryJson(
    'set request.jwt.claim.sub='+q(ACTOR)+'; select warehouse_v7.resolve_order_exception_create_order('+
    q(TENANT)+'::uuid,'+q(commandId)+'::uuid,'+q(caseId)+'::uuid,'+String(expected)+'::bigint,'+
    q(kind)+'::text,'+q(lifecycle)+'::text,'+q(fulfillment)+'::text,'+q(JSON.stringify(fields))+'::jsonb,'+
    q(note)+'::text,'+q(ACTOR)+'::uuid,'+q(DEVICE)+'::text)::text;'
  );
}

const STATIC=new Map([
  ['/','order-exception-workbench.html'],
  ['/order-exception-workbench.html','order-exception-workbench.html'],
  ['/order-execution-workbench.html','order-execution-workbench.html'],
  ['/order-execution-local-api-client.js','order-execution-local-api-client.js'],
  ['/order-execution-workbench.js','order-execution-workbench.js'],
  ['/order-exception-local-api-client.js','order-exception-local-api-client.js'],
  ['/order-exception-workbench-adapter.js','order-exception-workbench-adapter.js'],
  ['/order-exception-api-client.js','order-exception-api-client.js'],
  ['/order-exception-engineering-auth.js','order-exception-engineering-auth.js'],
  ['/order-exception-engineering-config.js','order-exception-engineering-config.js'],
  ['/order-exception-workbench.js','order-exception-workbench.js'],
]);
async function bodyJson(req){
  const chunks=[]; let size=0;
  for await (const chunk of req){
    size+=chunk.length;
    if(size>65536) throw Object.assign(new Error('REQUEST_TOO_LARGE'),{http:413});
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('INVALID_JSON'),{http:400}); }
}

const server=http.createServer(async(req,res)=>{
  if(!requestIsLoopback(req)) return send(res,403,{error:'LOCALHOST_ONLY'});
  try{
    const url=new URL(req.url || '/','http://'+HOST+':'+PORT);
    if(req.method==='GET' && url.pathname==='/healthz'){
      const data=list('open');
      return send(res,200,{ok:true,data:{mode:'V7_DISPOSABLE_LOCAL_ENGINEERING',database:sql('select current_database();'),tenant_id:TENANT,open_cases:data?.summary?.total ?? null,production_reachable:false}});
    }
    if(req.method==='GET' && url.pathname==='/order-execution-local-engineering-config.js'){
      return send(res,200,"window.RUNLU_V7_ORDER_EXECUTION_LOCAL_CONFIG = Object.freeze({endpoint:'/api/order-execution'});\n",'application/javascript; charset=utf-8');
    }
    if(req.method==='GET' && url.pathname==='/order-exception-local-engineering-config.js'){
      return send(res,200,"window.RUNLU_V7_LOCAL_ENGINEERING_CONFIG = Object.freeze({endpoint:'/api/order-exception'});\n",'application/javascript; charset=utf-8');
    }
    if(url.pathname==='/api/order-execution' && req.method==='GET'){
      const action=url.searchParams.get('action') || 'list';
      if(action==='list'){
        const status=url.searchParams.get('status') || 'open';
        if(!EXECUTION_STATUSES.has(status)) return send(res,400,{error:'INVALID_EXECUTION_STATUS'});
        return send(res,200,{ok:true,data:executionList(status)});
      }
      if(action==='get'){
        const orderId=url.searchParams.get('order_id') || '';
        if(!UUID.test(orderId)) return send(res,400,{error:'ORDER_ID_REQUIRED'});
        const detail=executionGet(orderId);
        return detail ? send(res,200,{ok:true,data:detail}) : send(res,404,{ok:false,error:'ORDER_EXECUTION_TASK_NOT_FOUND'});
      }
      return send(res,400,{error:'UNKNOWN_ACTION'});
    }
    if(url.pathname==='/api/order-execution' && req.method==='POST'){
      const body=await bodyJson(req);
      if(body?.action!=='execute') return send(res,400,{error:'UNKNOWN_ACTION'});
      const result=executeOrderTask(body);
      return result?.status==='committed' ? send(res,200,{ok:true,data:result}) : send(res,409,{ok:false,data:result,error:result?.code || 'ORDER_EXECUTION_REJECTED'});
    }
    if(url.pathname==='/api/order-exception' && req.method==='GET'){
      const action=url.searchParams.get('action') || 'list';
      if(action==='list'){
        const status=url.searchParams.get('status') || 'open';
        if(!STATUSES.has(status)) return send(res,400,{error:'INVALID_STATUS'});
        return send(res,200,{ok:true,data:list(status)});
      }
      if(action==='get'){
        const caseId=url.searchParams.get('case_id') || '';
        if(!UUID.test(caseId)) return send(res,400,{error:'CASE_ID_REQUIRED'});
        const detail=getCase(caseId);
        return detail ? send(res,200,{ok:true,data:detail}) : send(res,404,{ok:false,error:'CASE_NOT_FOUND'});
      }
      return send(res,400,{error:'UNKNOWN_ACTION'});
    }
    if(url.pathname==='/api/order-exception' && req.method==='POST'){
      const body=await bodyJson(req);
      if(body?.action!=='resolve') return send(res,400,{error:'UNKNOWN_ACTION'});
      const result=resolveCase(body);
      return result?.status==='committed' ? send(res,200,{ok:true,data:result}) : send(res,409,{ok:false,data:result,error:result?.code || 'RESOLUTION_REJECTED'});
    }
    if(req.method==='GET' && STATIC.has(url.pathname)){
      const file=path.join(HERE,STATIC.get(url.pathname));
      const type=path.extname(file)==='.html' ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8';
      return send(res,200,fs.readFileSync(file,'utf8'),type);
    }
    return send(res,404,{error:'NOT_FOUND'});
  }catch(err){
    const message=err instanceof Error ? err.message : 'LOCAL_WORKBENCH_ERROR';
    const safe=/^[A-Z0-9_:.-]+$/.test(message) ? message : 'LOCAL_WORKBENCH_ERROR';
    return send(res,err?.http || 500,{error:safe});
  }
});
server.listen(PORT,HOST,()=>process.stdout.write('RUNLU V7 disposable workbench listening on http://'+HOST+':'+PORT+'\n'));
