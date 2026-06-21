// Edge Function: loader
// Serve o script de rastreamento configurado para uma propriedade específica.
// Uso: <script src="https://tqqqnmdffmzolnlrggqd.supabase.co/functions/v1/loader?id=PROPERTY_ID"></script>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url        = new URL(req.url);
  const propertyId = url.searchParams.get("id") || url.searchParams.get("pid");

  if (!propertyId) {
    return new Response("// loader: ?id= é obrigatório\nconsole.warn('[Tracker] Parâmetro ?id= não informado');", {
      status: 400,
      headers: { "Content-Type": "application/javascript", ...CORS },
    });
  }

  // Busca config da propriedade (service_role para contornar RLS)
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: prop, error } = await supabase
    .from("properties")
    .select("id, pixel_id, browser_pixel, fire_once, capi_enabled, event_add_to_cart, event_add_to_wishlist, event_lead, tracking_enabled")
    .eq("id", propertyId)
    .single();

  if (error || !prop) {
    return new Response(`// loader: propriedade '${propertyId}' não encontrada\nconsole.warn('[Tracker] Propriedade não encontrada');`, {
      status: 404,
      headers: { "Content-Type": "application/javascript", ...CORS },
    });
  }

  // Rastreamento desativado para esta propriedade: devolve script inerte (não
  // dispara pixel nem eventos). O <script> pode continuar na página do cliente.
  if (prop.tracking_enabled === false) {
    return new Response("// loader: rastreamento desativado para esta propriedade\nconsole.info('[Tracker] Rastreamento desativado');", {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        ...CORS,
      },
    });
  }

  // Gera o script de rastreamento configurado para esta propriedade
  const script = buildScript({
    propertyId:         prop.id,
    pixelId:            prop.pixel_id,
    supabaseUrl:        SUPABASE_URL,
    supabaseAnonKey:    SUPABASE_ANON,
    browserPixel:       prop.browser_pixel  ?? true,
    fireOnce:           prop.fire_once      ?? true,
    capiEnabled:        prop.capi_enabled   ?? true,
    eventAddToCart:     prop.event_add_to_cart    ?? false,
    eventAddToWishlist: prop.event_add_to_wishlist ?? false,
    eventLead:          prop.event_lead           ?? false,
  });

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Cache de 5 minutos no browser — muda de config reflete rápido
      "Cache-Control": "no-cache, no-store, must-revalidate",
      ...CORS,
    },
  });
});

// ─── Geração do script ────────────────────────────────────────────────────────
interface Config {
  propertyId:         string;
  pixelId:            string;
  supabaseUrl:        string;
  supabaseAnonKey:    string;
  browserPixel:       boolean;
  fireOnce:           boolean;
  capiEnabled:        boolean;
  eventAddToCart:     boolean;
  eventAddToWishlist: boolean;
  eventLead:          boolean;
}

function buildScript(c: Config): string {
  return `(function(){
  var PID   = ${JSON.stringify(c.propertyId)};
  var FBPIX = ${JSON.stringify(c.pixelId)};
  var SURL  = ${JSON.stringify(c.supabaseUrl)};
  var SKEY  = ${JSON.stringify(c.supabaseAnonKey)};
  var BROWSER_PIXEL   = ${c.browserPixel};
  var CAPI_ENABLED    = ${c.capiEnabled};
  var FIRE_ONCE       = ${c.fireOnce};
  var EV_ADD_TO_CART  = ${c.eventAddToCart};
  var EV_WISHLIST     = ${c.eventAddToWishlist};
  var EV_LEAD         = ${c.eventLead};

  /* ── Preview do dashboard: NÃO rastrear (sem pixel, sem evento) ── */
  try{if(new URL(window.location.href).searchParams.has('_tk_preview')){return;}}catch(e){}

  /* ── Fire-once por página (pathname) ── */
  var _firedMem={};
  function fireKey(){return'_tk_fired_'+PID+'_'+window.location.pathname;}
  function wasFired(){if(!FIRE_ONCE)return false;var k=fireKey();try{return!!sessionStorage.getItem(k);}catch(e){return!!_firedMem[k];}}
  function markFired(){if(!FIRE_ONCE)return;var k=fireKey();_firedMem[k]=1;try{sessionStorage.setItem(k,'1');}catch(e){}}

  /* ── Cookies ── */
  function getCookie(n){try{var m=document.cookie.match('(^|;) ?'+n+'=([^;]*)(;|$)');return m?m[2]:'';}catch(e){return'';}}
  function setCookie(n,v,d){try{var dt=new Date();dt.setTime(dt.getTime()+(d*864e5));document.cookie=n+'='+v+';path=/;expires='+dt.toUTCString()+';SameSite=Lax';}catch(e){}}

  /* ── External ID ── */
  function getExtId(){
    var k='fb_ext_id',id='';
    try{id=localStorage.getItem(k)||'';}catch(e){}
    if(!id)id=getCookie(k);
    if(!id){id='uid_'+Math.random().toString(36).substr(2,9)+Math.random().toString(36).substr(2,9);setCookie(k,id,365);}
    try{localStorage.setItem(k,id);}catch(e){}
    return id;
  }

  /* ── SHA-256 ── */
  function sha256(s){var b=new TextEncoder().encode(s);return crypto.subtle.digest('SHA-256',b).then(function(h){return Array.from(new Uint8Array(h)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');});}

  /* ── Advanced Matching via formulários ── */
  var _am={};
  function normPhone(s){var d=s.replace(/\\D/g,'');if(d.length<=11&&!d.startsWith('55'))d='55'+d;return d;}
  function detectFields(root){
    var r={},els=(root||document).querySelectorAll('input,select,textarea');
    for(var i=0;i<els.length;i++){
      var el=els[i],v=(el.value||'').trim();if(!v)continue;
      var t=(el.type||'').toLowerCase(),n=(el.name||el.id||'').toLowerCase(),ac=(el.autocomplete||'').toLowerCase(),pl=(el.placeholder||'').toLowerCase(),al=(el.getAttribute&&el.getAttribute('aria-label')||'').toLowerCase(),cls=(el.className||'').toLowerCase();
      var lt='';try{var lbl=el.id?document.querySelector('label[for="'+el.id+'"]'):null;if(!lbl){var fg=el.closest&&el.closest('.elementor-field-group');if(fg)lbl=fg.querySelector('label,.elementor-field-label');}if(lbl)lt=(lbl.textContent||'').toLowerCase();}catch(e){}
      var hints=n+' '+ac+' '+pl+' '+al+' '+lt;
      if(!r.email&&(t==='email'||/elementor-field-type-email/.test(cls)||/email/.test(hints)))r.email=v.toLowerCase();
      if(!r.phone&&(t==='tel'||/elementor-field-type-tel/.test(cls)||/phone|telefone|celular|whatsapp|fone|\\btel\\b/.test(hints)))r.phone=normPhone(v);
      if(!r.fn&&(/\\bname\\b|\\bnome\\b|fullname|full.?name|nome.?completo/.test(n)||/^name$/.test(ac)||/^nome$|^name$|nome.?completo|full.?name/.test(pl)||/^nome$|^name$|nome.?completo|full.?name/.test(al)||/^nome$|^name$|nome.?completo|full.?name/.test(lt.trim()))){var pts=v.trim().split(/\\s+/);if(pts.length>=1)r.fn=pts[0].toLowerCase();if(pts.length>=2)r.ln=pts[pts.length-1].toLowerCase();}
      if(!r.fn&&(/firstname|first.?name|fname|given.?name/.test(n+' '+pl+' '+al)||/given-name|firstname/.test(ac)||/first.?name/.test(lt)))r.fn=v.toLowerCase();
      if(!r.ln&&(/lastname|last.?name|lname|sobrenome|family.?name/.test(n+' '+pl+' '+al)||/family-name|lastname/.test(ac)||/sobrenome|last.?name/.test(lt)))r.ln=v.toLowerCase();
    }
    return r;
  }
  function applyAM(raw){
    if(!Object.keys(raw).length)return;
    var ps=[],h={};
    if(raw.email)ps.push(sha256(raw.email).then(function(x){h.em=x;}));
    if(raw.phone)ps.push(sha256(raw.phone).then(function(x){h.ph=x;}));
    if(raw.fn)   ps.push(sha256(raw.fn).then(function(x){h.fn=x;}));
    if(raw.ln)   ps.push(sha256(raw.ln).then(function(x){h.ln=x;}));
    Promise.all(ps).then(function(){
      if(!Object.keys(h).length)return;
      for(var k in h)_am[k]=h[k];
      // Re-init fbq com dados atualizados
      if(BROWSER_PIXEL&&/^\\d{10,20}$/.test(FBPIX)&&window.fbq){
        var ud={external_id:getExtId()};
        if(geoData){if(geoData.city)ud.ct=geoData.city;if(geoData.state)ud.st=geoData.state;if(geoData.zip)ud.zp=geoData.zip;if(geoData.country)ud.country=geoData.country;}
        for(var j in _am)ud[j]=_am[j];
        window.fbq('init',FBPIX,ud);
      }
    });
  }
  function watchForms(){
    document.addEventListener('blur',function(e){
      var el=e.target;if(!el||!el.value)return;
      var t=(el.type||'').toLowerCase(),n=(el.name||el.id||'').toLowerCase();
      if(t==='email'||t==='tel'||/email|phone|telefone|celular|nome|name/.test(n))applyAM(detectFields(null));
    },true);
    document.addEventListener('submit',function(e){applyAM(detectFields(e.target));},true);
  }

  /* ── FBP / FBC ── */
  function getOrCreateFbp(){
    var v=getCookie('_fbp');
    if(v)return v;
    v='fb.1.'+Date.now()+'.'+Math.floor(Math.random()*2147483647);
    setCookie('_fbp',v,90);
    try{localStorage.setItem('_fbp',v);}catch(e){}
    return v;
  }
  function getSubIdx(){var v=getCookie('_fbp');if(v){var p=v.split('.');if(p.length>=2)return p[1];}return'1';}
  function getFbc(){
    try{var fbclid=new URL(window.location.href).searchParams.get('fbclid');if(fbclid){var cached=getCookie('_fbc');try{if(!cached)cached=localStorage.getItem('_fbc')||'';}catch(e){}if(cached&&cached.split('.').slice(3).join('.')===fbclid)return cached;var fbc='fb.'+getSubIdx()+'.'+Date.now()+'.'+fbclid;setCookie('_fbc',fbc,90);try{localStorage.setItem('_fbc',fbc);}catch(e){}return fbc;}}catch(e){}
    var c=getCookie('_fbc');if(c)return c;
    try{c=localStorage.getItem('_fbc')||'';}catch(e){}if(c)return c;
    return'';
  }

  /* ── Tempo / IDs ── */
  function evtId(){try{var a=crypto.getRandomValues(new Uint8Array(9));return'ev_'+Array.from(a).map(function(b){return b.toString(16).padStart(2,'0')}).join('');}catch(e){return'ev_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}}
  function timeFields(){var n=new Date(),days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'],months=['january','february','march','april','may','june','july','august','september','october','november','december'],h=n.getHours();return{event_day:days[n.getDay()],event_day_in_month:n.getDate(),event_month:months[n.getMonth()],event_time_interval:h>=6&&h<12?'morning':h>=12&&h<18?'afternoon':h>=18&&h<24?'evening':'dawn'};}

  /* ── UTMs (capturadas da URL, mantidas na sessão p/ atribuir o Lead) ── */
  function getUtms(){
    var keys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id'];
    var out={},found=false;
    try{var sp=new URL(window.location.href).searchParams;for(var i=0;i<keys.length;i++){var v=sp.get(keys[i]);if(v){out[keys[i]]=v.slice(0,255);found=true;}}}catch(e){}
    try{if(found){sessionStorage.setItem('_tk_utms',JSON.stringify(out));}else{var c=sessionStorage.getItem('_tk_utms');if(c)out=JSON.parse(c)||{};}}catch(e){}
    return out;
  }

  /* ── Geo ── */
  var geoData=null;
  function fetchGeo(){
    try{var c=sessionStorage.getItem('_tk_geo');if(c){geoData=JSON.parse(c);return Promise.resolve();}}catch(e){}
    return fetch('https://ipwho.is/').then(function(r){return r.json();}).then(function(d){if(d&&d.success){geoData={ip:d.ip||'',country:(d.country_code||'').toLowerCase(),state:(d.region_code||d.region||'').toLowerCase().replace(/[^a-z]/g,'').slice(0,2),city:(d.city||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim(),zip:(d.postal||'').replace(/\\D/g,'')};try{sessionStorage.setItem('_tk_geo',JSON.stringify(geoData));}catch(e){}}}).catch(function(){});
  }

  /* ── CAPI ── */
  function sendCAPI(name,id){
    if(!CAPI_ENABLED)return;
    var tf=timeFields(),fbp=getOrCreateFbp(),fbc=getFbc();
    var p={event_name:name,event_time:Math.floor(Date.now()/1000),event_id:id,page_url:window.location.href,page_title:document.title||'',event_day:tf.event_day,event_day_in_month:tf.event_day_in_month,event_month:tf.event_month,event_time_interval:tf.event_time_interval,external_id:getExtId(),user_agent:navigator.userAgent,property_id:PID};
    if(fbp)p.fbp=fbp;if(fbc)p.fbc=fbc;
    if(geoData){if(geoData.ip)p.ip=geoData.ip;if(geoData.country)p.country=geoData.country;if(geoData.state)p.state=geoData.state;if(geoData.city)p.city=geoData.city;if(geoData.zip)p.zip=geoData.zip;}
    var um=getUtms();for(var uk in um)p[uk]=um[uk];
    var body=JSON.stringify(p);
    var url=SURL+'/functions/v1/track';
    function beacon(){try{if(navigator.sendBeacon)navigator.sendBeacon(url,new Blob([body],{type:'application/json'}));}catch(e){}}
    function attempt(n){
      try{
        fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true})
          .then(function(r){if(!r.ok&&n<2)setTimeout(function(){attempt(n+1);},800*(n+1));})
          .catch(function(){n<2?setTimeout(function(){attempt(n+1);},800*(n+1)):beacon();});
      }catch(e){beacon();}
    }
    attempt(0);
  }

  /* ── API pública ── */
  window._tracker={send:function(name,params){var p=params||{};if(!p.value)p.value=0;var id=evtId();if(BROWSER_PIXEL&&window.fbq)window.fbq('track',name,p,{eventID:id});sendCAPI(name,id);}};

  /* ── Disparo principal ── */
  function fire(){
    if(wasFired())return;
    if(!(/^\\d{10,20}$/.test(FBPIX))){console.error('[Tracker] Pixel ID inválido:',FBPIX,'— configure um ID numérico em Settings.');return;}
    markFired();
    var fbp=getOrCreateFbp();
    var ud={external_id:getExtId()};
    if(geoData){if(geoData.city)ud.ct=geoData.city;if(geoData.state)ud.st=geoData.state;if(geoData.zip)ud.zp=geoData.zip;if(geoData.country)ud.country=geoData.country;}
    var tf=timeFields();
    var cd={currency:'BRL',event_day:tf.event_day,event_month:tf.event_month,event_day_in_month:tf.event_day_in_month,event_time_interval:tf.event_time_interval};
    var idPV=evtId(),idVC=evtId();
    if(BROWSER_PIXEL){
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init',FBPIX,ud);
      window.fbq('track','PageView',cd,{eventID:idPV});
      var _vcd={currency:'BRL',value:0,content_name:document.title||'',content_ids:[window.location.pathname||'/'],content_type:'product',event_day:tf.event_day,event_month:tf.event_month,event_day_in_month:tf.event_day_in_month,event_time_interval:tf.event_time_interval};
      window.fbq('track','ViewContent',_vcd,{eventID:idVC});
    }
    sendCAPI('PageView',idPV);
    sendCAPI('ViewContent',idVC);
  }

  /* ── Lead ── */
  if(EV_LEAD){
    var _pendingLead=null;
    var _leadFired=false;

    // Coleta campos no submit (antes da validação Elementor)
    document.addEventListener('submit',function(e){
      _leadFired=false;
      var raw=detectFields(e.target);
      if(!Object.keys(raw).length)raw=detectFields(null);
      var ps=[],h={};
      if(raw.email)ps.push(sha256(raw.email).then(function(x){h.em=x;}));
      if(raw.phone)ps.push(sha256(raw.phone).then(function(x){h.ph=x;}));
      if(raw.fn)ps.push(sha256(raw.fn).then(function(x){h.fn=x;}));
      if(raw.ln)ps.push(sha256(raw.ln).then(function(x){h.ln=x;}));
      _pendingLead=Promise.all(ps).then(function(){return h;});
    },true);

    function fireLead(){
      if(_leadFired)return;_leadFired=true;
      var prom=_pendingLead||Promise.resolve({});_pendingLead=null;
      // Varredura fresca no momento do sucesso (inputs ainda no DOM antes do redirect)
      var fr=detectFields(null),fp=[],fh={};
      if(fr.email)fp.push(sha256(fr.email).then(function(x){fh.em=x;}));
      if(fr.phone)fp.push(sha256(fr.phone).then(function(x){fh.ph=x;}));
      if(fr.fn)fp.push(sha256(fr.fn).then(function(x){fh.fn=x;}));
      if(fr.ln)fp.push(sha256(fr.ln).then(function(x){fh.ln=x;}));
      Promise.all([prom,Promise.all(fp).then(function(){return fh;})]).then(function(rs){
        var h=rs[0],fhv=rs[1];
        // Fallback: varredura fresca → _am (blur)
        if(!h.em&&fhv.em)h.em=fhv.em;else if(!h.em&&_am.em)h.em=_am.em;
        if(!h.ph&&fhv.ph)h.ph=fhv.ph;else if(!h.ph&&_am.ph)h.ph=_am.ph;
        if(!h.fn&&fhv.fn)h.fn=fhv.fn;else if(!h.fn&&_am.fn)h.fn=_am.fn;
        if(!h.ln&&fhv.ln)h.ln=fhv.ln;else if(!h.ln&&_am.ln)h.ln=_am.ln;
        var id=evtId(),tf=timeFields(),fbp=getOrCreateFbp(),fbc=getFbc();
        var cd={currency:'BRL',event_day:tf.event_day,event_month:tf.event_month,event_day_in_month:tf.event_day_in_month,event_time_interval:tf.event_time_interval};
        if(BROWSER_PIXEL&&window.fbq)window.fbq('track','Lead',cd,{eventID:id});
        if(CAPI_ENABLED){
          var p={event_name:'Lead',event_time:Math.floor(Date.now()/1000),event_id:id,page_url:window.location.href,page_title:document.title||'',event_day:tf.event_day,event_day_in_month:tf.event_day_in_month,event_month:tf.event_month,event_time_interval:tf.event_time_interval,external_id:getExtId(),user_agent:navigator.userAgent,property_id:PID};
          if(fbp)p.fbp=fbp;if(fbc)p.fbc=fbc;
          if(geoData){if(geoData.ip)p.ip=geoData.ip;if(geoData.country)p.country=geoData.country;if(geoData.state)p.state=geoData.state;if(geoData.city)p.city=geoData.city;if(geoData.zip)p.zip=geoData.zip;}
          var um=getUtms();for(var uk in um)p[uk]=um[uk];
          if(h.em)p.em=h.em;if(h.ph)p.ph=h.ph;if(h.fn)p.fn=h.fn;if(h.ln)p.ln=h.ln;
          try{fetch(SURL+'/functions/v1/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),keepalive:true}).catch(function(){});}catch(e){}
        }
      });
    }

    // 1) Eventos nativos: document + window (Elementor dispara em ambos dependendo da versão)
    ['elementor/forms/success','elementor_pro/forms/submit_success'].forEach(function(ev){
      document.addEventListener(ev,fireLead);
      window.addEventListener(ev,fireLead);
    });

    // 2) MutationObserver — detecta mensagem de sucesso no DOM (formulários sem redirect)
    try{var _leadMO=new MutationObserver(function(muts){muts.forEach(function(m){m.addedNodes.forEach(function(nd){if(nd.nodeType!==1)return;var has=(nd.classList&&(nd.classList.contains('elementor-message-success')||nd.classList.contains('e-form__messages__success')))||(nd.querySelector&&nd.querySelector('.elementor-message-success,.e-form__messages__success'));if(has)fireLead();});});});_leadMO.observe(document.body||document.documentElement,{childList:true,subtree:true});}catch(e){}

    // 3) jQuery fallback — Elementor dispara 'submit_success' via jQuery
    setTimeout(function(){if(window.jQuery){window.jQuery(document).on('submit_success','.elementor-form',fireLead);}},500);
  }

  /* ── Helpers para cart/wishlist ── */
  function _cartClick(cls,evName){
    return function(e){
      // Ignora cliques em campos de formulário — a class pode estar no widget container
      var tg=(e.target.tagName||'').toUpperCase();
      if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT'||tg==='LABEL')return;
      var el=e.target;
      while(el&&el!==document){
        if(el.classList&&el.classList.contains(cls)){
          var id=evtId(),tf=timeFields();
          var cd={currency:'BRL',value:0,event_day:tf.event_day,event_month:tf.event_month,event_day_in_month:tf.event_day_in_month,event_time_interval:tf.event_time_interval};
          if(BROWSER_PIXEL&&window.fbq)window.fbq('track',evName,cd,{eventID:id});
          sendCAPI(evName,id);
          break;
        }
        el=el.parentElement;
      }
    };
  }

  /* ── Add to Cart ── */
  if(EV_ADD_TO_CART){
    document.addEventListener('click',_cartClick('addtocart-btn','AddToCart'),true);
  }

  /* ── Wishlist ── */
  if(EV_WISHLIST){
    document.addEventListener('click',_cartClick('addtowhist-btn','AddToWishlist'),true);
  }

  function ready(){
    var fired=false;
    function go(){if(fired)return;fired=true;fire();}
    watchForms();
    fetchGeo().then(go).catch(go); // geo chegar → dispara
    setTimeout(go,3000);           // timeout 3s → dispara com o que tem
  }
  if(document.readyState==='complete'||document.readyState==='interactive'){setTimeout(ready,0);}
  else{document.addEventListener('DOMContentLoaded',ready);}

  ${c.browserPixel ? `/* noscript fallback */
  (function(){var ns=document.createElement('noscript');var img=document.createElement('img');img.height=1;img.width=1;img.style.display='none';img.src='https://www.facebook.com/tr?id='+FBPIX+'&ev=PageView&noscript=1';ns.appendChild(img);document.body&&document.body.appendChild(ns);})();` : ''}
})();`;
}
