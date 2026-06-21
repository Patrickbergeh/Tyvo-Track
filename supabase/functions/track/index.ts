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
    country:             body.country            ?? null,
    state:               body.state              ?? null,
    city:                body.city               ?? null,
    zip:                 body.zip                ?? null,
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

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
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
