import { classifyTraffic } from "./attribution.ts";

// Embedded unchanged in the browser. Re-evaluate raw attribution server-side;
// never trust a caller-supplied traffic_kind or exclusion reason.
export function metaExclusionReason(input: Record<string, unknown>): string | null {
  const attribution: Record<string, string> = classifyTraffic(input);
  const normalize = (value: unknown) => typeof value === "string"
    ? value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_") : "";
  const markers = [attribution.utm_source, attribution.utm_medium, attribution.utm_campaign, attribution.utm_content].map(normalize);
  let manychatReferrer = false;
  try { manychatReferrer = /(^|\.)manychat\.com$/.test(new URL(String(input.referrer)).hostname.toLowerCase()); } catch {}
  if (manychatReferrer || markers.some(value => /(^|_)(many_?chat|may_?chat)(_|$)/.test(value))) return "excluded_manychat";
  const bioMarkers = [attribution.utm_source, attribution.utm_medium, attribution.utm_content].map(normalize);
  if (bioMarkers.some(value => /^(?:(?:instagram|ig)_)?(?:bio|link_?(?:in|na|da)_?bio)(?:_(?:instagram|ig))?$/.test(value))) return "excluded_bio";
  if (attribution.traffic_kind === "organic") return "excluded_organic";
  return null;
}
