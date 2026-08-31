/* RUNLU Warehouse OS — Universal V1 cloud adapter.
 * Requires a separate Universal Supabase project. The mature production project is rejected.
 * Public/publishable Supabase keys may be supplied at runtime; AI provider secrets never belong here.
 */
(function(global){
'use strict';
const PROD_ORIGIN='https://ekrnknlawekeoszzkamd.supabase.co';
let state={url:'',publishableKey:'',accessToken:''};
function cleanUrl(v){const s=String(v||'').trim().replace(/\/+$/,'');if(!s)throw new Error('Universal cloud URL is required.');const u=new URL(s);if(u.protocol!=='https:')throw new Error('Universal cloud URL must use HTTPS.');if(u.origin===PROD_ORIGIN)throw new Error('Production Warehouse Supabase is blocked for Universal V1.');return u.origin}
function configure(input){const x=input||{};state={url:cleanUrl(x.url),publishableKey:String(x.publishableKey||'').trim(),accessToken:String(x.accessToken||'').trim()};if(!state.publishableKey)throw new Error('Supabase publishable key is required.');return status()}
function setAccessToken(token){state.accessToken=String(token||'').trim();return status()}
function status(){return Object.freeze({configured:!!(state.url&&state.publishableKey),authenticated:!!state.accessToken,url:state.url||'',productionBlocked:true})}
function headers(json=true){if(!state.url||!state.publishableKey)throw new Error('Universal cloud is not configured.');const h={apikey:state.publishableKey};if(state.accessToken)h.Authorization='Bearer '+state.accessToken;if(json)h['Content-Type']='application/json';return h}
async function request(path,options){const url=state.url+path;if(url.startsWith(PROD_ORIGIN))throw new Error('Production cloud request blocked.');const r=await fetch(url,{...(options||{}),headers:{...headers((options||{}).json!==false),...((options||{}).headers||{})}});const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch(_){body=text}if(!r.ok)throw new Error((body&&body.message)||('Universal cloud request failed: '+r.status));return body}
function requireWorkspace(){if(!global.RUNLUWorkspace?.isReady())throw new Error('Universal workspace is not ready.');const ws=global.RUNLUWorkspace.workspace(),s=global.RUNLUWorkspace.ensureSession();return {ws,s}}
async function createOrganization(input){const x=input||{};return request('/rest/v1/rpc/runlu_create_organization',{method:'POST',body:JSON.stringify({p_name:x.name,p_slug:x.slug,p_warehouse_name:x.warehouseName||'Main Warehouse',p_warehouse_code:x.warehouseCode||'MAIN',p_website_url:x.websiteUrl||null,p_support_email:x.supportEmail||null,p_currency:x.currency||'USD',p_locale:x.locale||'en',p_timezone:x.timezone||'UTC',p_warehouse_settings:x.warehouseSettings||{}})})}
async function fetchDatasets(){const {ws}=requireWorkspace();const q='?organization_id=eq.'+encodeURIComponent(ws.organizationId)+'&warehouse_id=eq.'+encodeURIComponent(ws.warehouseId)+'&select=dataset_key,payload,device_id,updated_at&order=updated_at.asc';return request('/rest/v1/tenant_datasets'+q,{method:'GET',json:false})}
async function upsertDataset(datasetKey,payload,deviceId){const {ws,s}=requireWorkspace();const row={organization_id:ws.organizationId,warehouse_id:ws.warehouseId,dataset_key:String(datasetKey),payload,device_id:String(deviceId||''),updated_by:s.userId};return request('/rest/v1/tenant_datasets?on_conflict=organization_id,scope_id,dataset_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)})}
async function appendAudit(event){const {ws,s}=requireWorkspace(),e=event||{};return request('/rest/v1/audit_events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({organization_id:ws.organizationId,warehouse_id:ws.warehouseId,actor_user_id:s.userId,event_type:String(e.eventType||'unknown'),entity_type:e.entityType||null,entity_id:e.entityId||null,payload:e.payload||{}})})}
async function health(){if(!state.accessToken)throw new Error('Sign-in token required.');return request('/rest/v1/warehouses?select=id&limit=1',{method:'GET',json:false})}
global.RUNLUUniversalCloud=Object.freeze({PROD_ORIGIN,configure,setAccessToken,status,createOrganization,fetchDatasets,upsertDataset,appendAudit,health});
})(typeof window!=='undefined'?window:globalThis);
