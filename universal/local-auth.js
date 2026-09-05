/* RUNLU Warehouse OS — local account authentication for customer-owned storage. */
(function(global){
'use strict';
const ITERATIONS=120000;
const enc=new TextEncoder();
function ws(){return global.RUNLUWorkspace?.workspace?.()||null}
function usersKey(){const w=ws();return w?`runlu-universal-v1::${w.organizationId}::${w.warehouseId}::local-users`:null}
function readRaw(){const key=usersKey();if(!key)return[];try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
function writeRaw(users){const key=usersKey();if(!key)throw new Error('Workspace is not configured.');localStorage.setItem(key,JSON.stringify(users));return users}
function clean(u){if(!u)return null;const {pinHash,salt,...safe}=u;return safe}
function listUsers(){return readRaw().map(clean)}
function hasUsers(){return readRaw().length>0}
function normalizeUsername(v){return String(v||'').trim().toLowerCase()}
function validateUsername(v){const x=normalizeUsername(v);if(!/^[a-z0-9._-]{3,32}$/.test(x))throw new Error('Username must be 3–32 characters using letters, numbers, dot, underscore or hyphen.');return x}
function validatePin(v){const x=String(v||'').trim();if(!/^\d{4,8}$/.test(x))throw new Error('PIN must contain 4–8 digits.');return x}
function randomHex(bytes=16){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('')}
function hexBytes(hex){const out=new Uint8Array(hex.length/2);for(let i=0;i<out.length;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16);return out}
function bytesHex(buf){return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function hashPin(pin,salt){if(!crypto?.subtle)throw new Error('Secure local authentication is unavailable on this device.');const material=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexBytes(salt),iterations:ITERATIONS,hash:'SHA-256'},material,256);return bytesHex(bits)}
function makeId(){return 'usr_'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(16).slice(2))}
async function buildUser(input,role){const username=validateUsername(input.username),pin=validatePin(input.pin),displayName=String(input.displayName||'').trim();if(!displayName)throw new Error('Display name is required.');const salt=randomHex(),pinHash=await hashPin(pin,salt);return{id:makeId(),username,displayName,email:String(input.email||'').trim().toLowerCase(),role,disabled:false,salt,pinHash,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
async function createOwner(input){if(hasUsers())throw new Error('The owner account already exists.');const u=await buildUser(input,'owner');writeRaw([u]);global.RUNLUWorkspace.setSession({userId:u.id,displayName:u.displayName,role:u.role,username:u.username});return clean(u)}
async function createUser(input){if(!global.RUNLUWorkspace.can('manageMembers'))throw new Error('Administrator role required.');const role=String(input.role||'member').toLowerCase();if(!['admin','manager','member','viewer'].includes(role))throw new Error('Invalid role.');const users=readRaw(),username=validateUsername(input.username);if(users.some(u=>u.username===username))throw new Error('That username already exists.');const u=await buildUser({...input,username},role);users.push(u);writeRaw(users);return clean(u)}
async function authenticate(username,pin){const name=normalizeUsername(username),user=readRaw().find(u=>u.username===name);if(!user||user.disabled)throw new Error('Username or PIN is incorrect.');const candidate=await hashPin(validatePin(pin),user.salt);if(candidate!==user.pinHash)throw new Error('Username or PIN is incorrect.');user.lastLoginAt=new Date().toISOString();user.updatedAt=user.lastLoginAt;writeRaw(readRaw().map(u=>u.id===user.id?user:u));global.RUNLUWorkspace.setSession({userId:user.id,displayName:user.displayName,role:user.role,username:user.username});localStorage.setItem('runlu-universal-v1::last-username',user.username);return clean(user)}
function currentUser(){const s=global.RUNLUWorkspace.session();if(!s)return null;return clean(readRaw().find(u=>u.id===s.userId&&!u.disabled)||null)}
function signOut(){global.RUNLUWorkspace.clearSession()}
async function setPin(userId,newPin){if(!global.RUNLUWorkspace.can('manageMembers')&&global.RUNLUWorkspace.session()?.userId!==userId)throw new Error('Not authorized.');const users=readRaw(),u=users.find(x=>x.id===userId);if(!u)throw new Error('User not found.');const pin=validatePin(newPin),salt=randomHex();u.salt=salt;u.pinHash=await hashPin(pin,salt);u.updatedAt=new Date().toISOString();writeRaw(users);return clean(u)}
function setDisabled(userId,disabled){if(!global.RUNLUWorkspace.can('manageMembers'))throw new Error('Administrator role required.');const users=readRaw(),u=users.find(x=>x.id===userId);if(!u)throw new Error('User not found.');if(u.role==='owner'&&disabled)throw new Error('The workspace owner cannot be disabled.');if(global.RUNLUWorkspace.session()?.userId===userId&&disabled)throw new Error('You cannot disable the account currently signed in.');u.disabled=!!disabled;u.updatedAt=new Date().toISOString();writeRaw(users);return clean(u)}
function removeUser(userId){if(!global.RUNLUWorkspace.can('manageMembers'))throw new Error('Administrator role required.');const users=readRaw(),u=users.find(x=>x.id===userId);if(!u)throw new Error('User not found.');if(u.role==='owner')throw new Error('The workspace owner cannot be deleted.');if(global.RUNLUWorkspace.session()?.userId===userId)throw new Error('You cannot delete the account currently signed in.');writeRaw(users.filter(x=>x.id!==userId));return true}
global.RUNLULocalAuth=Object.freeze({ITERATIONS,usersKey,listUsers,hasUsers,createOwner,createUser,authenticate,currentUser,signOut,setPin,setDisabled,removeUser});
})(typeof window!=='undefined'?window:globalThis);
