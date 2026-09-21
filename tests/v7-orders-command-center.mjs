import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('v7/orders-command-center-1.0.sql','utf8');
const html=fs.readFileSync('v7/orders-command-center.html','utf8');
const js=fs.readFileSync('v7/orders-command-center.js','utf8');
const client=fs.readFileSync('v7/orders-command-center-local-api-client.js','utf8');
const server=fs.readFileSync('v7/order-exception-local-engineering-server.mjs','utf8');

for(const x of ['orders_attention_queue','get_orders_command_center','list_orders_today_work','list_orders_completed_recent','rolling_hours_not_calendar_day','matching_count','INVALID_TODAY_PRIORITY_FILTER'])assert.ok(sql.includes(x),x);
for(const x of ['What should be handled first','data-filter="p1"','data-filter="receive"','data-filter="ship"','data-filter="aged24"','Completed · last 24h','Rolling 24-hour close-out'])assert.ok(html.includes(x),x);
for(const x of ['FILTERS','getToday','getCompletedRecent','renderCompletedRecent','rolling 24-hour window'])assert.ok(js.includes(x),x);
for(const x of ['TODAY_PRIORITIES','TODAY_WORK_TYPES','completed_recent','commandCenterToday'])assert.ok(server.includes(x),x);
assert.doesNotMatch(client,/localStorage|sessionStorage|service_role|sb_secret_/i);
assert.doesNotMatch(sql,/due_date|legacy_due|deadline/i);

const calls=[];
const fakeFetch=async(url,opts={})=>{
  calls.push({url,opts});
  return {ok:true,status:200,json:async()=>({ok:true,data:{read_only:true,matching_count:0,returned_count:0,items:[]}})};
};
const ctx={window:{location:{href:'http://127.0.0.1:8787/orders-command-center.html',origin:'http://127.0.0.1:8787',hostname:'127.0.0.1'},fetch:fakeFetch},URL};
vm.createContext(ctx);vm.runInContext(client,ctx);
const api=ctx.window.createRunluV7LocalOrdersCommandCenterApi({fetchImpl:fakeFetch});
await api.get();await api.getToday({priority:'P1',work_type:'SHIP',min_age_hours:24,limit:25});await api.getCompletedRecent({hours:24,limit:12});
assert.equal(calls.length,3);assert.match(calls[0].url,/action=overview/);assert.match(calls[1].url,/priority=P1/);assert.match(calls[1].url,/type=SHIP/);assert.match(calls[1].url,/aged=24/);assert.match(calls[2].url,/completed_recent/);
const remote={window:{location:{href:'https://example.com/',origin:'https://example.com',hostname:'example.com'},fetch:fakeFetch},URL};vm.createContext(remote);vm.runInContext(client,remote);
assert.throws(()=>remote.window.createRunluV7LocalOrdersCommandCenterApi({fetchImpl:fakeFetch}),/V7_LOCAL_COMMAND_CENTER_REQUIRES_LOOPBACK_PAGE/);
console.log('V7 orders command center filters/closeout contract: PASS');
