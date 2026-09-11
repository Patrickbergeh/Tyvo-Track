export type AttributionInput = {
  page_url?: unknown; referrer?: unknown; user_agent?: unknown;
  utm_source?: unknown; utm_medium?: unknown; utm_campaign?: unknown;
  utm_content?: unknown; utm_term?: unknown; utm_id?: unknown;
};

// Self-contained: the exact same classifier is embedded in the browser loader.
// A Meta click identifier is never evidence that a visit was paid.
export function classifyTraffic(input: AttributionInput) {
  const clean = (v: unknown): string => typeof v === "string" && !/\{\{|\}\}/.test(v) ? v.trim().slice(0, 255) : "";
  let url: URL | undefined;
  let ref: URL | undefined;
  try { url = new URL(String(input.page_url)); } catch { /* no URL */ }
  try { ref = new URL(String(input.referrer)); } catch { /* no referrer */ }
  const utms: Record<string, string> = {};
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"] as const;
  const explicitCampaign = keys.some(key => url?.searchParams.has(key));
  for (const key of keys) {
    const value = explicitCampaign ? clean(url?.searchParams.get(key)) : clean(input[key]);
    if (value) utms[key] = value;
  }
  const source = (utms.utm_source || "").toLowerCase();
  const medium = (utms.utm_medium || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ -]+/g, "_");
  const host = ref?.hostname.toLowerCase() || "";
  const instagram = /(^|\.)instagram\.com$/.test(host);
  const facebook = /(^|\.)(facebook\.com|fb\.com)$/.test(host);
  const inferredSource = instagram ? "instagram" : facebook ? "facebook" : /instagram/i.test(String(input.user_agent || "")) ? "instagram" : "";
  let traffic_source = source || inferredSource || (url?.searchParams.has("fbclid") ? "meta" : "");
  let traffic_medium = medium || "unknown";
  let traffic_kind = "unknown";
  let attribution_reason = "insufficient_evidence";
  if (["paid", "cpc", "cpm", "ppc", "paid_social", "paidsocial", "paid_search", "ads", "display", "retargeting"].includes(medium)) {
    traffic_kind = "paid"; attribution_reason = "explicit_paid_medium";
  } else if (["social", "organic", "organico", "organic_social", "organico_social", "conteudo", "content", "bio", "link_in_bio"].includes(medium)) {
    traffic_kind = "organic"; attribution_reason = "explicit_organic_medium";
  } else if (!medium && /^(bio|link_?in_?bio|link_?na_?bio)$/i.test(utms.utm_content || "")) {
    traffic_kind = "organic"; traffic_medium = "organic_social"; attribution_reason = "explicit_bio_content";
  } else if (medium) {
    traffic_kind = "other"; attribution_reason = "explicit_other_medium";
  } else if (source || inferredSource || url?.searchParams.has("fbclid")) {
    // A social referrer or in-app browser may be used for either ads or organic links.
    attribution_reason = url?.searchParams.has("fbclid") ? "meta_click_without_medium" : "source_without_medium";
  } else if (ref && ref.origin !== url?.origin) {
    traffic_source = host; traffic_medium = "referral"; traffic_kind = "other"; attribution_reason = "external_referrer";
  } else {
    traffic_source = "direct"; traffic_medium = "none"; traffic_kind = "unknown"; attribution_reason = "no_campaign_or_referrer";
  }
  return { ...utms, traffic_source, traffic_medium, traffic_kind, attribution_reason };
}
