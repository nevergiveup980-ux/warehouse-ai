(() => {
  'use strict';
  const LOOPBACK=new Set(['127.0.0.1','localhost','::1','[::1]']);
  async function readJson(response){
    let body=null;
    try{body=await response.json();}catch{}
    if(!response.ok){
      const error=new Error(body?.error || ('HTTP_'+response.status));
      error.status=response.status;
      error.body=body;
      throw error;
    }
    return body?.data;
  }
  window.createRunluV7LocalOrdersCommandCenterApi=function createRunluV7LocalOrdersCommandCenterApi({
    endpoint='/api/orders-command-center',
    fetchImpl=window.fetch.bind(window),
  }={}){
    const page=new URL(window.location.href);
    const target=new URL(endpoint,page.href);
    if(!LOOPBACK.has(page.hostname))throw new Error('V7_LOCAL_COMMAND_CENTER_REQUIRES_LOOPBACK_PAGE');
    if(!LOOPBACK.has(target.hostname))throw new Error('V7_LOCAL_COMMAND_CENTER_REQUIRES_LOOPBACK_ENDPOINT');
    if(target.origin!==page.origin)throw new Error('V7_LOCAL_COMMAND_CENTER_REQUIRES_SAME_ORIGIN');
    return Object.freeze({
      async get(){
        return readJson(await fetchImpl(target.toString(),{method:'GET',cache:'no-store'}));
      },
    });
  };
})();
