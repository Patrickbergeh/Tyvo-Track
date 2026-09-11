import { test, expect } from 'bun:test';
import { metaExclusionReason } from '../supabase/functions/_shared/meta-policy';
import { deliveryLabel, deliveryDescription } from '../src/lib/delivery';
import { browser } from './tracking.test';

const cases=[
 ['utm_source=instagram&utm_medium=organic_social&fbclid=BioClick','excluded_organic'],
 ['utm_source=instagram&utm_content=bio&fbclid=BioClick','excluded_bio'],
 ['utm_source=instagram&utm_medium=organic_social&utm_content=manychat','excluded_manychat'],
 ['utm_source=ManyChat','excluded_manychat'],
 ['utm_source=instagram&utm_medium=paid_social&utm_content=manychat','excluded_manychat'],
 ['utm_source=instagram&utm_medium=org%C3%A2nico','excluded_organic'],
];
test('explicit exclusions use original campaign evidence even when fbclid is present',()=>{
 for(const [query,reason] of cases)expect(metaExclusionReason({page_url:'https://shop.example/?'+query})).toBe(reason);
 expect(metaExclusionReason({page_url:'https://shop.example/',referrer:'https://app.manychat.com/'})).toBe('excluded_manychat');
});
test('paid and unknown traffic are not reclassified as organic; lookalike domains and words do not match',()=>{
 for(const input of [
  {page_url:'https://shop.example/?utm_medium=paid_social&utm_source=instagram&fbclid=RealClick'},
  {page_url:'https://shop.example/?fbclid=Unknown',user_agent:'Instagram'},
  {page_url:'https://shop.example/',referrer:'https://l.instagram.com/'},
  {page_url:'https://shop.example/',referrer:'https://manychat.com.evil.example/'},
  {page_url:'https://shop.example/?utm_content=biology&utm_medium=cpc'},
  {page_url:'https://shop.example/?utm_medium=paid_social',utm_content:'bio',traffic_kind:'organic'},
 ])expect(metaExclusionReason(input)).toBeNull();
});
test('excluded visits retain automatic and custom events in the platform with zero Pixel calls',async()=>{
 for(const [query] of cases){
  const b=await browser('https://shop.example/?'+query);
  for(const name of ['Lead','AddToCart','AddToWishlist','Purchase','MyCustomEvent'])b.win._tracker.send(name,{value:42,currency:'BRL'});
  expect(b.pixels).toHaveLength(0);expect(b.requests).toHaveLength(7);
  expect(b.requests.every((r:any)=>r.url==='https://db.example/functions/v1/track'&&r.body.meta_pixel_suppressed===true&&r.body.meta_policy_version===1)).toBe(true);
 }
});
test('organic session continues blocked on internal navigation and a new paid campaign initializes Pixel',async()=>{
 const first=await browser('https://shop.example/?utm_source=instagram&utm_content=bio');
 const next=await browser('https://shop.example/product',{session:first.ctx.sessionStorage,referrer:'https://shop.example/'});
 expect(next.pixels).toHaveLength(0);expect(next.requests[0].body.meta_pixel_suppressed).toBe(true);
 next.win.location=new URL('https://shop.example/product?utm_source=instagram&utm_medium=paid_social');
 next.win._tracker.send('AddToCart',{value:42,currency:'BRL'});
 expect(next.pixels.some((p:any)=>p[0]==='init')).toBe(true);expect(next.pixels.some((p:any)=>p[0]==='trackSingle'&&p[2]==='AddToCart')).toBe(true);
 expect(next.requests.at(-1).body.meta_pixel_suppressed).toBe(false);
});
test('paid to bio URL transition blocks subsequent browser events',async()=>{
 const b=await browser('https://shop.example/?utm_source=instagram&utm_medium=paid_social'),before=b.pixels.length;
 b.win.location=new URL('https://shop.example/?utm_source=instagram&utm_content=bio');b.win._tracker.send('Purchase',{value:42,currency:'BRL'});
 expect(b.pixels.length).toBe(before);expect(b.requests.at(-1).body.meta_pixel_suppressed).toBe(true);
});
test('the same fbclid on internal links does not erase a bio exclusion',async()=>{
 const first=await browser('https://shop.example/?utm_source=instagram&utm_content=bio&fbclid=SameClick');
 const next=await browser('https://shop.example/product?fbclid=SameClick',{session:first.ctx.sessionStorage,referrer:'https://shop.example/'});
 expect(next.pixels).toHaveLength(0);expect(next.requests[0].body.meta_pixel_suppressed).toBe(true);expect(next.requests[0].body.utm_content).toBe('bio');
});
test('list uses persisted delivery evidence and never relabels accepted historical organic events',()=>{
 expect(deliveryLabel({traffic_kind:'organic',processed:true,fb_response:{events_received:1}})).toBe('Aceito pelo Meta');
 expect(deliveryLabel({traffic_kind:'organic',processed:false})).toBe('Pendente');
 const e={delivery_status:'skipped',fb_response:{skipped:true,reason:'excluded_bio',blocked_before_capi:true,browser_suppressed:true}};
 expect(deliveryLabel(e)).toBe('Não enviado · bio');expect(deliveryDescription(e)).toContain('mantido na plataforma');
 expect(deliveryLabel({...e,fb_response:{...e.fb_response,browser_suppressed:null}})).toBe('CAPI bloqueada · bio');
 expect(deliveryLabel({...e,fb_response:{...e.fb_response,blocked_before_capi:false}})).toBe('Reenvio bloqueado · bio');
});
