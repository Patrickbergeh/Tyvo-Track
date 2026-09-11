import { test, expect } from 'bun:test';
import { browser } from './tracking.test';
import { readObject, isUuid } from '../supabase/functions/_shared/http';
import { classifyTraffic } from '../supabase/functions/_shared/attribution';
import { hashIdentifier } from '../supabase/functions/_shared/meta';
import { validatePropertyPatch } from '../src/lib/property-patch';
import { previewUrl } from '../src/lib/urls';
import { databaseDate, eventDate } from '../src/lib/dates';
const base='https://shop.example/';
function form(email:string){const root:any={tagName:'FORM',matches:()=>true,closest:()=>root,querySelectorAll:()=>[{type:'email',name:'email',value:email}]};return root;}
async function submit(b:any,target:any){for(const listener of b.listeners.submit)listener({target});}
async function success(b:any,target:any){for(const listener of b.listeners['elementor/forms/success'])listener({target});await new Promise(r=>setTimeout(r,10));}
test('success message without submitted form does not generate Lead',async()=>{const b=await browser(base);await success(b,form('a@example.invalid'));expect(b.requests).toHaveLength(2);});
test('two forms keep separate hashes and duplicate success notifications send once',async()=>{
 const b=await browser(base),a=form('a@example.invalid'),c=form('c@example.invalid');await submit(b,a);await submit(b,c);await success(b,a);await success(b,a);await success(b,c);
 const leads=b.requests.filter(x=>x.body.event_name==='Lead');expect(leads).toHaveLength(2);expect(leads[0].body.em).toBe((await hashIdentifier('a@example.invalid','em'))![0]);expect(leads[1].body.em).toBe((await hashIdentifier('c@example.invalid','em'))![0]);
});
test('crypto unavailable does not lose confirmed Lead',async()=>{const b=await browser(base,{noCrypto:true}),a=form('a@example.invalid');await submit(b,a);await success(b,a);expect(b.requests.at(-1).body.event_name).toBe('Lead');expect(b.requests.at(-1).body.em).toBeUndefined();});
test('blocked cookies and local storage preserve identity within a page',async()=>{const b=await browser(base+'?fbclid=CaseSensitive',{noCookies:true,noStorage:true});expect(b.requests[0].body.external_id).toBe(b.requests[1].body.external_id);expect(b.requests[0].body.fbp).toBe(b.requests[1].body.fbp);expect(b.requests[0].body.fbc).toBe(b.requests[1].body.fbc);});
test('broken third-party Pixel does not stop server delivery',async()=>{const b=await browser(base,{pixelThrows:true});expect(b.requests).toHaveLength(2);});
test('invalid Purchase is not sent through either channel',async()=>{const b=await browser(base);const count=b.pixels.length;expect(b.win._tracker.send('Purchase',{})).toBeNull();expect(b.requests).toHaveLength(2);expect(b.pixels).toHaveLength(count);});
test('new partial campaign replaces all previous attribution fields',async()=>{
 expect(classifyTraffic({page_url:base+'?utm_source=google',utm_source:'ig',utm_medium:'paid_social'})).toMatchObject({traffic_source:'google',traffic_kind:'unknown'});
 const b=await browser(base+'?utm_source=ig&utm_medium=paid_social');b.win.location=new URL(base+'?utm_source=google');b.win._tracker.send('Lead');expect(b.requests.at(-1).body.utm_medium).toBeUndefined();
});
test('preview parameter precedes URL fragments and rejects executable schemes',()=>{expect(previewUrl(base+'?a=1#bio')).toBe(base+'?a=1&_tk_preview=1#bio');expect(previewUrl('javascript:alert(1)')).toBe('');});
test('database timestamps without zone are read as UTC; invalid dates do not throw',()=>{expect(databaseDate('2026-09-10 12:30:00.123456')?.toISOString()).toBe('2026-09-10T12:30:00.123Z');expect(eventDate({event_time:'invalid',created_at:'invalid'})).toBeNull();expect(eventDate({event_time:1789063200000})?.getTime()).toBe(1789063200000);});
test('property patches exclude identity, timestamps and unedited credentials',()=>{expect(validatePropertyPatch({id:'foreign',created_at:'bad',name:' New name ',browser_pixel:false})).toEqual({name:'New name',browser_pixel:false});expect(()=>validatePropertyPatch({pixel_id:'123'})).toThrow();});
test('JSON boundary rejects arrays, null and primitives',async()=>{for(const body of ['null','[]','123','"test"'])await expect(readObject(new Request(base,{method:'POST',body}))).rejects.toThrow('invalid_payload');});
test('JSON request limit counts UTF-8 bytes instead of string length',async()=>{await expect(readObject(new Request(base,{method:'POST',body:JSON.stringify({text:'á'.repeat(40000)})}))).rejects.toThrow('payload_too_large');});
test('UUID validation rejects malformed hyphen placement',()=>{expect(isUuid('00000000-0000-0000-0000-000000000001')).toBe(true);expect(isUuid('00000000----------------------------')).toBe(false);});
