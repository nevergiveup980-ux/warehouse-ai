(() => {
'use strict';
const BASE='https://ekrnknlawekeoszzkamd.supabase.co';
const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
const SESSION='runlu_cloud_session_v54';
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}}
async function refreshSession(s){
 if(!s?.refresh_token)throw new Error('SIGN_IN_REQUIRED');
 const r=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
 const n=await r.json();if(!r.ok)throw new Error(n?.msg||n?.error_description||'SESSION_REFRESH_FAILED');
 localStorage.setItem(SESSION,JSON.stringify(n));return n;
}
async function call(body,retry=true){
 let s=getSession();if(!s?.access_token)throw new Error('SIGN_IN_REQUIRED');
 let r=await fetch(BASE+'/functions/v1/warehouse-v7-api',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 if(r.status===401&&retry){s=await refreshSession(s);return call(body,false)}
 const j=await r.json().catch(()=>({}));if(!r.ok||j?.ok===false)throw new Error(j?.error||('HTTP_'+r.status));return j;
}
window.RUNLU_V7_API=Object.freeze({call,bootstrap:()=>call({action:'bootstrap'}),session:getSession});
})();