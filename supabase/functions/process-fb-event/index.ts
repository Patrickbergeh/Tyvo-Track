import { readObject, RequestError, isUuid } from "../_shared/http.ts";
import { normalizePostal } from "../_shared/geo.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authorized, FUNCTION_CORS } from "../_shared/auth.ts";
import { customData, eventTimestamp, hashIdentifier, metaAccepted, retryableMeta, validMetaCookie } from "../_shared/meta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_API_VERSION = Deno.env.get("META_API_VERSION") || "v26.0";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...FUNCTION_CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: FUNCTION_CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    if (!await authorized(req, supabase, SERVICE_KEY, SUPABASE_URL)) return json({ error: "unauthorized" }, 401);
    const body = await readObject(req, 16384, true);
    const ids = body.id !== undefined ? [body.id] : body.ids ?? null;
    if (ids !== null && (!Array.isArray(ids) || !ids.length || ids.length > 25 || ids.some(id => !isUuid(id)))) return json({ error: "invalid_ids" }, 400);
    if (body.propertyId !== undefined && !isUuid(body.propertyId)) return json({ error: "invalid_property" }, 400);
    // Accepted events cannot be force-replayed. Historical failures require an explicit recovery operation.
    const { data: events, error } = await supabase.rpc("claim_meta_events", { p_ids: ids, p_property: body.propertyId || null });
    if (error) throw error;
    if (!events?.length) return json({ accepted: 0, processed: 0, total: 0 });
    const { data: properties, error: propError } = await supabase.from("properties").select("id,pixel_id,access_token,capi_enabled,tracking_enabled,test_event_code,test_event_active").in("id", [...new Set(events.map((e: any) => e.property_id).filter(Boolean))]);
    if (propError) throw propError;
    const counts = { accepted: 0, failed: 0, retry: 0, skipped: 0, expired: 0 };
    async function finish(evt: any, status: keyof typeof counts, response: unknown, payload?: unknown) {
      const retry = status === "retry";
      const { error: updateError } = await supabase.from("fb_events_raw").update({
        processed: !retry, delivery_status: status, fb_response: response,
        ...(payload ? { payload_sent: payload } : {}), processing_started_at: null,
        next_retry_at: retry ? new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(evt.attempt_count - 1, 6))).toISOString() : null,
      }).eq("id", evt.id).eq("attempt_count", evt.attempt_count);
      if (updateError) throw updateError;
      counts[status]++;
    }
    // Bounded concurrency avoids one slow Meta request blocking the entire batch.
    for (let i = 0; i < events.length; i += 5) {
      await Promise.all(events.slice(i, i + 5).map(async (evt: any) => {
        let payload: Record<string, unknown> | undefined;
        try {
          const prop = properties?.find((p: any) => p.id === evt.property_id);
          if (!prop || !prop.tracking_enabled || !prop.capi_enabled || !prop.access_token || !/^\d{10,20}$/.test(prop.pixel_id)) {
            const reason = !prop ? "missing_property" : !prop.tracking_enabled ? "tracking_disabled" : !prop.capi_enabled ? "capi_disabled" : "invalid_pixel_configuration";
            await finish(evt, "skipped", { skipped: true, reason }); return;
          }
          let time: number;
          try { time = eventTimestamp(evt.event_time); } catch (error) {
            const reason = (error as Error).message;
            await finish(evt, reason === "event_expired" ? "expired" : "failed", { error: { message: reason } }); return;
          }
          if (!evt.event_id || !evt.page_url || !/^https?:\/\//.test(evt.page_url)) {
            await finish(evt, "failed", { error: { message: "missing_event_identity_or_url" } }); return;
          }
          const userData: Record<string, unknown> = {};
          if (evt.ip) userData.client_ip_address = evt.ip;
          if (evt.user_agent) userData.client_user_agent = evt.user_agent;
          for (const kind of ["fbp", "fbc"] as const) {
            const value = validMetaCookie(evt[kind], kind);
            if (value) userData[kind] = value;
          }
          await Promise.all(Object.entries({ external_id: "external_id", city: "ct", state: "st", zip: "zp", country: "country", em: "em", ph: "ph", fn: "fn", ln: "ln" }).map(async ([column, field]) => {
            const hash = await hashIdentifier(column === "zip" ? normalizePostal(evt.zip, evt.country) : evt[column], field);
            if (hash) userData[field] = hash;
          }));
          const cd = customData(evt.custom_data);
          for (const key of ["event_day", "event_day_in_month", "event_month", "event_time_interval"]) if (evt[key] != null) cd[key] = evt[key];
          if (evt.event_name === "ViewContent" && !cd.content_name && evt.page_title) cd.content_name = evt.page_title;
          // Never invent value, product IDs or a product type for a generic landing page.
          if (evt.event_name === "Purchase" && (typeof cd.value !== "number" || !cd.currency)) {
            await finish(evt, "failed", { error: { message: "purchase_requires_value_and_currency" } }); return;
          }
          payload = { data: [{ event_name: evt.event_name, event_time: time, event_id: evt.event_id, event_source_url: evt.page_url, action_source: "website", user_data: userData, custom_data: cd }] };
          if (prop.test_event_active && prop.test_event_code) payload.test_event_code = prop.test_event_code;
          const response = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${prop.pixel_id}/events`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${prop.access_token}` },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
          });
          let result: any;
          try { result = await response.json(); } catch { result = { error: { message: "invalid_meta_response", is_transient: true } }; }
          if (!result || typeof result !== "object" || Array.isArray(result)) result = { error: { message: "invalid_meta_response", is_transient: true } };
          const status = response.ok && metaAccepted(result) ? "accepted" : retryableMeta(response.status, result) && evt.attempt_count < 8 ? "retry" : "failed";
          await finish(evt, status, { ...result, http_status: response.status }, payload);
        } catch {
          // Persist network failures individually; retry with the original event identity and timestamp.
          await finish(evt, evt.attempt_count < 8 ? "retry" : "failed", { error: { message: "delivery_unavailable" } }, payload);
        }
      }));
    }
    return json({ ...counts, processed: counts.accepted, total: events.length });
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("process_meta_failed");
    return json({ error: "processing_unavailable" }, 503);
  }
});
