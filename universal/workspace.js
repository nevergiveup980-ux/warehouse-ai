/* RUNLU Warehouse OS — Universal workspace runtime. Customer-owned local data by default. */
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
function trialState(){return {status:isReady()?'local':'not-configured',daysRemaining:null,expiresAt:null}}
function subscriptionState(){return trialState()}
function role(){return String(session()?.role||'signed-out').toLowerCase()}
function can(action){const needed=ACTION_ROLE[action]||'owner';return (ROLES[role()]||0)>=(ROLES[needed]||99)}
function feature(name){const w=workspace();return !!w?.config?.features?.[name]}
function setSession(input){const w=workspace();if(!w)throw new Error('Workspace is not configured.');const x=input||{},r=String(x.role||'viewer').toLowerCase();if(!ROLES[r])throw new Error('Unknown role.');return writeJson(SESSION_KEY,{organizationId:w.organizationId,warehouseId:w.warehouseId,userId:String(x.userId||''),username:String(x.username||''),displayName:String(x.displayName||'Local User'),role:r,updatedAt:new Date().toISOString()})}
function setDevelopmentSession(input){return setSession(input)}
function ensureSession(){const s=session(),w=workspace();if(!w||!s)return null;if(s.organizationId!==w.organizationId||s.warehouseId!==w.warehouseId){clearSession();return null}return s}
function clearSession(){localStorage.removeItem(SESSION_KEY)}
function updateWorkspace(patch){const w=workspace();if(!w)throw new Error('Workspace is not configured.');const next=Object.assign({},w,patch||{}, {updatedAt:new Date().toISOString()});writeJson(WORKSPACE_KEY,next);return next}
function resetWorkspace(){if(!can('deleteWorkspace'))throw new Error('Owner role required.');clearSession();localStorage.removeItem(WORKSPACE_KEY)}
global.RUNLUWorkspace=Object.freeze({WORKSPACE_KEY,SESSION_KEY,ROLES,ACTION_ROLE,workspace,session,isReady,trialState,subscriptionState,role,can,feature,setSession,setDevelopmentSession,ensureSession,clearSession,updateWorkspace,resetWorkspace});
})(typeof window!=='undefined'?window:globalThis);
