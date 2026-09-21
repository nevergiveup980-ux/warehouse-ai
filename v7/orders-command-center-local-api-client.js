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
        const url=new URL(target.toString());url.searchParams.set('action','overview');
        return readJson(await fetchImpl(url.toString(),{method:'GET',cache:'no-store'}));
      },
      async getToday({priority=null,work_type=null,min_age_hours=null,limit=50}={}){
        const url=new URL(target.toString());url.searchParams.set('action','today');
        if(priority)url.searchParams.set('priority',priority);
        if(work_type)url.searchParams.set('type',work_type);
        if(min_age_hours!==null&&min_age_hours!==undefined)url.searchParams.set('aged',String(min_age_hours));
        url.searchParams.set('limit',String(limit));
        return readJson(await fetchImpl(url.toString(),{method:'GET',cache:'no-store'}));
      },
      async getCompletedRecent({hours=24,limit=12}={}){
        const url=new URL(target.toString());url.searchParams.set('action','completed_recent');url.searchParams.set('hours',String(hours));url.searchParams.set('limit',String(limit));
        return readJson(await fetchImpl(url.toString(),{method:'GET',cache:'no-store'}));
      },
    });
  };
})();
