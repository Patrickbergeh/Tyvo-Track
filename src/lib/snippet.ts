export function getSnippet(browserPixelEnabled: boolean): string {
  const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;
  const SUPABASE_KEY = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  return `<script>
(function(){
  var FB_PIXEL_ID = '642258762285772';
  var SUPABASE_URL = '${SUPABASE_URL}';
  var SUPABASE_KEY = '${SUPABASE_KEY}';
  var BROWSER_PIXEL = ${browserPixelEnabled ? 'true' : 'false'};

  // Preview do dashboard: NÃO rastrear (sem pixel, sem evento)
  try{if(new URL(window.location.href).searchParams.has('_tk_preview')){return;}}catch(e){}

  var geoData = null;

  function getCookie(n){
    var m = document.cookie.match('(^|;) ?'+n+'=([^;]*)(;|$)');
    return m ? m[2] : '';
  }
  function setCookie(n,v,d){
    var date = new Date();
    date.setTime(date.getTime()+(d*24*60*60*1000));
    document.cookie = n+"="+v+";path=/;expires="+date.toUTCString()+";SameSite=Lax";
  }
  function getExtId(){
    // localStorage persiste além dos 7 dias do ITP no Safari/iOS
    var LS_KEY = 'fb_ext_id';
    var id = '';
    try { id = localStorage.getItem(LS_KEY) || ''; } catch(e){}
    if(!id) id = getCookie('fb_ext_id');
    if(!id){
      id = 'uid_' + Math.random().toString(36).substr(2,9) + Math.random().toString(36).substr(2,9);
      setCookie('fb_ext_id', id, 365);
    }
    try { localStorage.setItem(LS_KEY, id); } catch(e){}
    return id;
  }
  function getSubIdx(){
    var fbpVal = getCookie('_fbp');
    if(fbpVal){
      var parts = fbpVal.split('.');
      if(parts.length >= 2) return parts[1];
    }
    var dots = window.location.hostname.split('.').length - 2;
    return dots > 0 ? String(dots) : '1';
  }
  function getFbc(){
    try {
      var fbclid = new URL(window.location.href).searchParams.get('fbclid');
      if(fbclid){
        var cached = getCookie('_fbc');
        try { if(!cached) cached = localStorage.getItem('_fbc') || ''; } catch(e){}
        if(cached && cached.split('.').slice(3).join('.') === fbclid) return cached;
        var fbc = 'fb.'+getSubIdx()+'.'+Date.now()+'.'+fbclid;
        setCookie('_fbc', fbc, 90);
        try { localStorage.setItem('_fbc', fbc); } catch(e){}
        return fbc;
      }
    } catch(e){}
    var c = getCookie('_fbc');
    if(c) return c;
    try { c = localStorage.getItem('_fbc') || ''; } catch(e){}
    if(c) return c;
    return '';
  }
  function generateEventId(){
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
  }

  function sha256(str){
    var buf = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', buf).then(function(hash){
      return Array.from(new Uint8Array(hash)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
    });
  }

  var hashedExtId = null;
  function getHashedExtId(){
    if(hashedExtId) return Promise.resolve(hashedExtId);
    return sha256(getExtId()).then(function(h){ hashedExtId = h; return h; });
  }

  // ── Coleta de dados de formulário (email, telefone, nome) ─────────────────
  var _userData = {};  // armazena hashes prontos para reusar

  function normalizePhone(raw){
    var digits = raw.replace(/\D/g,'');
    // Adiciona DDI do Brasil se parece número BR sem código de país
    if(digits.length <= 11 && !digits.startsWith('55')) digits = '55' + digits;
    return digits;
  }

  function detectFormFields(root){
    var result = {};
    var els = (root || document).querySelectorAll('input,select,textarea');
    for(var i=0; i<els.length; i++){
      var el = els[i];
      var value = (el.value || '').trim();
      if(!value) continue;
      var type  = (el.type         || '').toLowerCase();
      var name  = (el.name         || el.id || '').toLowerCase();
      var ac    = (el.autocomplete  || '').toLowerCase();
      var ph_   = (el.placeholder   || '').toLowerCase();

      // Email
      if(!result.email && (type==='email' || /email/.test(name) || /email/.test(ac) || /email/.test(ph_))){
        result.email = value.toLowerCase().trim();
      }
      // Telefone
      if(!result.phone && (type==='tel' || /phone|telefone|celular|whatsapp|fone|\btel\b/.test(name) || /tel/.test(ac) || /telefone|celular|whatsapp|phone/.test(ph_))){
        result.phone = normalizePhone(value);
      }
      // Primeiro nome
      if(!result.fn && (/firstname|first.?name|fname|\bnome\b|given.?name/.test(name) || /given-name|firstname/.test(ac))){
        result.fn = value.toLowerCase().trim();
      }
      // Último nome
      if(!result.ln && (/lastname|last.?name|lname|sobrenome|family.?name/.test(name) || /family-name|lastname/.test(ac))){
        result.ln = value.toLowerCase().trim();
      }
      // Nome completo → divide em fn + ln
      if(!result.fn && (/^name$|fullname|full.?name|nome.?completo/.test(name) || /^name$/.test(ac))){
        var parts = value.trim().split(/\s+/);
        if(parts.length >= 1) result.fn = parts[0].toLowerCase();
        if(parts.length >= 2) result.ln = parts[parts.length-1].toLowerCase();
      }
    }
    return result;
  }

  function applyUserData(raw){
    if(!Object.keys(raw).length) return;
    var promises = [];
    var hashed = {};
    if(raw.email) promises.push(sha256(raw.email).then(function(h){ hashed.em = h; }));
    if(raw.phone) promises.push(sha256(raw.phone).then(function(h){ hashed.ph = h; }));
    if(raw.fn)    promises.push(sha256(raw.fn).then(function(h){ hashed.fn = h; }));
    if(raw.ln)    promises.push(sha256(raw.ln).then(function(h){ hashed.ln = h; }));

    Promise.all(promises).then(function(){
      if(!Object.keys(hashed).length) return;
      // Mescla com dados já coletados
      for(var k in hashed) _userData[k] = hashed[k];
      // Re-init fbq com advanced matching atualizado
      if(BROWSER_PIXEL && typeof fbq !== 'undefined'){
        getHashedExtId().then(function(eid){
          fbq('init', FB_PIXEL_ID, Object.assign({}, _userData, { external_id: eid }));
        });
      }
    });
  }

  function watchForms(){
    // Blur em campos individuais (preenche campo por campo)
    document.addEventListener('blur', function(e){
      var el = e.target;
      if(!el || !el.value) return;
      var type = (el.type || '').toLowerCase();
      var name = (el.name || el.id || '').toLowerCase();
      if(type==='email'||type==='tel'||/email|phone|telefone|celular|nome|name/.test(name)){
        applyUserData(detectFormFields(null));
      }
    }, true);

    // Submit do formulário (captura tudo de uma vez)
    document.addEventListener('submit', function(e){
      applyUserData(detectFormFields(e.target));
    }, true);
  }

  function fetchGeo(){
    return fetch('https://ipwho.is/')
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d && d.success){
          geoData = {
            ip: d.ip || '',
            country: (d.country_code || '').toLowerCase(),
            st: (d.region_code || d.region || '').toLowerCase(),
            ct: (d.city || '').toLowerCase(),
            zp: d.postal || '',
            state: (d.region || '').toLowerCase(),
            city: (d.city || '').toLowerCase(),
            zip: d.postal || ''
          };
        }
      })
      .catch(function(){});
  }

  function getTimeFields(){
    var now = new Date();
    var days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    var months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    var hour = now.getHours();
    var interval = hour >= 6 && hour < 12 ? 'morning'
                 : hour >= 12 && hour < 18 ? 'afternoon'
                 : hour >= 18 && hour < 24 ? 'evening'
                 : 'dawn';
    return {
      event_day: days[now.getDay()],
      event_day_in_month: now.getDate(),
      event_month: months[now.getMonth()],
      event_time_interval: interval
    };
  }

  function sendToSupabase(eventName, eventId){
    var fbpVal = getCookie('_fbp');
    var fbcVal = getFbc();
    var timeFields = getTimeFields();
    var payload = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      page_url: window.location.href,
      page_title: document.title || '',
      event_day: timeFields.event_day,
      event_day_in_month: timeFields.event_day_in_month,
      event_month: timeFields.event_month,
      event_time_interval: timeFields.event_time_interval
    };
    payload.external_id = getExtId();
    payload.user_agent = navigator.userAgent;
    if(fbpVal) payload.fbp = fbpVal;
    if(fbcVal) payload.fbc = fbcVal;
    if(geoData){
      if(geoData.ip) payload.ip = geoData.ip;
      if(geoData.country) payload.country = geoData.country;
      if(geoData.state) payload.state = geoData.state;
      if(geoData.city) payload.city = geoData.city;
      if(geoData.zip) payload.zip = geoData.zip;
    }
    // Advanced matching — inclui dados de formulário se já coletados
    if(_userData.em) payload.em = _userData.em;
    if(_userData.ph) payload.ph = _userData.ph;
    if(_userData.fn) payload.fn = _userData.fn;
    if(_userData.ln) payload.ln = _userData.ln;
    var url = SUPABASE_URL + '/rest/v1/fb_events_raw';
    var headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal'
    };
    try {
      fetch(url, {
        method: 'POST', headers: headers, body: JSON.stringify(payload), keepalive: true
      }).catch(function(){});
    } catch(e){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        for(var k in headers) xhr.setRequestHeader(k, headers[k]);
        xhr.send(JSON.stringify(payload));
      } catch(e2){}
    }
  }

  function eventKey(eventName){
    return 'fb_sent_' + eventName + '_' + window.location.pathname;
  }
  function alreadySent(eventName){
    try { return localStorage.getItem(eventKey(eventName)) === '1'; } catch(e){ return false; }
  }
  function markSent(eventName){
    try { localStorage.setItem(eventKey(eventName), '1'); } catch(e){}
  }

  if(BROWSER_PIXEL){
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;
      n=f.fbq=function(){
        n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)
      };
      if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];
      t=b.createElement(e);t.async=!0;
      t.src=v;
      s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s);
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    getHashedExtId().then(function(hid){
      fbq('init', FB_PIXEL_ID, { external_id: hid });
    });
  }

  function buildPixelData(extra){
    var tf = getTimeFields();
    var d = {
      currency: 'BRL',
      action_source: 'website',
      event_source_url: window.location.href,
      client_user_agent: navigator.userAgent,
      event_day: tf.event_day,
      event_day_in_month: tf.event_day_in_month,
      event_month: tf.event_month,
      event_time_interval: tf.event_time_interval
    };
    if(geoData){
      if(geoData.ip)      d.client_ip_address = geoData.ip;
      if(geoData.ct)      d.ct      = geoData.ct;
      if(geoData.st)      d.st      = geoData.st;
      if(geoData.zp)      d.zp      = geoData.zp;
      if(geoData.country) d.country = geoData.country;
    }
    if(extra) for(var k in extra) d[k] = extra[k];
    return d;
  }

  function fireEvents(){
    // Reinit fbq com dados de geo + external_id hasheado para advanced matching
    if(BROWSER_PIXEL){
      getHashedExtId().then(function(hid){
        var userData = { external_id: hid };
        if(geoData){
          if(geoData.ct)      userData.ct      = geoData.ct;
          if(geoData.st)      userData.st      = geoData.st;
          if(geoData.zp)      userData.zp      = geoData.zp;
          if(geoData.country) userData.country = geoData.country;
        }
        fbq('init', FB_PIXEL_ID, userData);
      });
    }
    // PageView
    if(!alreadySent('PageView')){
      var evtId_pv = generateEventId();
      if(BROWSER_PIXEL) fbq('track', 'PageView', buildPixelData(), {eventID: evtId_pv});
      markSent('PageView');
      setTimeout(function(){
        if(!alreadySent('PageView_sv')){
          sendToSupabase('PageView', evtId_pv);
          markSent('PageView_sv');
        }
      }, 2000);
    }
    // ViewContent
    if(!alreadySent('ViewContent')){
      var evtId_vc = generateEventId();
      if(BROWSER_PIXEL) fbq('track', 'ViewContent', buildPixelData({ content_name: document.title || '', value: 0 }), {eventID: evtId_vc});
      markSent('ViewContent');
      setTimeout(function(){
        if(!alreadySent('ViewContent_sv')){
          sendToSupabase('ViewContent', evtId_vc);
          markSent('ViewContent_sv');
        }
      }, 2000);
    }
  }

  function ready(){
    watchForms();
    fetchGeo().then(function(){ fireEvents(); });
  }

  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(ready, 0);
  } else {
    document.addEventListener('DOMContentLoaded', ready);
  }

  window._trackerSendEvent = function(eventName, params){
    var p = params || {};
    if(typeof p.value === 'undefined') p.value = 0;
    var evtId = generateEventId();
    if(BROWSER_PIXEL) fbq('track', eventName, buildPixelData(p), {eventID: evtId});
    sendToSupabase(eventName, evtId);
  };
})();
<\/script>
${browserPixelEnabled ? `<noscript>
<img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=642258762285772&ev=PageView&noscript=1"/>
</noscript>` : ''}`;
}

// Default export mantém compatibilidade com imports existentes
export const SNIPPET_HTML = getSnippet(true);
