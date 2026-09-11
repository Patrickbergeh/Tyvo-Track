import { test, expect, type Page } from '@playwright/test';
const pid='00000000-0000-0000-0000-000000000001';
const property={id:pid,name:'Workspace de teste',pixel_id:'642258762285772',access_token:'test-token',browser_pixel:true,capi_enabled:true,event_add_to_cart:false,event_add_to_wishlist:false,event_lead:true,tracking_enabled:true,fire_once:true,test_event_code:null,test_event_active:false,created_at:'2026-01-01T00:00:00Z'};
const user={id:'00000000-0000-0000-0000-000000000099',aud:'authenticated',role:'authenticated',email:'tester@example.invalid',created_at:'2026-01-01T00:00:00Z'};
const session={access_token:`e30.${Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`,refresh_token:'test-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user};
async function setup(page:Page,options:any={}) {
  const writes:any[]=[],errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({session,loggedIn,pid})=>{if(window.top!==window)return;localStorage.setItem('active-property-id',pid);if(loggedIn)localStorage.setItem('sb-tqqqnmdffmzolnlrggqd-auth-token',JSON.stringify(session));},{session,loggedIn:!options.loggedOut,pid:options.staleProperty?'99999999-9999-9999-9999-999999999999':pid});
  await page.routeWebSocket(/supabase\.co/,ws=>ws.close());
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='localhost')return route.continue();
    if(!url.hostname.endsWith('.supabase.co'))return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,HEAD,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,apikey,x-client-info,content-type,prefer,range,range-unit,x-supabase-api-version'}});
    const json=async(data:any,status=200,extra={})=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-expose-headers':'content-range',...extra},body:JSON.stringify(data)});
    if(url.pathname.includes('/auth/v1/token'))return options.loginFailure?json({msg:'Service unavailable'},503):json(options.authSession||session);
    if(url.pathname.includes('/auth/v1/user'))return json(user);
    if(url.pathname.includes('/auth/v1/logout'))return options.logoutFailure?json({msg:'Service unavailable'},503):json({});
    if(url.pathname==='/rest/v1/properties'){
      if(req.method()==='PATCH'){
        const body=req.postDataJSON();writes.push(body);
        if(options.saveFailure)return json({message:'Falha simulada'},503);
        if(options.delaySave)await new Promise(r=>setTimeout(r,300));
        return json({});
      }
      return options.propertiesFailure?json({message:'Falha simulada'},503):json(options.empty?[]:(options.properties||[property]));
    }
    if(url.pathname==='/rest/v1/fb_events_raw'){
      if(options.eventsFailure)return json({message:'Falha simulada'},503,{'retry-after':'0','access-control-expose-headers':'retry-after,content-range'});
      if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':'0-0/1','access-control-allow-origin':'*'}});
      if(url.searchParams.get('select')==='id'||url.searchParams.get('select')==='fb_response')return json([]);
      const data=options.event?[options.event]:[];return json(data,200,{'content-range':`0-${Math.max(0,data.length-1)}/${data.length}`});
    }
    if(url.pathname.endsWith('/rpc/utm_report'))return json([{src:'instagram',med:'social',total:1}]);
    if(url.pathname.endsWith('/rpc/unique_visitors'))return json(1);
    return json({});
  });
  return {writes,errors};
}
test('report to dashboard to settings keeps complete property configuration',async({page})=>{
 const state=await setup(page,{staleProperty:true});await page.goto('/relatorio');await expect(page.getByText('Acessos por origem')).toBeVisible();
 await page.getByRole('button',{name:'Base',exact:true}).click();await expect(page.getByText('Workspace de teste').first()).toBeVisible();
 await page.locator('button').filter({has:page.locator('svg.lucide-settings')}).first().click();
 await expect(page.locator('input').filter({hasText:''}).nth(1)).toHaveValue(property.pixel_id);
 await page.getByRole('button',{name:'Eventos',exact:true}).click();await expect(page.getByRole('switch').first()).toHaveAttribute('aria-checked','true');expect(state.errors).toEqual([]);
});
test('saving failure is visible and does not claim saved',async({page})=>{
 const state=await setup(page,{saveFailure:true});await page.goto('/settings');await page.locator('input').first().fill('Nome alterado');
 await expect(page.getByRole('alert')).toContainText('Não foi possível salvar');expect(state.writes[0]).toEqual({name:'Nome alterado'});
});
test('rapid independent toggles send patches in order, without replacing credentials',async({page})=>{
 const state=await setup(page,{delaySave:true});await page.goto('/settings');await page.getByRole('button',{name:'Eventos',exact:true}).click();
 await page.getByRole('switch').nth(0).click();await page.getByRole('switch').nth(1).click();
 await expect.poll(()=>state.writes.length).toBe(2);expect(state.writes).toEqual([{browser_pixel:false},{capi_enabled:false}]);expect(state.errors).toEqual([]);
});
test('invalid pixel is not persisted to production configuration',async({page})=>{
 const state=await setup(page);await page.goto('/settings');await page.locator('input').nth(1).fill('123');await expect(page.getByRole('alert')).toContainText('10 a 20');expect(state.writes).toHaveLength(0);
});
test('Codmov without properties has no endless loading indicator',async({page})=>{
 const state=await setup(page,{empty:true});await page.goto('/codmov');await expect(page.getByText('Aguardando eventos…')).toBeVisible();expect(state.errors).toEqual([]);
});
test('dashboard failures are shown rather than a healthy empty result',async({page})=>{
 await setup(page,{eventsFailure:true});await page.goto('/');await expect(page.getByRole('alert')).toContainText('Não foi possível');
});
test('preview flag precedes hash and invalid historical dates do not crash dashboard',async({page})=>{
 const state=await setup(page,{event:{id:pid,event_name:'PageView',event_time:'invalid',created_at:'invalid',page_url:'https://landing.example/#oferta',page_title:'Oferta de teste',processed:true,fb_response:{error:{code:190}},event_id:'evt-audit'}});
 await page.goto('/');await expect(page.getByText('Falha no envio')).toBeVisible();await page.getByText('Oferta de teste').first().hover();
 await expect(page.locator('iframe')).toHaveAttribute('src','https://landing.example/?_tk_preview=1#oferta');expect(state.errors).toEqual([]);
});
test('login service failure re-enables form and reports connection error',async({page})=>{
 await setup(page,{loggedOut:true,loginFailure:true});await page.goto('/');await page.getByPlaceholder('E-mail').fill('tester@example.invalid');await page.getByPlaceholder('Senha').fill('test-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByText('Não foi possível entrar.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeEnabled();
});

test('sign out and sign in does not reuse another account cache',async({page})=>{
 const options:any={};await setup(page,options);await page.goto('/');await expect(page.getByText(property.name).first()).toBeVisible();
 await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
 options.properties=[{...property,name:'Outra conta'}];options.authSession={...session,user:{...user,id:'00000000-0000-0000-0000-000000000098',email:'second@example.invalid'}};
 await page.getByPlaceholder('E-mail').fill('second@example.invalid');await page.getByPlaceholder('Senha').fill('test-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByText('Outra conta').first()).toBeVisible();await expect(page.getByText(property.name)).toHaveCount(0);
});
test('leaving settings flushes the pending edited field',async({page})=>{
 const state=await setup(page);await page.goto('/settings');await page.locator('input').first().fill('Salvo ao sair');
 await page.locator('button').filter({has:page.locator('svg.lucide-arrow-left')}).click();await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0]).toEqual({name:'Salvo ao sair'});
});

test('sign out failure is visible and allows retry',async({page})=>{
 const options:any={logoutFailure:true};await setup(page,options);await page.goto('/');await page.getByRole('button',{name:'Sair',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Não foi possível sair');await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeEnabled();
 options.logoutFailure=false;await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
});

test('postal display distinguishes incomplete provider data and preserves original identifiers',async({page},testInfo)=>{
 const options:any={event:{id:pid,event_name:'PageView',created_at:'2026-09-11T11:00:00Z',page_url:'https://landing.example/',page_title:'Yvenon | Cosméticos e tecnologia',country:'br',state:'sp',city:'sao paulo',zip:'1002',event_id:'ev_0123456789abcdef',external_id:'uid_complete_visitor_identifier',processed:true,fb_response:{events_received:1}}};
 const state=await setup(page,options);await page.goto('/');
 await expect(page.getByRole('cell',{name:'Indisponível',exact:true})).toHaveAttribute('title','CEP incompleto ou inválido na origem: 1002');
 await expect(page.locator('code[title="ev_0123456789abcdef"]')).toHaveText('ev_012345678…');
 await expect(page.locator('td[title="uid_complete_visitor_identifier"]')).toHaveCount(1);
 await page.getByRole('columnheader',{name:'External ID',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:testInfo.outputPath('postal-columns.png')});
 options.event={...options.event,zip:'11060450',city:'santos'};await page.reload();
 await expect(page.getByRole('cell',{name:'11060-450',exact:true})).toHaveCount(1);expect(state.errors).toEqual([]);
});

test('list shows the recorded organic exclusion and retains accepted historical status',async({page})=>{
 const options:any={event:{id:pid,event_name:'PageView',created_at:'2026-09-11T11:00:00Z',page_url:'https://landing.example/?utm_source=instagram&utm_content=bio',page_title:'Visita da bio',traffic_source:'instagram',traffic_medium:'organic_social',processed:true,delivery_status:'skipped',fb_response:{skipped:true,reason:'excluded_bio',policy_version:1,blocked_before_capi:true,browser_suppressed:true}}};
 await setup(page,options);await page.goto('/');
 const status=page.getByRole('cell',{name:'Não enviado · bio',exact:true});await expect(status).toBeVisible();await expect(status).toHaveAttribute('title',/Nenhum envio CAPI foi realizado/);
 options.event={...options.event,delivery_status:'accepted',fb_response:{events_received:1}};await page.reload();
 await expect(page.getByRole('cell',{name:'Aceito',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Não enviado · bio',exact:true})).toHaveCount(0);
});
test('legacy browser status is not fabricated for a CAPI exclusion',async({page})=>{
 await setup(page,{event:{id:pid,event_name:'Lead',created_at:'2026-09-11T11:00:00Z',page_url:'https://landing.example/',page_title:'ManyChat',processed:true,delivery_status:'skipped',fb_response:{skipped:true,reason:'excluded_manychat',policy_version:1,blocked_before_capi:true,browser_suppressed:null}}});await page.goto('/');
 await expect(page.getByRole('cell',{name:'CAPI bloqueada · ManyChat',exact:true})).toHaveAttribute('title',/navegador não foi confirmado/);
});
