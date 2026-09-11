import { readObject, RequestError, isUuid } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifyTraffic } from "../_shared/attribution.ts";
import { customData, eventTimestamp, validMetaCookie } from "../_shared/meta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const text = (v: unknown, max = 255) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await readObject(req);
    if (!isUuid(body.property_id)) return json({ error: "invalid_property_id" }, 400);
    if (typeof body.event_name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(body.event_name)) return json({ error: "invalid_event_name" }, 400);
    if (typeof body.event_id !== "string" || !/^[\w.:-]{1,128}$/.test(body.event_id)) return json({ error: "invalid_event_id" }, 400);
    let url: URL;
    try { url = new URL(body.page_url); } catch { return json({ error: "invalid_page_url" }, 400); }
    if (!["http:", "https:"].includes(url.protocol) || String(body.page_url).length > 8192) return json({ error: "invalid_page_url" }, 400);
    if (url.searchParams.has("_tk_preview")) return json({ skipped: true, reason: "preview" });
    let time: number;
    try { time = eventTimestamp(body.event_time); } catch (error) { return json({ error: (error as Error).message }, 400); }
    const { data: property, error: propError } = await supabase.from("properties").select("id,tracking_enabled,capi_enabled").eq("id", body.property_id).maybeSingle();
    if (propError) throw propError;
    if (!property) return json({ error: "property_not_found" }, 404);
    if (property.tracking_enabled === false) return json({ skipped: true, reason: "tracking_disabled" });
    const ingestKey = [property.id, body.event_name, body.event_id].join(":");
    const { data: existing, error: existingError } = await supabase.from("fb_events_raw").select("id").eq("property_id", property.id).eq("event_name", body.event_name).eq("event_id", body.event_id).limit(1);
    if (existingError) throw existingError;
    if (existing?.length) return json({ ok: true, duplicate: true });
    // Never trust a JSON override for the transport IP.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = text(req.headers.get("user-agent") || body.user_agent, 2048);
    const geo = await resolveGeo(supabase, ip);
    const row: Record<string, unknown> = {
      property_id: property.id, event_name: body.event_name, event_id: body.event_id,
      event_time: time, page_url: body.page_url, page_title: text(body.page_title, 1024),
      external_id: text(body.external_id), user_agent: userAgent, ip,
      fbp: validMetaCookie(body.fbp, "fbp") || null, fbc: validMetaCookie(body.fbc, "fbc") || null,
      country: geo?.country || null, state: geo?.state || null, city: geo?.city || null, zip: geo?.zip || null, lat: geo?.lat ?? null, lon: geo?.lon ?? null,
      referrer: text(body.referrer, 8192), landing_url: text(body.landing_url, 8192),
      ...classifyTraffic({ ...body, user_agent: userAgent }), custom_data: customData(body.custom_data), ingest_key: ingestKey,
      processed: property.capi_enabled === false, delivery_status: property.capi_enabled === false ? "skipped" : "pending",
      ...(property.capi_enabled === false ? { fb_response: { skipped: true, reason: "capi_disabled" } } : {}),
    };
    for (const key of ["em", "ph", "fn", "ln"]) {
      if (typeof body[key] === "string" && /^[a-f0-9]{64}$/i.test(body[key])) row[key] = body[key].toLowerCase();
    }
    for (const key of ["event_day", "event_month", "event_time_interval"]) row[key] = text(body[key], 20);
    if (Number.isInteger(body.event_day_in_month) && body.event_day_in_month >= 1 && body.event_day_in_month <= 31) row.event_day_in_month = body.event_day_in_month;
    const { data: inserted, error } = await supabase.from("fb_events_raw").insert(row).select("id").single();
    if (error?.code === "23505") return json({ ok: true, duplicate: true });
    if (error) throw error;
    if (inserted && property.capi_enabled !== false) {
      const trigger = fetch(`${SUPABASE_URL}/functions/v1/process-fb-event`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ id: inserted.id }), signal: AbortSignal.timeout(25000),
      }).then(response => { if (!response.ok) console.error("processor_trigger_status", response.status); }).catch(() => console.error("processor_trigger_failed"));
      // @ts-ignore Supabase runtime
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(trigger);
      else await trigger;
    }
    return json({ ok: true });
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("track_failed", (error as { code?: string })?.code || "internal_error");
    return json({ error: "tracking_unavailable" }, 503);
  }
});

// ─── Geolocalização server-side (com cache) ──────────────────────────────────
type Geo = { country: string | null; state: string | null; city: string | null; zip: string | null; lat: number | null; lon: number | null };

// deno-lint-ignore no-explicit-any
async function resolveGeo(supabase: any, ip: string | null): Promise<Geo | null> {
  if (!ip) return null;
  // ignora IPs privados/loopback (não dá pra geolocalizar)
  if (/^(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i.test(ip)) return null;

  // 1) cache
  try {
    const { data: cached } = await supabase
      .from("geo_cache").select("country,state,city,zip,lat,lon").eq("ip", ip).gte("created_at", new Date(Date.now() - 86400000).toISOString()).maybeSingle();
    if (cached && cached.lat != null && cached.lon != null) return cached as Geo;
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
        lat: typeof g.latitude === "number" ? g.latitude : null,
        lon: typeof g.longitude === "number" ? g.longitude : null,
        zip:     ((g.postal || "") as string).replace(/\D/g, "") || null,
      };
      // grava no cache (best-effort, não bloqueia em caso de corrida)
      try { await supabase.from("geo_cache").upsert({ ip, ...geo, created_at: new Date().toISOString() }, { onConflict: "ip" }); } catch (_) { /* ok */ }
      return geo;
    }
  } catch (_) { /* geo indisponível: mantém os campos ausentes */ }

  return null;
}
