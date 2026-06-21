import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_API_VERSION = "v19.0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sha256(value: string): Promise<string> {
  const normalized = value.trim().toLowerCase();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashIfPresent(value: string | null | undefined): Promise<string[] | undefined> {
  if (!value) return undefined;
  return [await sha256(value)];
}

interface GeoResult {
  city: string;
  state: string;
  zip: string;
  country: string;
  lat: number | null;
  lon: number | null;
}

async function resolveGeo(ip: string): Promise<GeoResult | null> {
  try {
    const res = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(4000) });
    const d = await res.json();
    if (!d || !d.success) return null;
    return {
      city:    (d.city           || "").toLowerCase(),
      state:   (d.region         || "").toLowerCase(),
      zip:     (d.postal         || ""),
      country: (d.country_code   || "").toLowerCase(),
      lat:     typeof d.latitude  === "number" ? d.latitude  : null,
      lon:     typeof d.longitude === "number" ? d.longitude : null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    // Disparo em tempo real: o endpoint /track chama esta função com { id }
    // logo após inserir o evento. Sem body = modo lote (cron de fallback).
    // Reenvio manual: { ids: [...], force: true } reprocessa eventos específicos
    // mesmo já marcados como processed (ex.: recuperar falhas dentro de 7 dias).
    let onlyIds: string[] = [];
    let force = false;
    try {
      const b = await req.json();
      if (b && typeof b.id === "string") onlyIds = [b.id];
      if (b && Array.isArray(b.ids)) onlyIds = b.ids.filter((x: unknown) => typeof x === "string");
      if (b && b.force === true) force = true;
    } catch { /* sem body = processa o lote pendente */ }

    // 1. Busca os eventos a processar
    let query = supabase.from("fb_events_raw").select("*");
    if (onlyIds.length) {
      query = query.in("id", onlyIds);
      if (!force) query = query.eq("processed", false);
    } else {
      query = query.eq("processed", false).limit(100);
    }
    const { data: events, error: eventsErr } = await query;

    if (eventsErr) throw eventsErr;
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    // 2. Carrega todas as propriedades necessárias de uma vez
    // Inclui sempre a propriedade padrão como fallback para eventos sem property_id
    const DEFAULT_PROPERTY_ID = "00000000-0000-0000-0000-000000000001";
    const propertyIds = [...new Set([
      DEFAULT_PROPERTY_ID,
      ...events.map((e) => e.property_id).filter(Boolean),
    ])];
    const { data: properties } = await supabase
      .from("properties")
      .select("id, pixel_id, access_token, capi_enabled, test_event_code, test_event_active")
      .in("id", propertyIds);

    const propMap: Record<string, { pixel_id: string; access_token: string; capi_enabled: boolean; test_event_code: string | null; test_event_active: boolean }> = {};
    for (const p of properties ?? []) {
      propMap[p.id] = p;
    }

    let processedCount = 0;
    let skippedCount = 0;

    // 3. Processa cada evento
    for (const evt of events) {
      // Usa a propriedade do evento; se null, cai no fallback da propriedade padrão
      const prop = propMap[evt.property_id ?? DEFAULT_PROPERTY_ID] ?? null;

      const accessToken = prop?.access_token ?? "";
      const pixelId = prop?.pixel_id ?? "";
      const capiEnabled = prop?.capi_enabled ?? true;

      // Pula se não tem token, CAPI desativado ou pixel_id inválido
      const pixelIdValid = /^\d{10,20}$/.test(pixelId);
      if (!capiEnabled || !accessToken || !pixelId || !pixelIdValid) {
        const reason = !pixelIdValid ? "invalid_pixel_id" : "capi_disabled_or_no_token";
        await supabase
          .from("fb_events_raw")
          .update({ processed: true, fb_response: { skipped: true, reason } })
          .eq("id", evt.id);
        skippedCount++;
        continue;
      }

      // 4. Resolve geo pelo servidor se estiver faltando no evento
      let city    = evt.city    || null;
      let state   = evt.state   || null;
      let zip     = evt.zip     || null;
      let country = evt.country || null;
      let lat     = evt.lat     ?? null;
      let lon     = evt.lon     ?? null;

      if (evt.ip && (!city || lat == null)) {
        const geo = await resolveGeo(evt.ip);
        if (geo) {
          city    = city    || geo.city;
          state   = state   || geo.state;
          zip     = zip     || geo.zip;
          country = country || geo.country;
          lat     = lat     ?? geo.lat;
          lon     = lon     ?? geo.lon;

          // Persiste o geo resolvido no banco para o mapa e futuros acessos
          await supabase
            .from("fb_events_raw")
            .update({ city, state, zip, country, lat, lon })
            .eq("id", evt.id);
        }
      }

      // 5. Monta user_data com hashing SHA-256
      const [hashedExtId, hashedCity, hashedState, hashedZip, hashedCountry] = await Promise.all([
        hashIfPresent(evt.external_id),
        hashIfPresent(city),
        hashIfPresent(state),
        hashIfPresent(zip),
        hashIfPresent(country),
      ]);

      const userData: Record<string, unknown> = {
        client_ip_address: evt.ip || undefined,
        client_user_agent: evt.user_agent || undefined,
        fbp: evt.fbp || undefined,
        fbc: evt.fbc || undefined,
      };
      if (hashedExtId) userData.external_id = hashedExtId;
      if (hashedCity) userData.ct = hashedCity;
      if (hashedState) userData.st = hashedState;
      if (hashedZip) userData.zp = hashedZip;
      if (hashedCountry) userData.country = hashedCountry;

      // Advanced Matching — já chegam pré-hasheados pelo script do cliente
      if (evt.em) userData.em = [evt.em];
      if (evt.ph) userData.ph = [evt.ph];
      if (evt.fn) userData.fn = [evt.fn];
      if (evt.ln) userData.ln = [evt.ln];

      // Remove chaves undefined
      for (const key of Object.keys(userData)) {
        if (userData[key] === undefined) delete userData[key];
      }

      // 6. Normaliza o event_time.
      // O Facebook rejeita (subcode 2804004) timestamps no futuro, em
      // milissegundos ou com mais de 7 dias. O event_time vem do relógio do
      // visitante, que pode estar adiantado — então saneamos no servidor.
      const nowSec = Math.floor(Date.now() / 1000);
      const SEVEN_DAYS = 7 * 24 * 60 * 60;
      let eventTime = Number(evt.event_time);
      if (!Number.isFinite(eventTime) || eventTime <= 0) eventTime = nowSec;
      // Se veio em milissegundos (13 dígitos), converte para segundos
      if (eventTime > nowSec * 100) eventTime = Math.floor(eventTime / 1000);
      // Relógio do cliente adiantado → trava no "agora"
      if (eventTime > nowSec) eventTime = nowSec;
      // Evento velho demais → puxa para dentro da janela de 7 dias
      if (eventTime < nowSec - SEVEN_DAYS) eventTime = nowSec - SEVEN_DAYS + 600;

      // 7. Monta o evento CAPI
      const eventData: Record<string, unknown> = {
        event_name: evt.event_name ?? "PageView",
        event_time: eventTime,
        event_id: evt.event_id,
        event_source_url: evt.page_url,
        action_source: "website",
        user_data: userData,
      };

      // custom_data — campos de tempo para todos os eventos + dados específicos por tipo
      const customData: Record<string, unknown> = {
        currency: "BRL",
      };
      if (evt.event_day) customData.event_day = evt.event_day;
      if (evt.event_day_in_month != null) customData.event_day_in_month = evt.event_day_in_month;
      if (evt.event_month) customData.event_month = evt.event_month;
      if (evt.event_time_interval) customData.event_time_interval = evt.event_time_interval;
      if (evt.event_name === "ViewContent") {
        customData.value = 0;
        customData.content_type = "product";
        if (evt.page_title) customData.content_name = evt.page_title;
        if (evt.page_url) {
          try { customData.content_ids = [new URL(evt.page_url).pathname || "/"]; } catch { customData.content_ids = ["/"]; }
        }
      }
      eventData.custom_data = customData;

      const payload: Record<string, unknown> = { data: [eventData] };
      if (prop?.test_event_active && prop?.test_event_code) {
        payload.test_event_code = prop.test_event_code;
      }

      // 8. Envia para a CAPI do Facebook
      const fbUrl = `https://graph.facebook.com/${FB_API_VERSION}/${pixelId}/events?access_token=${accessToken}`;
      const fbRes = await fetch(fbUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const fbJson = await fbRes.json();

      // 9. Atualiza o evento no banco
      await supabase
        .from("fb_events_raw")
        .update({
          processed: true,
          payload_sent: payload,
          fb_response: fbJson,
        })
        .eq("id", evt.id);

      processedCount++;
    }

    return new Response(
      JSON.stringify({ processed: processedCount, skipped: skippedCount, total: events.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-fb-event error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
