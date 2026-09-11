import { isUuid } from "../_shared/http.ts";
// Edge Function: loader
// Serve o script de rastreamento configurado para uma propriedade específica.
// Uso: <script src="https://tqqqnmdffmzolnlrggqd.supabase.co/functions/v1/loader?id=PROPERTY_ID"></script>

import { buildScript } from "../_shared/browser.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method !== "GET") return new Response(null, { status: 405, headers: CORS });

  const url        = new URL(req.url);
  const propertyId = url.searchParams.get("id") || url.searchParams.get("pid");

  if (!isUuid(propertyId)) {
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
    return new Response("// loader: propriedade não encontrada", {
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
