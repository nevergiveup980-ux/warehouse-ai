(() => {
'use strict';
const LOOPBACK=new Set(['127.0.0.1','localhost','::1','[::1]']);
async function read(response){
  let body=null;try{body=await response.json();}catch{}
  if(!response.ok){const e=new Error(body?.error||('HTTP_'+response.status));e.status=response.status;e.body=body;throw e;}
  return body?.data;
}
window.createRunluV7LocalCarpetReviewApi=function({endpoint='/api/carpet-review',fetchImpl=window.fetch.bind(window)}={}){
  const page=new URL(window.location.href),target=new URL(endpoint,page.href);
  if(!LOOPBACK.has(page.hostname)||!LOOPBACK.has(target.hostname)||target.origin!==page.origin){
    throw new Error('V7_LOCAL_CARPET_REVIEW_REQUIRES_LOOPBACK_SAME_ORIGIN');
  }
  const get=async(params)=>{
    const u=new URL(target.toString());
    Object.entries(params).forEach(([k,v])=>{if(v!==null&&v!==undefined)u.searchParams.set(k,String(v));});
    return read(await fetchImpl(u.toString(),{method:'GET',cache:'no-store'}));
  };
  const post=async(body)=>read(await fetchImpl(target.toString(),{
    method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify(body)
  }));
  return Object.freeze({
    list:(status='open')=>get({action:'list',status}),
    get:(source_dataset,source_record_id)=>get({action:'get',dataset:source_dataset,record:source_record_id}),
    gate:()=>get({action:'gate'}),
    preview:(source_dataset,source_record_id)=>get({action:'preview',dataset:source_dataset,record:source_record_id}),
    resolve:(c,resolution)=>post({action:'resolve',source_dataset:c.source_dataset,source_record_id:c.source_record_id,expected_version:c.resolution_version,resolution}),
    reopen:(c)=>post({action:'reopen',source_dataset:c.source_dataset,source_record_id:c.source_record_id,expected_version:c.resolution_version})
  });
};
})();
