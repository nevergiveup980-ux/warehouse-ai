(() => {
  'use strict';
  const LOOPBACK=new Set(['127.0.0.1','localhost','::1','[::1]']);

  async function readJson(response){
    let body=null;
    try { body=await response.json(); } catch {}
    if(!response.ok){
      const error=new Error(body?.error || body?.data?.code || ('HTTP_'+response.status));
      error.status=response.status;
      error.body=body;
      throw error;
    }
    return body?.data;
  }

  window.createRunluV7LocalOrderExecutionApi=function createRunluV7LocalOrderExecutionApi({
    endpoint='/api/order-execution',
    fetchImpl=window.fetch.bind(window),
  }={}){
    const page=new URL(window.location.href);
    const target=new URL(endpoint,page.href);
    if(!LOOPBACK.has(page.hostname)) throw new Error('V7_LOCAL_EXECUTION_REQUIRES_LOOPBACK_PAGE');
    if(!LOOPBACK.has(target.hostname)) throw new Error('V7_LOCAL_EXECUTION_REQUIRES_LOOPBACK_ENDPOINT');
    if(target.origin!==page.origin) throw new Error('V7_LOCAL_EXECUTION_REQUIRES_SAME_ORIGIN');
    const base=target.toString();

    return Object.freeze({
      async list(status='open'){
        const url=new URL(base);
        url.searchParams.set('action','list');
        url.searchParams.set('status',status);
        return readJson(await fetchImpl(url.toString(),{method:'GET',cache:'no-store'}));
      },
      async get(orderId){
        const url=new URL(base);
        url.searchParams.set('action','get');
        url.searchParams.set('order_id',orderId);
        return readJson(await fetchImpl(url.toString(),{method:'GET',cache:'no-store'}));
      },
      async execute(orderId,payload){
        return readJson(await fetchImpl(base,{
          method:'POST',
          cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            action:'execute',
            order_id:orderId,
            command_id:payload?.command_id || crypto.randomUUID(),
            stock_item_id:payload?.stock_item_id || null,
            expected_order_version:payload?.expected_order_version,
            expected_stock_version:payload?.expected_stock_version,
            quantity:payload?.quantity,
          }),
        }));
      },
    });
  };
})();
