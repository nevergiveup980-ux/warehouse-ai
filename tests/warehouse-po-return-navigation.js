/* RUNLU Warehouse OS · isolated navigation return helper.
   No persistence, no warehouse mutations. Integration only after PO entry point is identified. */
(function(root){
 'use strict';
 let origin=null;
 function remember(page,field){
  if(typeof page!=='string'||!/^[a-zA-Z][\w-]*$/.test(page))return false;
  origin={page,field:typeof field==='string'&&/^[a-zA-Z][\w-]*$/.test(field)?field:null};
  return true;
 }
 function peek(){return origin?{...origin}:null}
 function clear(){origin=null}
 function returnTo(showPage,doc){
  const ctx=peek();
  if(!ctx||typeof showPage!=='function'||!doc?.getElementById(ctx.page))return false;
  // Preserve context if navigation throws; never discard an unsaved form.
  showPage(ctx.page);
  if(ctx.field){const el=doc.getElementById(ctx.field);if(el&&typeof el.focus==='function')el.focus()}
  clear();return true;
 }
 root.RUNLUWarehouseReturnNav=Object.freeze({remember,peek,clear,returnTo});
})(typeof window!=='undefined'?window:globalThis);
