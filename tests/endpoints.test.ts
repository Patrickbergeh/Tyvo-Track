import * as http from "../supabase/functions/_shared/http";
import * as geo from "../supabase/functions/_shared/geo";
import * as policy from "../supabase/functions/_shared/meta-policy";
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
    const result=()=>({data:table==='properties'?options.property===null?null:(options.property||property):action==='insert'?{id:event.id}:table==='geo_cache'?options.geoCache??null:[],error:options.dbError||null});
    const chain:any={select:()=>chain,gte:()=>chain,eq:()=>chain,in:async()=>({data:[options.property||property]}),limit:async()=>({data:options.duplicate?[{id:event.id}]:[]}),insert:(row:any)=>{action='insert';inserts.push(row);return chain;},update:(row:any)=>{action='update';patch=row;updates.push(row);return chain;},single:async()=>result(),maybeSingle:async()=>result(),then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return chain;
  }};
  const source=readFileSync('supabase/functions/'+name+'/index.ts','utf8').replace(/^import .*;\n/gm,'');
  const js=new Bun.Transpiler({loader:'ts'}).transformSync(source);
  const context=vm.createContext({...meta,...auth,...http,...geo,...policy,classifyTraffic,createClient:()=>client,Deno:{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://db.example':'service-test-key'},serve:(fn:any)=>{handler=fn;}},EdgeRuntime:{waitUntil:()=>{}},Request,Response,URL,AbortSignal,TextEncoder,TextDecoder,crypto:webcrypto,console,fetch:async(url:string,init:any)=>{calls.push({url,init});if(options.networkFailure)throw Error('offline');if(url.startsWith('https://ipwho.is/')&&options.geoBody)return new Response(JSON.stringify(options.geoBody));return new Response(JSON.stringify(options.metaBody??{events_received:1}),{status:options.metaStatus??200});}});
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

test('ingestion rejects incomplete Brazilian postal codes from cache and fresh provider results',async()=>{
 for(const options of [{geoCache:{country:'br',state:'sp',city:'sao paulo',zip:'1002',lat:-23.5,lon:-46.6}},{geoBody:{success:true,country_code:'BR',region_code:'SP',city:'Sao Paulo',postal:'1002',latitude:-23.5,longitude:-46.6}}]){
  const e=await endpoint('track',options),req=request({...event});req.headers.set('x-forwarded-for','203.0.113.8');
  expect((await e.handler(req)).status).toBe(200);expect(e.inserts[0]).toMatchObject({country:'br',state:'sp',city:'sao paulo',zip:null});
 }
});
test('ingestion preserves complete leading-zero and international postal codes',async()=>{
 for(const [country,postal,expected] of [['BR','01002-000','01002000'],['CA','K1A 0B1','K1A 0B1']]){
  const e=await endpoint('track',{geoBody:{success:true,country_code:country,region_code:'SP',city:'Test City',postal,latitude:0,longitude:0}}),req=request({...event});req.headers.set('x-forwarded-for','203.0.113.8');
  expect((await e.handler(req)).status).toBe(200);expect(e.inserts[0].zip).toBe(expected);
 }
});
test('processor omits invalid legacy CEP without losing other matching fields or modifying the source event',async()=>{
 const source={...event,country:'br',state:'sp',zip:'1002',external_id:'visitor'},e=await endpoint('process-fb-event',{events:[source]});await e.handler(request({}));
 const data=e.updates[0].payload_sent.data[0].user_data;
 expect(data.zp).toBeUndefined();expect(data.country).toBeTruthy();expect(data.external_id).toBeTruthy();expect(source.zip).toBe('1002');expect(e.updates[0].zip).toBeUndefined();
});
test('processor hashes all eight digits of a valid Brazilian CEP',async()=>{
 const e=await endpoint('process-fb-event',{events:[{...event,country:'br',zip:'01002-000'}]});await e.handler(request({}));
 expect(e.updates[0].payload_sent.data[0].user_data.zp).toEqual(await meta.hashIdentifier('01002000','zp'));
});

test('excluded events are stored terminally with the actual rule and never trigger the processor',async()=>{
 for(const [query,reason] of [['utm_source=instagram&utm_medium=organic_social','excluded_organic'],['utm_source=instagram&utm_content=bio','excluded_bio'],['utm_source=manychat','excluded_manychat']]){
  const e=await endpoint('track');const res=await e.handler(request({...event,page_url:'https://shop.example/?'+query,meta_policy_version:1,meta_pixel_suppressed:true}));
  expect(res.status).toBe(200);expect(e.inserts[0]).toMatchObject({processed:true,delivery_status:'skipped',fb_response:{reason,skipped:true,blocked_before_capi:true,browser_suppressed:true}});expect(e.calls).toHaveLength(0);
 }
});
test('old loaders are excluded from CAPI without claiming browser suppression',async()=>{
 const e=await endpoint('track');await e.handler(request({...event,page_url:'https://shop.example/?utm_content=bio'}));
 expect(e.inserts[0].fb_response.browser_suppressed).toBeNull();expect(e.calls).toHaveLength(0);
});
test('processor blocks pending legacy and retry organic events before any Meta request',async()=>{
 for(const attempt of [1,3]){
  const e=await endpoint('process-fb-event',{events:[{...event,page_url:'https://shop.example/?utm_medium=social',attempt_count:attempt,...(attempt>1?{payload_sent:{data:[]},fb_response:{error:{message:'prior timeout'}}}:{})}]});
  await e.handler(request({}));expect(e.calls).toHaveLength(0);expect(e.updates[0]).toMatchObject({processed:true,delivery_status:'skipped',next_retry_at:null,fb_response:{reason:'excluded_organic',blocked_before_capi:attempt===1,browser_suppressed:null}});
 }
});
test('paid URLs override stale or caller-provided organic flags and still trigger delivery',async()=>{
 const e=await endpoint('track');await e.handler(request({...event,page_url:'https://shop.example/?utm_medium=paid_social',utm_content:'bio',traffic_kind:'organic',meta_pixel_suppressed:true}));
 expect(e.inserts[0]).toMatchObject({processed:false,delivery_status:'pending',traffic_kind:'paid'});expect(e.calls.some(c=>c.url.endsWith('/process-fb-event'))).toBe(true);
});
