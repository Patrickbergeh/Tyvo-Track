import { test, expect } from 'bun:test';
import { authorized } from '../supabase/functions/_shared/auth';
const client={auth:{getUser:async()=>({data:{user:null},error:true})}};
const jwt=(role:string)=>`e30.${btoa(JSON.stringify({role}))}.unverified-test-signature`;
const request=(token:string)=>new Request('https://example.invalid',{headers:{Authorization:`Bearer ${token}`}});
test('legacy service candidate requires successful remote signature and role verification',async()=>{
 let calls=0;
 const verifier:any=async(url:string,init:any)=>{calls++;expect(url).toBe('https://db.invalid/rest/v1/rpc/verify_service_request');expect(init.headers.Authorization).toBe(`Bearer ${jwt('service_role')}`);return new Response('true');};
 expect(await authorized(request(jwt('service_role')),client,'runtime-key','https://db.invalid',verifier)).toBe(true);expect(calls).toBe(1);
});
test('forged service role, denied RPC and verifier outages fail closed',async()=>{
 for(const verifier of [async()=>new Response('true',{status:401}),async()=>new Response('false'),async()=>{throw Error('offline');}])
  expect(await authorized(request(jwt('service_role')),client,'runtime-key','https://db.invalid',verifier as any)).toBe(false);
});
test('anonymous JWT cannot use the service verification path',async()=>{
 let calls=0;const verifier:any=async()=>{calls++;return new Response('true');};
 expect(await authorized(request(jwt('anon')),client,'runtime-key','https://db.invalid',verifier)).toBe(false);expect(calls).toBe(0);
});
test('runtime service key and real authenticated users retain access',async()=>{
 expect(await authorized(request('runtime-key'),client,'runtime-key')).toBe(true);
 expect(await authorized(request('user-token'),{auth:{getUser:async()=>({data:{user:{id:'test'}},error:null})}},'runtime-key')).toBe(true);
});
