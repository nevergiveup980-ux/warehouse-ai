(() => {
'use strict';
const BASE='https://ekrnknlawekeoszzkamd.supabase.co';
const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
const SESSION='runlu_v7_auth_session';
function getSession(){try{return JSON.parse(sessionStorage.getItem(SESSION)||'null')}catch{return null}}
function saveSession(s){sessionStorage.setItem(SESSION,JSON.stringify(s));return s}
async function signIn(email,password){
 const r=await fetch(BASE+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 const j=await r.json();if(!r.ok)throw new Error(j?.msg||j?.error_description||'SIGN_IN_FAILED');return saveSession(j);
}
async function refreshSession(s){
 if(!s?.refresh_token)throw new Error('SIGN_IN_REQUIRED');
 const r=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
 const n=await r.json();if(!r.ok)throw new Error(n?.msg||n?.error_description||'SESSION_REFRESH_FAILED');return saveSession(n);
}
async function call(body,retry=true){
 let s=getSession();if(!s?.access_token)throw new Error('SIGN_IN_REQUIRED');
 let r=await fetch(BASE+'/functions/v1/warehouse-v7-api',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 if(r.status===401&&retry){s=await refreshSession(s);return call(body,false)}
 const j=await r.json().catch(()=>({}));if(!r.ok||j?.ok===false)throw new Error(j?.error||('HTTP_'+r.status));return j;
}
function signOut(){sessionStorage.removeItem(SESSION)}
window.RUNLU_V7_API=Object.freeze({call,bootstrap:()=>call({action:'bootstrap'}),session:getSession,signIn,signOut});
})();