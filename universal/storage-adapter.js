/* RUNLU Warehouse OS — Universal V1 tenant-scoped compatibility storage. */
(function(global){
'use strict';
function api(){if(!global.RUNLUUniversal)throw new Error('runtime-config.js must load first.');if(!global.RUNLUWorkspace)throw new Error('workspace.js must load first.');return {u:global.RUNLUUniversal,w:global.RUNLUWorkspace}}
function context(){const {w}=api(),ws=w.workspace(),s=w.ensureSession();if(!ws||!s)throw new Error('Universal workspace is not ready.');return {organizationId:ws.organizationId,warehouseId:ws.warehouseId,userId:s.userId,role:s.role}}
function key(legacyKey){const {u}=api();return u.scopedStorageKey(context(),legacyKey)}
function get(legacyKey,fallback){try{const raw=localStorage.getItem(key(legacyKey));return raw==null?fallback:JSON.parse(raw)}catch(_){return fallback}}
function set(legacyKey,value){localStorage.setItem(key(legacyKey),JSON.stringify(value));return value}
function remove(legacyKey){localStorage.removeItem(key(legacyKey))}
function has(legacyKey){return localStorage.getItem(key(legacyKey))!==null}
function list(){const {u}=api();return Object.entries(u.LEGACY_DATASETS).map(([name,legacyKey])=>({name,legacyKey,scopedKey:key(legacyKey),present:has(legacyKey)}))}
function seedEmpty(){const {u}=api();for(const legacyKey of Object.values(u.LEGACY_DATASETS)){if(!has(legacyKey))set(legacyKey,legacyKey===u.LEGACY_DATASETS.settings?{}:[])}return list()}
function importLegacySnapshot(snapshot){if(!global.RUNLUWorkspace.can('manageWarehouse'))throw new Error('Admin role required.');const {u}=api(),source=snapshot||{};for(const [name,legacyKey] of Object.entries(u.LEGACY_DATASETS)){if(Object.prototype.hasOwnProperty.call(source,name))set(legacyKey,source[name])}return list()}
function exportSnapshot(){const {u}=api(),out={schemaVersion:1,exportedAt:new Date().toISOString(),context:context(),datasets:{}};for(const [name,legacyKey] of Object.entries(u.LEGACY_DATASETS))out.datasets[name]=get(legacyKey,legacyKey===u.LEGACY_DATASETS.settings?{}:[]);return out}
function clearTenantData(){if(!global.RUNLUWorkspace.can('deleteWorkspace'))throw new Error('Owner role required.');for(const item of list())localStorage.removeItem(item.scopedKey)}
global.RUNLUUniversalStorage=Object.freeze({context,key,get,set,remove,has,list,seedEmpty,importLegacySnapshot,exportSnapshot,clearTenantData});
})(typeof window!=='undefined'?window:globalThis);
