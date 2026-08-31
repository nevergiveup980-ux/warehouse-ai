/* RUNLU Warehouse OS — Universal V1 mature-core compatibility adapter. */
(function(global){
'use strict';
function need(name){const v=global[name];if(!v)throw new Error(name+' must load first.');return v}
function cfg(){const W=need('RUNLUWorkspace'),ws=W.workspace();if(!ws)throw new Error('Universal workspace is not configured.');return ws.config}
function storage(){return need('RUNLUUniversalStorage')}
function legacyKey(nameOrKey){const U=need('RUNLUUniversal');if(Object.prototype.hasOwnProperty.call(U.LEGACY_DATASETS,nameOrKey))return U.LEGACY_DATASETS[nameOrKey];return String(nameOrKey||'')}
function load(nameOrKey,fallback){return storage().get(legacyKey(nameOrKey),fallback===undefined?[]:fallback)}
function save(nameOrKey,value,meta){const W=need('RUNLUWorkspace');if(W.role()==='viewer')throw new Error('View-only users cannot change warehouse data.');const key=legacyKey(nameOrKey),result=storage().set(key,value);appendAudit({eventType:'dataset.saved',entityType:'dataset',entityId:key,payload:Object.assign({datasetKey:key},meta||{})});return result}
function remove(nameOrKey,meta){const W=need('RUNLUWorkspace');if(!W.can('manageWarehouse'))throw new Error('Manager role or above required.');const key=legacyKey(nameOrKey);storage().remove(key);appendAudit({eventType:'dataset.removed',entityType:'dataset',entityId:key,payload:Object.assign({datasetKey:key},meta||{})})}
function tagBaseUrl(){return cfg().tagBaseUrl||cfg().warehouse?.tagBaseUrl||''}
function company(){return cfg().company}
function warehouse(){return cfg().warehouse}
function features(){return cfg().features}
function appIdentity(){const W=need('RUNLUWorkspace'),ws=W.workspace(),s=W.ensureSession();return Object.freeze({product:'RUNLU Warehouse OS',edition:'Universal V1',organizationId:ws.organizationId,warehouseId:ws.warehouseId,userId:s.userId,role:s.role,companyName:cfg().company.name,warehouseName:cfg().warehouse.name})}
function auditKey(){return '__runlu_universal_audit_v1'}
function appendAudit(event){const S=storage(),W=need('RUNLUWorkspace'),s=W.ensureSession(),rows=S.get(auditKey(),[]),e=event||{};rows.unshift({id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random()),organizationId:S.context().organizationId,warehouseId:S.context().warehouseId,actorUserId:s.userId,actorRole:s.role,eventType:String(e.eventType||'unknown'),entityType:String(e.entityType||''),entityId:String(e.entityId||''),payload:e.payload||{},createdAt:new Date().toISOString()});if(rows.length>500)rows.length=500;S.set(auditKey(),rows);return rows[0]}
function audit(limit){const rows=storage().get(auditKey(),[]);return rows.slice(0,Math.max(1,Number(limit||100)))}
function compatibility(){const U=need('RUNLUUniversal'),W=need('RUNLUWorkspace');return {ready:W.isReady(),context:storage().context(),datasets:Object.entries(U.LEGACY_DATASETS).map(([name,key])=>({name,key,scopedKey:storage().key(key),present:storage().has(key)})),tagBaseUrl:tagBaseUrl(),features:features()}}
global.RUNLUCoreAdapter=Object.freeze({legacyKey,load,save,remove,tagBaseUrl,company,warehouse,features,appIdentity,appendAudit,audit,compatibility});
})(typeof window!=='undefined'?window:globalThis);
