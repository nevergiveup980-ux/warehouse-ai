/* RUNLU Warehouse OS — Universal V1 workspace runtime. Isolated development only. */
(function(global){
'use strict';
const WORKSPACE_KEY='runlu-universal-v1::workspace';
const SESSION_KEY='runlu-universal-v1::session';
const ROLES=Object.freeze({owner:5,admin:4,manager:3,member:2,viewer:1});
const ACTION_ROLE=Object.freeze({
  view:'viewer',count:'member',receive:'member',transfer:'member',cutPick:'member',ship:'member',returnStock:'member',
  editInventory:'manager',manageProducts:'manager',manageOrders:'manager',manageWarehouse:'admin',manageMembers:'admin',
  billing:'owner',deleteWorkspace:'owner'
});
function readJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v==null?fallback:v}catch(_){return fallback}}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value));return value}
function workspace(){return readJson(WORKSPACE_KEY,null)}
function session(){return readJson(SESSION_KEY,null)}
function isReady(){const w=workspace();return !!(w&&w.organizationId&&w.warehouseId&&w.config&&w.config.company&&w.config.warehouse)}
function trialState(now){const w=workspace();if(!w)return {status:'not-configured',daysRemaining:0,expiresAt:null};
  const created=new Date(w.createdAt||0);if(!Number.isFinite(created.getTime()))return {status:'invalid',daysRemaining:0,expiresAt:null};
  const days=Number(w.config?.product?.trialDays||14),expires=new Date(created.getTime()+days*86400000),t=now?new Date(now):new Date();
  const remaining=Math.max(0,Math.ceil((expires-t)/86400000));return {status:t<expires?'trial':'expired',daysRemaining:remaining,expiresAt:expires.toISOString()};}
function subscriptionState(){const w=workspace();const s=w?.subscription||{};if(s.status==='active'||s.status==='grace')return Object.assign({source:'development'},s);return trialState()}
function role(){return String(session()?.role||'owner').toLowerCase()}
function can(action){const needed=ACTION_ROLE[action]||'owner';return (ROLES[role()]||0)>=(ROLES[needed]||99)}
function feature(name){const w=workspace();return !!w?.config?.features?.[name]}
function setDevelopmentSession(input){const w=workspace();if(!w)throw new Error('Workspace is not configured.');const x=input||{};const r=String(x.role||'owner').toLowerCase();if(!ROLES[r])throw new Error('Unknown role.');return writeJson(SESSION_KEY,{organizationId:w.organizationId,warehouseId:w.warehouseId,userId:String(x.userId||'local-owner'),displayName:String(x.displayName||'Workspace Owner'),role:r,updatedAt:new Date().toISOString()});}
function ensureSession(){let s=session(),w=workspace();if(!w)return null;if(!s||s.organizationId!==w.organizationId||s.warehouseId!==w.warehouseId)s=setDevelopmentSession({});return s}
function updateWorkspace(patch){const w=workspace();if(!w)throw new Error('Workspace is not configured.');const next=Object.assign({},w,patch||{}, {updatedAt:new Date().toISOString()});writeJson(WORKSPACE_KEY,next);return next}
function resetWorkspace(){if(!can('deleteWorkspace'))throw new Error('Owner role required.');localStorage.removeItem(SESSION_KEY);localStorage.removeItem(WORKSPACE_KEY);}
global.RUNLUWorkspace=Object.freeze({WORKSPACE_KEY,SESSION_KEY,ROLES,ACTION_ROLE,workspace,session,isReady,trialState,subscriptionState,role,can,feature,setDevelopmentSession,ensureSession,updateWorkspace,resetWorkspace});
})(typeof window!=='undefined'?window:globalThis);
