// Normalização de UTMs — usada na tabela (Index) e no relatório (Report).

// Origem: ig/Instagram → "Instagram", FB/facebook → "Facebook", etc.
// Mantém null como null (a célula da tabela exibe "—").
export function prettySource(v: string | null): string | null {
  if (!v) return v;
  const k = v.trim().toLowerCase().replace(/[ -]+/g, "_");
  const map: Record<string, string> = {
    meta: "Meta (origem não determinada)", direct: "Direto / sem origem",
    ig: "Instagram", instagram: "Instagram",
    fb: "Facebook", facebook: "Facebook", "facebook.com": "Facebook",
    an: "Audience Network",
    msg: "Messenger", messenger: "Messenger",
    wa: "WhatsApp", whatsapp: "WhatsApp",
    google: "Google", google_ads: "Google", adwords: "Google",
    tiktok: "TikTok", tt: "TikTok",
    youtube: "YouTube", yt: "YouTube",
  };
  return map[k] ?? v;
}

// Mídia: paid/cpc → "Pago", social/organic → "Orgânico", etc.
export function prettyMedium(v: string | null): string | null {
  if (!v) return v;
  const k = v.trim().toLowerCase().replace(/[ -]+/g, "_");
  const map: Record<string, string> = {
    unknown: "Não determinado", none: "Sem mídia", paid_search: "Pago", paidsocial: "Pago", display: "Pago", retargeting: "Pago", bio: "Orgânico", link_in_bio: "Orgânico",
    paid: "Pago", cpc: "Pago", cpm: "Pago", ppc: "Pago", paid_social: "Pago", ads: "Pago",
    social: "Orgânico", organic: "Orgânico", organic_social: "Orgânico",
    conteudo: "Conteúdo", "conteúdo": "Conteúdo", content: "Conteúdo",
    email: "E-mail", referral: "Indicação",
  };
  return map[k] ?? v;
}

// Classifica a mídia em Pago vs Orgânico para a análise (conteúdo conta como orgânico).
export type MediumKind = "Pago" | "Orgânico" | "Outros";
export function mediumKind(v: string | null): MediumKind {
  if (!v) return "Outros";
  const k = v.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (["paid", "cpc", "cpm", "ppc", "paid_social", "paid_search", "paidsocial", "display", "retargeting", "ads"].includes(k)) return "Pago";
  if (["social", "organic", "organic_social", "conteudo", "conteúdo", "content", "bio", "link_in_bio"].includes(k)) return "Orgânico";
  return "Outros";
}
