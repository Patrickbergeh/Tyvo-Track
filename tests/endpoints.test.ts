import * as http from "../supabase/functions/_shared/http";
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as meta from '../supabase/functions/_shared/meta';
import * as auth from '../supabase/functions/_shared/auth';
import { classifyTraffic } from '../supabase/functions/_shared/attribution';
const pid='00000000-0000-0000-0000-000000000001';
const property={id:pid,pixel_id:'642258762285772',access_token:'meta-test-token',capi_enabled:true,tracking_enabled:true};
const event={id:'00000000-0000-0000-0000-000000000002',property_id:pid,event_id:'same-id',event_name:'PageView',event_time:Math.floor(Date.now()/1000),page_url:'https://example.com',ip:'127.0.0.1',user_agent:'test',attempt_count:1};
async function endpoint(name:string,options:any={}) {
  let handler:any;const updates:any[]=[],inserts:any[]=[],calls:any[]=[];
  const client={auth:{getUser:async()=>({data:{user:null},error:true})},rpc:async()=>({data:options.events??[event]}),from:(table:string)=>{
    let action='select',patch:any;
    const result=()=>({data:table==='properties'?options.property===null?null:(options.property||property):action==='insert'?{id:event.id}:table==='geo_cache'?null:[],error:options.dbError||null});
    const chain:any={select:()=>chain,gte:()=>chain,eq:()=>chain,in:async()=>({data:[options.property||property]}),limit:async()=>({data:options.duplicate?[{id:event.id}]:[]}),insert:(row:any)=>{action='insert';inserts.push(row);return chain;},update:(row:any)=>{action='update';patch=row;updates.push(row);return chain;},single:async()=>result(),maybeSingle:async()=>result(),then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return chain;
  }};
  const source=readFileSync('supabase/functions/'+name+'/index.ts','utf8').replace(/^import .*;\n/gm,'');
  const js=new Bun.Transpiler({loader:'ts'}).transformSync(source);
  const context=vm.createContext({...meta,...auth,...http,classifyTraffic,createClient:()=>client,Deno:{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://db.example':'service-test-key'},serve:(fn:any)=>{handler=fn;}},EdgeRuntime:{waitUntil:()=>{}},Request,Response,URL,AbortSignal,TextEncoder,TextDecoder,crypto:webcrypto,console,fetch:async(url:string,init:any)=>{calls.push({url,init});if(options.networkFailure)throw Error('offline');return new Response(JSON.stringify(options.metaBody??{events_received:1}),{status:options.metaStatus??200});}});
  vm.runInContext(js,context);
  return {handler,updates,inserts,calls};
}
const request=(body:any,token='service-test-key')=>new Request('https://db.example/functions/v1/process-fb-event',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','x-forwarded-for':'127.0.0.1'},body:JSON.stringify(body)});
test('processor rejects public token before any delivery',async()=>{const e=await endpoint('process-fb-event');expect((await e.handler(request({},'anon'))).status).toBe(401);expect(e.calls).toHaveLength(0);});
test('processor records actual acceptance and strips token from persisted payload',async()=>{const e=await endpoint('process-fb-event');await e.handler(request({}));expect(e.updates[0].delivery_status).toBe('accepted');expect(e.updates[0].payload_sent.data[0].event_id).toBe(event.event_id);expect(JSON.stringify(e.updates)).not.toContain('meta-test-token');});
test('rate limiting retries without claiming successful delivery',async()=>{const e=await endpoint('process-fb-event',{metaStatus:429,metaBody:{error:{code:4}}});await e.handler(request({}));expect(e.updates[0]).toMatchObject({processed:false,delivery_status:'retry',processing_started_at:null});expect(e.updates[0].next_retry_at).toBeTruthy();});
test('invalid access token becomes visible terminal failure',async()=>{const e=await endpoint('process-fb-event',{metaStatus:400,metaBody:{error:{code:190}}});await e.handler(request({}));expect(e.updates[0].delivery_status).toBe('failed');});
test('network failure has bounded retries',async()=>{const e=await endpoint('process-fb-event',{networkFailure:true,events:[{...event,attempt_count:8}]});await e.handler(request({}));expect(e.updates[0].delivery_status).toBe('failed');});
test('expired event never reaches Meta',async()=>{const e=await endpoint('process-fb-event',{events:[{...event,event_time:1}]});await e.handler(request({}));expect(e.calls).toHaveLength(0);expect(e.updates[0].delivery_status).toBe('expired');});
test('Purchase retains value/currency and missing value is refused',async()=>{
 const e=await endpoint('process-fb-event',{events:[{...event,event_name:'Purchase',custom_data:{value:98,currency:'BRL',content_ids:['SKU']}}]});await e.handler(request({}));expect(e.updates[0].payload_sent.data[0].custom_data).toEqual({value:98,currency:'BRL',content_ids:['SKU']});
 const bad=await endpoint('process-fb-event',{events:[{...event,event_name:'Purchase'}]});await bad.handler(request({}));expect(bad.calls).toHaveLength(0);
});
test('ingestion rejects malformed payload before writing',async()=>{const e=await endpoint('track');expect((await e.handler(request({}))).status).toBe(400);expect(e.inserts).toHaveLength(0);});
test('ingestion prevents duplicate requests and honors disabled tracking',async()=>{
 const e=await endpoint('track',{duplicate:true});const r=await e.handler(request({...event}));expect(await r.json()).toMatchObject({duplicate:true});expect(e.inserts).toHaveLength(0);
 const disabled=await endpoint('track',{property:{...property,tracking_enabled:false}});expect(await (await disabled.handler(request({...event}))).json()).toMatchObject({reason:'tracking_disabled'});expect(disabled.inserts).toHaveLength(0);
});
test('ingestion stores organic attribution and actual forwarded IP',async()=>{
 const e=await endpoint('track');await e.handler(request({...event,ip:'8.8.8.8',page_url:'https://example.com/?utm_source=ig&utm_medium=social&fbclid=Bio',custom_data:{value:25,currency:'BRL'}}));expect(e.inserts[0]).toMatchObject({ip:'127.0.0.1',traffic_kind:'organic',custom_data:{value:25,currency:'BRL'}});
});
test('processor returns 400 for primitive or malformed request shape',async()=>{
 for(const body of [null,[],123,{propertyId:{}},{ids:[]},{id:'00000000----------------------------'}]){
  const e=await endpoint('process-fb-event');expect((await e.handler(request(body))).status).toBe(400);expect(e.calls).toHaveLength(0);
 }
});
