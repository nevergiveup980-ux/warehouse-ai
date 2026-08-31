/* RUNLU Warehouse OS — Universal V1 mature-core safety shim.
 * Loaded only inside the isolated preview before the mature application script.
 */
(function(global){
'use strict';
if(!global.RUNLUUniversal||!global.RUNLUWorkspace)throw new Error('Universal runtime must load before legacy-storage-shim.js');
if(!global.RUNLUWorkspace.isReady())throw new Error('Universal workspace setup is required before mature-core preview.');
global.RUNLUWorkspace.ensureSession();
const original={
 getItem:Storage.prototype.getItem,
 setItem:Storage.prototype.setItem,
 removeItem:Storage.prototype.removeItem,
 key:Storage.prototype.key,
 clear:Storage.prototype.clear
};
const workspace=global.RUNLUWorkspace.workspace(),session=global.RUNLUWorkspace.session();
const context={organizationId:workspace.organizationId,warehouseId:workspace.warehouseId,userId:session.userId,role:session.role};
const universalPrefix='runlu-universal-v1::';
function shouldScope(key){const k=String(key??'');return !!k&&!k.startsWith(universalPrefix)}
function physicalKey(key){const k=String(key??'');return shouldScope(k)?global.RUNLUUniversal.scopedStorageKey(context,k):k}
function isLocal(storage){return storage===global.localStorage}
Storage.prototype.getItem=function(key){return original.getItem.call(this,isLocal(this)?physicalKey(key):key)};
Storage.prototype.setItem=function(key,value){return original.setItem.call(this,isLocal(this)?physicalKey(key):key,String(value))};
Storage.prototype.removeItem=function(key){return original.removeItem.call(this,isLocal(this)?physicalKey(key):key)};
Storage.prototype.key=function(index){if(!isLocal(this))return original.key.call(this,index);const prefix=['runlu-universal-v1',context.organizationId,context.warehouseId,''].join('::'),logical=[];for(let i=0;i<this.length;i++){const raw=original.key.call(this,i);if(raw&&raw.startsWith(prefix))logical.push(raw.slice(prefix.length))}return logical[index]??null};
Storage.prototype.clear=function(){if(!isLocal(this))return original.clear.call(this);const keys=[];for(let i=0;i<this.length;i++){const raw=original.key.call(this,i);if(raw&&raw.startsWith(['runlu-universal-v1',context.organizationId,context.warehouseId,''].join('::')))keys.push(raw)}keys.forEach(k=>original.removeItem.call(this,k))};

// The universal preview must never call the mature production Supabase project.
const productionCloudOrigin='https://ekrnknlawekeoszzkamd.supabase.co';
const originalFetch=global.fetch?global.fetch.bind(global):null;
if(originalFetch){global.fetch=function(input,init){const url=typeof input==='string'?input:String(input&&input.url||'');if(url.startsWith(productionCloudOrigin)){console.warn('[Universal V1] blocked production cloud request:',url);return Promise.reject(new Error('Universal V1 preview blocks the production cloud endpoint.'))}return originalFetch(input,init)}}

global.RUNLULegacySafety=Object.freeze({context,physicalKey,productionCloudOrigin,restore:function(){Storage.prototype.getItem=original.getItem;Storage.prototype.setItem=original.setItem;Storage.prototype.removeItem=original.removeItem;Storage.prototype.key=original.key;Storage.prototype.clear=original.clear;if(originalFetch)global.fetch=originalFetch}});
})(window);
