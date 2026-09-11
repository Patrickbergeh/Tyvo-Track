import { classifyTraffic } from "./attribution.ts";
import { validMetaCookie, customData } from "./meta.ts";
import { metaExclusionReason } from "./meta-policy.ts";

export interface Config {
  propertyId:         string;
  pixelId:            string;
  supabaseUrl:        string;
  browserPixel:       boolean;
  fireOnce:           boolean;
  capiEnabled:        boolean;
  eventAddToCart:     boolean;
  eventAddToWishlist: boolean;
  eventLead:          boolean;
}

export function buildScript(c: Config): string {
  return `(function(){
  var PID   = ${JSON.stringify(c.propertyId)};
  var FBPIX = ${JSON.stringify(c.pixelId)};
  var SURL  = ${JSON.stringify(c.supabaseUrl)};
  var BROWSER_PIXEL   = ${c.browserPixel};
  var CAPI_ENABLED    = ${c.capiEnabled};
  var FIRE_ONCE       = ${c.fireOnce};
  var EV_ADD_TO_CART  = ${c.eventAddToCart};
  var EV_WISHLIST     = ${c.eventAddToWishlist};
  var EV_LEAD         = ${c.eventLead};

  /* ── Preview do dashboard: NÃO rastrear (sem pixel, sem evento) ── */
  try{if(new URL(window.location.href).searchParams.has('_tk_preview')){return;}}catch(e){}

  window.__tyvoLoaded=window.__tyvoLoaded||{};
  if(window.__tyvoLoaded[PID])return;
  window.__tyvoLoaded[PID]=true;
  var classifyTraffic=${classifyTraffic.toString()};
  var metaExclusionReason=${metaExclusionReason.toString()};
  function metaBlocked(){return metaExclusionReason(getUtms());}
  var validMetaCookie=${validMetaCookie.toString()};
  var sanitizeData=${customData.toString()};

  /* ── Fire-once por página (pathname) ── */
  var _firedMem={};
  function fireKey(){return'_tk_fired_'+PID+'_'+window.location.pathname+'_'+JSON.stringify(getUtms());}
  function wasFired(){if(!FIRE_ONCE)return false;var k=fireKey();try{var t=Number(sessionStorage.getItem(k));return t>0&&Date.now()-t<1800000;}catch(e){return!!_firedMem[k];}}
  function markFired(){if(!FIRE_ONCE)return;var k=fireKey();_firedMem[k]=1;try{sessionStorage.setItem(k,String(Date.now()));}catch(e){}}

  /* ── Cookies ── */
  function getCookie(n){try{var m=document.cookie.match('(^|;) ?'+n+'=([^;]*)(;|$)');return m?m[2]:'';}catch(e){return'';}}
  function setCookie(n,v,d){try{var dt=new Date();dt.setTime(dt.getTime()+(d*864e5));document.cookie=n+'='+v+';path=/;expires='+dt.toUTCString()+';SameSite=Lax';}catch(e){}}

  var _extMemory='',_fbpMemory='',_fbcMemory='';
  /* ── External ID ── */
  function getExtId(){
    var k='fb_ext_id',id=_extMemory;
    try{id=id||localStorage.getItem(k)||'';}catch(e){}
    if(!id)id=getCookie(k);
    if(!id){id='uid_'+Math.random().toString(36).substr(2,9)+Math.random().toString(36).substr(2,9);setCookie(k,id,365);}
    try{localStorage.setItem(k,id);}catch(e){}
    _extMemory=id;return id;
  }

  /* ── SHA-256 ── */
  function sha256(s){try{var b=new TextEncoder().encode(s);return crypto.subtle.digest('SHA-256',b).then(function(h){return Array.from(new Uint8Array(h)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');}).catch(function(){return'';});}catch(e){return Promise.resolve('');}}
  function hashFields(raw){var ps=[],out={},keys={email:'em',phone:'ph',fn:'fn',ln:'ln'};Object.keys(keys).forEach(function(k){if(raw[k])ps.push(sha256(raw[k]).then(function(h){if(h)out[keys[k]]=h;}));});return Promise.all(ps).then(function(){return out;});}

  /* ── Advanced Matching via formulários ── */
  var _am={};
  function normPhone(s){var d=s.replace(/\\D/g,'');if(s.trim().charAt(0)!=='+'&&(d.length===10||d.length===11))d='55'+d;return d.length>=8&&d.length<=15?d:'';}
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
      _am=h;
      // Re-init fbq com dados atualizados
      if(BROWSER_PIXEL&&!metaBlocked()&&/^\\d{10,20}$/.test(FBPIX)&&window.fbq){
        var ud={external_id:getExtId()};
        if(geoData){if(geoData.city)ud.ct=geoData.city;if(geoData.state)ud.st=geoData.state;if(geoData.zip)ud.zp=geoData.zip;if(geoData.country)ud.country=geoData.country;}
        for(var j in _am)ud[j]=_am[j];
        try{window.fbq('init',FBPIX,ud);}catch(e){console.warn('[Tracker] Pixel indisponível');}
      }
    });
  }
  function watchForms(){
    document.addEventListener('blur',function(e){
      var el=e.target;if(!el||!el.value)return;
      var t=(el.type||'').toLowerCase(),n=(el.name||el.id||'').toLowerCase();
      if(t==='email'||t==='tel'||/email|phone|telefone|celular|nome|name/.test(n))applyAM(detectFields(el.form||el.closest&&el.closest('form')||{querySelectorAll:function(){return[el];}}));
    },true);
    document.addEventListener('submit',function(e){applyAM(detectFields(e.target));},true);
  }

  /* ── FBP / FBC ── */
  function getOrCreateFbp(){
    var v=validMetaCookie(getCookie('_fbp'),'fbp')||validMetaCookie(_fbpMemory,'fbp');
    if(v)return v;
    v='fb.1.'+Date.now()+'.'+Math.floor(Math.random()*2147483647);
    _fbpMemory=v;setCookie('_fbp',v,90);
    try{localStorage.setItem('_fbp',v);}catch(e){}
    return v;
  }
  function getSubIdx(){var v=getCookie('_fbp');if(v){var p=v.split('.');if(p.length>=2)return p[1];}return'1';}
  function getFbc(){
    var cached=validMetaCookie(getCookie('_fbc'),'fbc')||validMetaCookie(_fbcMemory,'fbc')||'';
    try{var fbclid=new URL(window.location.href).searchParams.get('fbclid');
      if(fbclid&&fbclid.length<=1800&&!/[\\s;]/.test(fbclid)){
        if(cached&&cached.split('.').slice(3).join('.')===fbclid)return cached;
        var fbc='fb.'+getSubIdx()+'.'+Date.now()+'.'+fbclid;
        _fbcMemory=fbc;setCookie('_fbc',fbc,90);return fbc;
      }
    }catch(e){}
    return cached;
  }

  /* ── Tempo / IDs ── */
  function evtId(){try{var a=crypto.getRandomValues(new Uint8Array(9));return'ev_'+Array.from(a).map(function(b){return b.toString(16).padStart(2,'0')}).join('');}catch(e){return'ev_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}}
  function timeFields(){var n=new Date(),days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'],months=['january','february','march','april','may','june','july','august','september','october','november','december'],h=n.getHours();return{event_day:days[n.getDay()],event_day_in_month:n.getDate(),event_month:months[n.getMonth()],event_time_interval:h>=6&&h<12?'morning':h>=12&&h<18?'afternoon':h>=18&&h<24?'evening':'dawn'};}

  /* Session attribution: explicit new entry replaces old UTMs, including bio after an ad. */
  var _attribution=null,_attributionPage='',_attributionAt=0;
  function getUtms(){
    if(_attribution&&_attributionPage===window.location.href&&Date.now()-_attributionAt<1800000){_attributionAt=Date.now();try{sessionStorage.setItem('_tk_attribution_'+PID,JSON.stringify({at:_attributionAt,data:_attribution}));}catch(e){}return _attribution;}
    var page=window.location.href,ref=document.referrer||'',sp=new URL(page).searchParams;
    var key='_tk_attribution_'+PID,old=_attribution?{at:_attributionAt,data:_attribution}:null,external=false;
    try{external=!_attributionPage&&!!ref&&new URL(ref).origin!==window.location.origin;}catch(e){}
    try{old=JSON.parse(sessionStorage.getItem(key)||'null')||old;}catch(e){}
    var previousClick='';try{previousClick=old&&old.data?new URL(old.data.landing_url).searchParams.get('fbclid')||'':'';}catch(e){}
    var click=sp.get('fbclid')||'';
    var fresh=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id'].some(function(k){return sp.has(k);})||(!!click&&click!==previousClick);
    if(!fresh&&!external&&old&&old.data&&typeof old.data==='object'&&!Array.isArray(old.data)&&typeof old.at==='number'&&Date.now()-old.at>=0&&Date.now()-old.at<1800000){_attribution=old.data;}
    else{
      _attribution=classifyTraffic({page_url:page,referrer:ref,user_agent:navigator.userAgent});
      _attribution.landing_url=page;_attribution.referrer=ref;
    }
    _attributionAt=Date.now();_attributionPage=page;
    try{sessionStorage.setItem(key,JSON.stringify({at:_attributionAt,data:_attribution}));}catch(e){}
    return _attribution;
  }
  getUtms();

  // Location is resolved by /track using the request IP. Never delay browser events for a third party.
  var geoData=null;

  /* ── CAPI ── */
  function sendCAPI(name,id,params,matching){
    var tf=timeFields(),fbp=getOrCreateFbp(),fbc=getFbc();
    var p={event_name:name,event_time:Math.floor(Date.now()/1000),event_id:id,page_url:window.location.href,page_title:document.title||'',event_day:tf.event_day,event_day_in_month:tf.event_day_in_month,event_month:tf.event_month,event_time_interval:tf.event_time_interval,external_id:getExtId(),user_agent:navigator.userAgent,property_id:PID};
    if(fbp)p.fbp=fbp;if(fbc)p.fbc=fbc;
    if(geoData){if(geoData.ip)p.ip=geoData.ip;if(geoData.country)p.country=geoData.country;if(geoData.state)p.state=geoData.state;if(geoData.city)p.city=geoData.city;if(geoData.zip)p.zip=geoData.zip;}
    var um=getUtms();for(var uk in um)p[uk]=um[uk];
    p.meta_policy_version=1;p.meta_pixel_suppressed=!!metaBlocked();
    p.custom_data=params||{};
    var am=matching||_am;for(var ak in am)p[ak]=am[ak];
    var body=JSON.stringify(p);
    var url=SURL+'/functions/v1/track';
    function beacon(){try{if(navigator.sendBeacon)navigator.sendBeacon(url,new Blob([body],{type:'text/plain;charset=UTF-8'}));}catch(e){}}
    function attempt(n){
      try{
        fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:body,keepalive:true})
          .then(function(r){if((r.status===429||r.status>=500)&&n<2)setTimeout(function(){attempt(n+1);},800*(n+1));})
          .catch(function(){n<2?setTimeout(function(){attempt(n+1);},800*(n+1)):beacon();});
      }catch(e){beacon();}
    }
    attempt(0);
  }

  /* ── API pública ── */
  window._tracker={send:function(name,params){if(typeof name!=='string'||! /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name))return null;var p=sanitizeData(params||{});if(name==='Purchase'&&(typeof p.value!=='number'||!p.currency)){console.error('[Tracker] Purchase requer valor e moeda válidos');return null;}var id=evtId();pixelEvent(name,p,id);sendCAPI(name,id,p);return id;}};
  window._trackerSendEvent=window._tracker.send;
  var _pixelInitialized=false;
  function pixelReady(){
    if(!BROWSER_PIXEL||metaBlocked()||!/^\\d{10,20}$/.test(FBPIX))return false;
    if(_pixelInitialized&&window.fbq)return true;
    try{
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      var ud={external_id:getExtId()};for(var k in _am)if(_am[k])ud[k]=_am[k];
      window.fbq('init',FBPIX,ud);_pixelInitialized=true;return true;
    }catch(e){console.warn('[Tracker] Pixel indisponível');return false;}
  }
  function pixelEvent(name,p,id){try{if(pixelReady()&&window.fbq){var standard=['PageView','ViewContent','Lead','AddToCart','AddToWishlist','InitiateCheckout','AddPaymentInfo','Purchase','CompleteRegistration','Search','Contact','Subscribe','StartTrial','Schedule','SubmitApplication','FindLocation','CustomizeProduct','Donate'];window.fbq(standard.indexOf(name)>=0?'trackSingle':'trackSingleCustom',FBPIX,name,p,{eventID:id});}}catch(e){console.warn('[Tracker] Pixel indisponível');}}

  /* ── Disparo principal ── */
  function fire(){
    if(!(/^\\d{10,20}$/.test(FBPIX))){console.error('[Tracker] Pixel ID inválido:',FBPIX,'— configure um ID numérico em Settings.');BROWSER_PIXEL=false;}
    var fbp=getOrCreateFbp();getFbc();
    var tf=timeFields();
    var cd={currency:'BRL',event_day:tf.event_day,event_month:tf.event_month,event_day_in_month:tf.event_day_in_month,event_time_interval:tf.event_time_interval};
    var idPV=evtId(),idVC=evtId();
    pixelReady();
    if(wasFired())return;
    markFired();
    var _vcd={currency:'BRL',content_name:document.title||'',event_day:tf.event_day,event_month:tf.event_month,event_day_in_month:tf.event_day_in_month,event_time_interval:tf.event_time_interval};
    if(BROWSER_PIXEL){
      pixelEvent('PageView',cd,idPV);
      pixelEvent('ViewContent',_vcd,idVC);
    }
    sendCAPI('PageView',idPV,cd);
    sendCAPI('ViewContent',idVC,_vcd);
  }

  /* Lead is tied to one submitted form and one successful attempt. */
  if(EV_LEAD){
    var _leadAttempts=[];
    function captureLead(e){
      var form=e.target;if(!form||String(form.tagName).toLowerCase()!=='form'||!form.querySelectorAll||form.matches&&!form.matches('.elementor-form'))return;
      _leadAttempts=_leadAttempts.filter(function(a){return a.form!==form&&Date.now()-a.at<600000;});
      _leadAttempts.push({form:form,at:Date.now(),fired:false,hashes:hashFields(detectFields(form))});
    }
    document.addEventListener('submit',captureLead,true);
    function fireLead(e){
      var target=e&&e.target,form=target&&target.closest&&target.closest('form');
      if(target&&String(target.tagName).toLowerCase()==='form')form=target;
      var candidates=_leadAttempts.filter(function(a){return!a.fired&&Date.now()-a.at<600000&&(!form||a.form===form);});
      if(candidates.length!==1)return;
      var attempt=candidates[0];attempt.fired=true;
      attempt.hashes.then(function(h){
        var id=evtId(),tf=timeFields();
        var cd={event_day:tf.event_day,event_month:tf.event_month,event_day_in_month:tf.event_day_in_month,event_time_interval:tf.event_time_interval};
        pixelEvent('Lead',cd,id);sendCAPI('Lead',id,cd,h);
      });
    }
    ['elementor/forms/success','elementor_pro/forms/submit_success'].forEach(function(ev){
      document.addEventListener(ev,fireLead);window.addEventListener(ev,fireLead);
    });
    try{var observer=new MutationObserver(function(muts){muts.forEach(function(m){m.addedNodes.forEach(function(nd){if(nd.nodeType!==1)return;var has=(nd.classList&&(nd.classList.contains('elementor-message-success')||nd.classList.contains('e-form__messages__success')))||(nd.querySelector&&nd.querySelector('.elementor-message-success,.e-form__messages__success'));if(has)fireLead({target:nd});});});});observer.observe(document.body||document.documentElement,{childList:true,subtree:true});}catch(e){}
    // jQuery may become available after the loader: register when the page is ready.
    function bindJquery(){if(window.jQuery){window.jQuery(document).on('submit.tyvo'+PID,'.elementor-form',captureLead).on('submit_success.tyvo'+PID,'.elementor-form',fireLead);}}
    if(document.readyState==='complete')bindJquery();else window.addEventListener('load',bindJquery,{once:true});
  }

  /* ── Helpers para cart/wishlist ── */
  function _cartClick(cls,evName){
    return function(e){
      // Ignora cliques em campos de formulário — a class pode estar no widget container
      var tg=(e.target&&e.target.tagName||'').toUpperCase();
      if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT'||tg==='LABEL')return;
      var el=e.target;
      while(el&&el!==document){
        if(el.classList&&el.classList.contains(cls)){
          var id=evtId(),tf=timeFields();
          var cd={currency:'BRL',event_day:tf.event_day,event_month:tf.event_month,event_day_in_month:tf.event_day_in_month,event_time_interval:tf.event_time_interval};
          pixelEvent(evName,cd,id);
          sendCAPI(evName,id,cd);
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
    go();
  }
  if(document.readyState==='complete'||document.readyState==='interactive'){setTimeout(ready,0);}
  else{document.addEventListener('DOMContentLoaded',ready);}

})();`;
}
