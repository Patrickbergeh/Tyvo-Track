import { describe, test, expect } from 'bun:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { classifyTraffic } from '../supabase/functions/_shared/attribution';
import { buildScript } from '../supabase/functions/_shared/browser';
import { eventTimestamp, validMetaCookie, hashIdentifier, customData, metaAccepted, retryableMeta } from '../supabase/functions/_shared/meta';
import { deliveryLabel } from '../src/lib/delivery';

const base = 'https://shop.example/';
describe('Attribution separates click identity from paid evidence', () => {
  test('Instagram bio remains organic even with fbclid', () => {
    expect(classifyTraffic({ page_url: base+'?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=AbC' })).toMatchObject({ traffic_source:'ig', traffic_kind:'organic' });
  });
  test('paid UTM remains paid', () => expect(classifyTraffic({ page_url:base+'?utm_medium=paid_social&utm_source=ig&fbclid=AbC' }).traffic_kind).toBe('paid'));
  test('fbclid alone and Instagram referrer cannot establish paid/organic', () => {
    expect(classifyTraffic({ page_url:base+'?fbclid=AbC' }).traffic_kind).toBe('unknown');
    expect(classifyTraffic({ page_url:base,referrer:'https://l.instagram.com/' }).traffic_kind).toBe('unknown');
  });
  test('explicit bio content and no medium establishes organic', () => expect(classifyTraffic({ page_url:base+'?utm_source=instagram&utm_content=bio&fbclid=AbC' }).traffic_kind).toBe('organic'));
  test('current URL overrides stale paid session fields', () => expect(classifyTraffic({ page_url:base+'?utm_medium=social',utm_medium:'paid' }).traffic_kind).toBe('organic'));
  test('spoofed Instagram host does not infer Instagram', () => expect(classifyTraffic({ page_url:base,referrer:'https://instagram.com.evil.example/' }).traffic_source).toBe('instagram.com.evil.example'));
  test('unexpanded Meta macros are not a real source', () => expect(classifyTraffic({ page_url:base+'?utm_source={{site_source_name}}' }).traffic_source).not.toBe('{{site_source_name}}'));
});

describe('Meta payload integrity', () => {
  test('expired events must never be made recent', () => expect(() => eventTimestamp(100, 1000000)).toThrow('event_expired'));
  test('millisecond timestamps normalize to seconds', () => expect(eventTimestamp(1789063200000,1789063200)).toBe(1789063200));
  test('invalid and excessive future timestamps reject', () => { expect(() => eventTimestamp('oops')).toThrow(); expect(() => eventTimestamp(Date.now()/1000+5000)).toThrow('future_event_time'); });
  test('click identifiers preserve exact case and content', () => {
    const value='fb.1.'+Date.now()+'.AbC_de.Foo'; expect(validMetaCookie(value,'fbc')).toBe(value);
    expect(validMetaCookie('fb.1.1000000000000.AbC','fbc')).toBeUndefined();
    expect(validMetaCookie('invented','fbc')).toBeUndefined();
  });
  test('hashes are not double-hashed and city spaces normalize', async () => {
    const hash=(await hashIdentifier('São Paulo','ct'))![0];
    expect((await hashIdentifier('saopaulo','ct'))![0]).toBe(hash);
    expect((await hashIdentifier(hash,'ct'))![0]).toBe(hash);
  });
  test('purchase amount and products survive; unsafe keys are discarded', () => expect(customData({ value:149.9,currency:'brl',content_ids:['SKU1'],contents:[{id:'SKU1',quantity:1,item_price:149.9}],access_token:'secret',email:'a@b.com' })).toEqual({ value:149.9,currency:'BRL',content_ids:['SKU1'],contents:[{id:'SKU1',quantity:1,item_price:149.9}] }));
  test('HTTP success without events_received does not mean accepted', () => {
    expect(metaAccepted({events_received:0})).toBe(false);expect(metaAccepted({error:{code:190}})).toBe(false);expect(metaAccepted({events_received:1})).toBe(true);
    expect(deliveryLabel({processed:true,fb_response:{error:{code:190}}})).toBe('Falha no envio');
  });
  test('only transient failures retry', () => { expect(retryableMeta(400,{error:{code:190}})).toBe(false);expect(retryableMeta(429,{})).toBe(true);expect(retryableMeta(400,{error:{code:2}})).toBe(true); });
});

function storage(initial: Record<string,string> = {}) { const data={...initial}; return {getItem:(k:string)=>data[k]||null,setItem:(k:string,v:string)=>{data[k]=v;},removeItem:(k:string)=>{delete data[k];},data}; }
export async function browser(url:string, opts:any={}) {
  const requests:any[]=[], pixels:any[]=[], cookies:any={...opts.cookies}, listeners:any={};
  const doc:any={ title:'Landing',referrer:opts.referrer||'',readyState:'complete',querySelectorAll:()=>[],querySelector:()=>null,
    addEventListener:(name:string,fn:any)=>{(listeners[name]??=[]).push(fn);},createElement:()=>({}),getElementsByTagName:()=>[{parentNode:{insertBefore:()=>{}}}],body:{},documentElement:{} };
  Object.defineProperty(doc,'cookie',{get:()=>Object.entries(opts.noCookies?{}:cookies).map(([k,v])=>k+'='+v).join('; '),set:(s:string)=>{const [k,v]=s.split(';')[0].split('=');cookies[k]=v;}});
  const win:any={location:new URL(url),fbq:(...args:any[])=>{if(opts.pixelThrows)throw Error('Pixel error');pixels.push(args);},addEventListener:()=>{}};
  const ctx=vm.createContext({window:win,document:doc,navigator:{userAgent:'Instagram',sendBeacon:()=>true},localStorage:opts.noStorage?{getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}}:storage(),sessionStorage:opts.session||storage(),URL,Blob,TextEncoder,crypto:opts.noCrypto?undefined:webcrypto,Date,console,setTimeout,clearTimeout,MutationObserver:class{observe(){}},fetch:async (url:string,init:any)=>{requests.push({url,...init,body:JSON.parse(init.body)});return {ok:true,status:200};}});
  const script=buildScript({propertyId:opts.pid||'00000000-0000-0000-0000-000000000001',pixelId:'642258762285772',supabaseUrl:'https://db.example',browserPixel:true,fireOnce:opts.fireOnce??false,capiEnabled:true,eventAddToCart:opts.cart??false,eventAddToWishlist:false,eventLead:true});
  vm.runInContext(script,ctx);await new Promise(r=>setTimeout(r,10));
  return {requests,pixels,cookies,win,ctx,script,listeners};
}
describe('Executed browser script', () => {
  test('PageView and ViewContent share exact IDs across browser and CAPI', async () => {
    const b=await browser(base+'?utm_source=ig&utm_medium=paid_social&fbclid=CaseSensitive');
    expect(b.requests).toHaveLength(2);
    for(const request of b.requests){ const pixel=b.pixels.find(x=>x[0]==='trackSingle'&&x[2]===request.body.event_name);expect(pixel[4].eventID).toBe(request.body.event_id);expect(request.body.traffic_kind).toBe('paid');expect(request.body.fbc.endsWith('.CaseSensitive')).toBe(true); }
  });
  test('double inclusion does not duplicate events or listeners', async () => {
    const b=await browser(base);const submits=b.listeners.submit.length;vm.runInContext(b.script,b.ctx);await new Promise(r=>setTimeout(r,10));expect(b.requests).toHaveLength(2);expect(b.listeners.submit).toHaveLength(submits);
  });
  test('custom purchase data survives browser-to-server transport', async () => {
    const b=await browser(base);b.win._tracker.send('Purchase',{value:79,currency:'BRL',content_ids:['SKU']});expect(b.requests.at(-1).body.custom_data).toEqual({value:79,currency:'BRL',content_ids:['SKU']});
  });
  test('session keeps paid context on internal navigation then replaces it for bio', async () => {
    const session=storage();await browser(base+'?utm_source=ig&utm_medium=paid',{session});
    const internal=await browser(base+'checkout',{session,referrer:base});expect(internal.requests[0].body.traffic_kind).toBe('paid');
    const bio=await browser(base+'?utm_source=ig&utm_medium=social&fbclid=Bio',{session,referrer:'https://l.instagram.com/'});expect(bio.requests[0].body.traffic_kind).toBe('organic');
  });
  test('cart click does not invent a zero price', async () => {
    const b=await browser(base,{cart:true});
    for(const fn of b.listeners.click)fn({target:{tagName:'BUTTON',classList:{contains:(name:string)=>name==='addtocart-btn'},parentElement:null}});
    expect(b.requests.at(-1).body.event_name).toBe('AddToCart');
    expect(b.requests.at(-1).body.custom_data.value).toBeUndefined();
  });
  test('preview suppresses all tracking', async () => {const b=await browser(base+'?_tk_preview=1');expect(b.requests).toHaveLength(0);expect(b.pixels).toHaveLength(0);});
  test('fire-once still initializes Pixel after a reload so later conversions work', async () => {
    const session=storage();await browser(base,{session,fireOnce:true});const b=await browser(base,{session,fireOnce:true});expect(b.requests).toHaveLength(0);expect(b.pixels.some(x=>x[0]==='init')).toBe(true);b.win._tracker.send('Lead');expect(b.requests).toHaveLength(1);
  });
});
