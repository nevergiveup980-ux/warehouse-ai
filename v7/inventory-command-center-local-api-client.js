(() => {
  'use strict';
  const LOOPBACK=new Set(['127.0.0.1','localhost','::1','[::1]']);
  async function readJson(response){
    let body=null;try{body=await response.json();}catch{}
    if(!response.ok){const e=new Error(body?.error||('HTTP_'+response.status));e.status=response.status;e.body=body;throw e;}
    return body?.data;
  }
  window.createRunluV7LocalInventoryCommandCenterApi=function({
    endpoint='/api/inventory-command-center',fetchImpl=window.fetch.bind(window)
  }={}){
    const page=new URL(window.location.href),target=new URL(endpoint,page.href);
    if(!LOOPBACK.has(page.hostname))throw new Error('V7_LOCAL_INVENTORY_REQUIRES_LOOPBACK_PAGE');
    if(!LOOPBACK.has(target.hostname))throw new Error('V7_LOCAL_INVENTORY_REQUIRES_LOOPBACK_ENDPOINT');
    if(target.origin!==page.origin)throw new Error('V7_LOCAL_INVENTORY_REQUIRES_SAME_ORIGIN');
    return Object.freeze({
      async get(){
        const u=new URL(target.toString());u.searchParams.set('action','overview');
        return readJson(await fetchImpl(u.toString(),{method:'GET',cache:'no-store'}));
      },
      async list({kind='ALL',query=null,location=null,limit=50}={}){
        const u=new URL(target.toString());u.searchParams.set('action','list');u.searchParams.set('kind',kind);
        if(query)u.searchParams.set('q',query);
        if(location)u.searchParams.set('location',location);
        u.searchParams.set('limit',String(limit));
        return readJson(await fetchImpl(u.toString(),{method:'GET',cache:'no-store'}));
      }
    });
  };
})();
