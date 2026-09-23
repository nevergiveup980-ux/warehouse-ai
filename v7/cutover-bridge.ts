import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.10.0";
const REPO="nevergiveup980-ux/warehouse-ai", ACTOR="nevergiveup980-ux", REF="refs/heads/main";
const WF="/.github/workflows/warehouse-v7-real-snapshot-dryrun.yml@refs/heads/main", AUD="warehouse-v7-cutover";
const TENANT="e2d45722-186b-4b4f-af16-38709a0113ee", OWNER="b360c5a0-1736-4e17-b82c-22ea720603c1";
const MD5="27f36fc740ac29800d7463bfe6fec140", ROWS=787, EXPECTED_SQL_LINES=3423;
const BASELINE={products:309,locations:97,stock_items:82,carpet_rolls:152,commands:234,movements:234,events:234};
const FINAL={products:311,locations:97,stock_items:82,carpet_rolls:208,commands:290,movements:290,events:290};
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const allowed=new Set(["stage_legacy_record","stage_derived_carpet_product","classify_legacy_record","import_valid_product","import_valid_location","import_valid_stock_item","import_valid_carpet_roll"]);
const reply=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const nums=(x:any)=>({products:Number(x.products),locations:Number(x.locations),stock_items:Number(x.stock_items),carpet_rolls:Number(x.carpet_rolls),commands:Number(x.commands),movements:Number(x.movements),events:Number(x.events)});
const same=(a:any,b:any)=>Object.keys(b).every(k=>Number(a[k])===Number(b[k]));
Deno.serve(async(req)=>{
 if(req.method!=="POST") return reply(405,{error:"METHOD_NOT_ALLOWED"});
 try{
  const a=req.headers.get("authorization")||""; if(!a.startsWith("Bearer ")) return reply(401,{error:"GITHUB_OIDC_REQUIRED"});
  const {payload}=await jwtVerify(a.slice(7),JWKS,{issuer:"https://token.actions.githubusercontent.com",audience:AUD});
  if(payload.repository!==REPO||payload.actor!==ACTOR||payload.ref!==REF||typeof payload.workflow_ref!=="string"||!payload.workflow_ref.endsWith(WF)) return reply(403,{error:"OIDC_SCOPE_DENIED"});
  const body=await req.json();
  if(body.confirm!=="PRODUCTION_OPENING_IMPORT"||body.tenant!==TENANT||body.actor!==OWNER||body.expected_source_md5!==MD5||Number(body.expected_source_rows)!==ROWS) return reply(400,{error:"CUTOVER_CONFIRMATION_MISMATCH"});
  const importSql=String(body.import_sql||""); if(!importSql||importSql.length>8_000_000) return reply(400,{error:"IMPORT_SQL_INVALID"});
  const statements=importSql.split("\n").filter((x:string)=>x.trim().length);
  if(statements.length!==EXPECTED_SQL_LINES) return reply(400,{error:"IMPORT_SQL_STATEMENT_COUNT_MISMATCH",count:statements.length,expected:EXPECTED_SQL_LINES});
  const cleanup="delete from warehouse_v7.migration_staging where tenant_id='"+TENANT+"'::uuid and classification<>'imported' and source_dataset in ('runlu_product_master_v21','derived_carpet_product_v6','derived_location_v6','runlu_inventory_records_v21','derived_inventory_item_v6','runlu_carpet_inventory_v52','derived_carpet_roll_v6');";
  if(statements[0]!==cleanup) return reply(400,{error:"IMPORT_SQL_CLEANUP_SHAPE_VIOLATION"});
  for(const s of statements.slice(1)){
    const mm=s.match(/^select warehouse_v7\.([a-z_]+)\(/);
    if(!mm||!allowed.has(mm[1])||!s.endsWith(";")) return reply(400,{error:"IMPORT_SQL_SHAPE_VIOLATION"});
  }
  const db=Deno.env.get("SUPABASE_DB_URL"); if(!db) return reply(500,{error:"DB_URL_MISSING"});
  const sql=postgres(db,{prepare:false,max:1,idle_timeout:5});
  try{
   const result=await sql.begin(async tx=>{
    await tx.unsafe(`set local request.jwt.claim.sub='${OWNER}'`);
    const locks=await tx`select * from warehouse_v7.production_cutover_lock where tenant_id=${TENANT}::uuid for update`;
    const l=locks[0]; if(!l) throw new Error("CUTOVER_LOCK_MISSING");
    if(String(l.actor_id)!==OWNER||l.source_snapshot_md5!==MD5||Number(l.source_live_rows)!==ROWS) throw new Error("CUTOVER_SOURCE_LOCK_MISMATCH");
    const countRows=async()=>nums((await tx`select
      (select count(*)::int from warehouse_v7.product where tenant_id=${TENANT}::uuid) products,
      (select count(*)::int from warehouse_v7.location where tenant_id=${TENANT}::uuid) locations,
      (select count(*)::int from warehouse_v7.stock_item where tenant_id=${TENANT}::uuid) stock_items,
      (select count(*)::int from warehouse_v7.carpet_roll where tenant_id=${TENANT}::uuid) carpet_rolls,
      (select count(*)::int from warehouse_v7.command where tenant_id=${TENANT}::uuid and status='committed') commands,
      (select count(*)::int from warehouse_v7.inventory_movement where tenant_id=${TENANT}::uuid) movements,
      (select count(*)::int from warehouse_v7.event where tenant_id=${TENANT}::uuid) events`)[0]);
    const before=await countRows();
    if(l.status==="RECONCILED"){
      if(same(before,FINAL)) return before;
      if(!same(before,BASELINE)) throw new Error("CUTOVER_RECONCILED_STATE_DRIFT");
      await tx.unsafe(importSql);
      const after=await countRows();
      const bad=(await tx`select count(*)::int n from warehouse_v7.migration_staging where tenant_id=${TENANT}::uuid and classification<>'imported' and imported_entity_id is not null`)[0];
      if(!same(after,FINAL)||Number(bad.n)!==0) throw new Error("CUTOVER_RECONCILIATION_FAILED");
      await tx`update warehouse_v7.production_cutover_lock set reconciled_at=now() where tenant_id=${TENANT}::uuid`;
      return after;
    }
    if(l.status!=="LOCKED") throw new Error("CUTOVER_NOT_LOCKED");
    if(Object.values(before).some((v:any)=>Number(v)!==0)) throw new Error("CUTOVER_TARGET_NOT_EMPTY");
    await tx`update warehouse_v7.production_cutover_lock set status='IMPORTING' where tenant_id=${TENANT}::uuid`;
    await tx.unsafe(importSql);
    const after=await countRows();
    const bad=(await tx`select count(*)::int n from warehouse_v7.migration_staging where tenant_id=${TENANT}::uuid and classification<>'imported' and imported_entity_id is not null`)[0];
    if(!same(after,FINAL)||Number(bad.n)!==0) throw new Error("CUTOVER_RECONCILIATION_FAILED");
    await tx`update warehouse_v7.production_cutover_lock set status='RECONCILED',reconciled_at=now() where tenant_id=${TENANT}::uuid`;
    return after;
   });
   return reply(200,{status:"PRODUCTION_OPENING_IMPORT_RECONCILED",counts:result});
  }finally{await sql.end({timeout:1});}
 }catch(e){return reply(409,{error:String(e instanceof Error?e.message:e)});}
});