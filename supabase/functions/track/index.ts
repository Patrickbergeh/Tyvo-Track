import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response("invalid json", { status: 400, headers: CORS }); }

  // IP real do visitante via header do Supabase/CDN
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    (body.ip as string) ||
    null;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Geolocalização no SERVIDOR a partir do IP que será gravado — garante que
  // IP e localização batem. Cache em geo_cache evita repetir chamadas à API.
  const geo = await resolveGeo(supabase, ip);

  const row: Record<string, unknown> = {
    event_name:          body.event_name         ?? "PageView",
    event_time:          body.event_time         ?? Math.floor(Date.now() / 1000),
    event_id:            body.event_id           ?? null,
    page_url:            body.page_url           ?? null,
    page_title:          body.page_title         ?? null,
    property_id:         body.property_id        ?? null,
    external_id:         body.external_id        ?? null,
    user_agent:          body.user_agent         ?? null,
    fbp:                 body.fbp                ?? null,
    fbc:                 body.fbc                ?? null,
    event_day:           body.event_day          ?? null,
    event_day_in_month:  body.event_day_in_month ?? null,
    event_month:         body.event_month        ?? null,
    event_time_interval: body.event_time_interval ?? null,
    country:             geo?.country ?? body.country ?? null,
    state:               geo?.state   ?? body.state   ?? null,
    city:                geo?.city    ?? body.city    ?? null,
    zip:                 geo?.zip     ?? body.zip     ?? null,
    ip,
    em:                  body.em                 ?? null,
    ph:                  body.ph                 ?? null,
    fn:                  body.fn                 ?? null,
    ln:                  body.ln                 ?? null,
    utm_source:          body.utm_source         ?? null,
    utm_medium:          body.utm_medium         ?? null,
    utm_campaign:        body.utm_campaign       ?? null,
    utm_content:         body.utm_content        ?? null,
    utm_term:            body.utm_term           ?? null,
    utm_id:              body.utm_id             ?? null,
    processed: false,
  };

  const { data: inserted, error } = await supabase
    .from("fb_events_raw")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("track insert error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
  }

  // Envio em tempo real: dispara o process-fb-event para este evento
  // imediatamente, sem esperar o cron de fallback (~60s). Roda em segundo
  // plano (waitUntil) para não atrasar a resposta ao beacon do cliente.
  if (inserted?.id) {
    const trigger = fetch(`${SUPABASE_URL}/functions/v1/process-fb-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ id: inserted.id }),
    }).catch((e) => console.error("trigger process-fb-event error:", e));

    // @ts-ignore — EdgeRuntime existe no runtime do Supabase
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(trigger);
    } else {
      await trigger;
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
});

// ─── Geolocalização server-side (com cache) ──────────────────────────────────
type Geo = { country: string | null; state: string | null; city: string | null; zip: string | null };

// deno-lint-ignore no-explicit-any
async function resolveGeo(supabase: any, ip: string | null): Promise<Geo | null> {
  if (!ip) return null;
  // ignora IPs privados/loopback (não dá pra geolocalizar)
  if (/^(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i.test(ip)) return null;

  // 1) cache
  try {
    const { data: cached } = await supabase
      .from("geo_cache").select("country,state,city,zip").eq("ip", ip).maybeSingle();
    if (cached) return cached as Geo;
  } catch (_) { /* segue para o lookup */ }

  // 2) lookup na API
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(2500),
    });
    const g = await r.json();
    if (g && g.success) {
      const geo: Geo = {
        country: ((g.country_code || "") as string).toLowerCase() || null,
        state:   ((g.region_code  || "") as string).toLowerCase() || null,
        city:    ((g.city || "") as string).toLowerCase().normalize("NFD")
                   .replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").trim() || null,
        zip:     ((g.postal || "") as string).replace(/\D/g, "") || null,
      };
      // grava no cache (best-effort, não bloqueia em caso de corrida)
      try { await supabase.from("geo_cache").insert({ ip, ...geo }); } catch (_) { /* ok */ }
      return geo;
    }
  } catch (_) { /* falhou: usa fallback do client no row */ }

  return null;
}
