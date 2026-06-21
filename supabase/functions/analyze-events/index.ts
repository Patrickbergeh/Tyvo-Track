/**
 * Edge Function: analyze-events
 *
 * - Busca TODOS os eventos da propriedade (paginação paralela, sem limite)
 * - Agrega UTMs, tráfego e eventos
 * - Chama gpt-4o-mini com prompt compacto (economia de tokens)
 * - Salva resultado em .md no Supabase Storage (bucket: analyses)
 * - Retorna dados + histórico de arquivos salvos
 *
 * Secret necessário: OPENAI_API_KEY
 *   supabase secrets set OPENAI_API_KEY=sk-...
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY    = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL  = "gpt-4o-mini";
const OPENAI_URL    = "https://api.openai.com/v1/chat/completions";
const BUCKET        = "analyses";
const BATCH_SIZE    = 1000;   // linhas por request
const CONCURRENCY   = 10;     // requests simultâneos

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface RankedItem { name: string; count: number }
interface AiBlock    { summary: string; insights: string[]; score: number }

interface EventRow {
  page_url: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  ip: string | null;
  event_name: string | null;
  processed: boolean;
  event_day: string | null;
  event_time_interval: string | null;
}

// ── Fetch ALL events (parallel batches) ───────────────────────────────────────
async function fetchAllEvents(supabase: ReturnType<typeof createClient>, propertyId: string): Promise<EventRow[]> {
  // 1. Total count first
  const { count } = await supabase
    .from("fb_events_raw")
    .select("*", { count: "exact", head: true })
    .eq("property_id", propertyId);

  const total = count ?? 0;
  if (total === 0) return [];

  const numBatches = Math.ceil(total / BATCH_SIZE);
  const allRows: EventRow[] = [];

  // 2. Busca em grupos paralelos de CONCURRENCY
  for (let g = 0; g < numBatches; g += CONCURRENCY) {
    const batchIndexes = Array.from(
      { length: Math.min(CONCURRENCY, numBatches - g) },
      (_, i) => g + i
    );

    const results = await Promise.all(
      batchIndexes.map(b =>
        supabase
          .from("fb_events_raw")
          .select("page_url, country, state, city, ip, event_name, processed, event_day, event_time_interval")
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .range(b * BATCH_SIZE, (b + 1) * BATCH_SIZE - 1)
      )
    );

    for (const { data } of results) {
      if (data) allRows.push(...(data as EventRow[]));
    }
  }

  return allRows;
}

// ── Aggregation helpers ───────────────────────────────────────────────────────
function sortTop(obj: Record<string, number>, n: number): RankedItem[] {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function extractUtms(events: EventRow[]) {
  const sources: Record<string, number>   = {};
  const mediums: Record<string, number>   = {};
  const campaigns: Record<string, number> = {};

  for (const evt of events) {
    try {
      const u = new URL(/^https?:\/\//i.test(evt.page_url ?? "") ? evt.page_url! : "https://x.com");
      const s = u.searchParams.get("utm_source");
      const m = u.searchParams.get("utm_medium");
      const c = u.searchParams.get("utm_campaign");
      if (s) sources[s]   = (sources[s]   ?? 0) + 1;
      if (m) mediums[m]   = (mediums[m]   ?? 0) + 1;
      if (c) campaigns[c] = (campaigns[c] ?? 0) + 1;
    } catch { /* URL inválida */ }
  }

  const withUtm = Object.values(sources).reduce((a, b) => a + b, 0);
  return { withUtm, total: events.length, sources: sortTop(sources, 10), mediums: sortTop(mediums, 10), campaigns: sortTop(campaigns, 10) };
}

function aggregateTraffic(events: EventRow[]) {
  const countries: Record<string, number> = {};
  const states:    Record<string, number> = {};
  const cities:    Record<string, number> = {};

  for (const evt of events) {
    if (evt.country) countries[evt.country] = (countries[evt.country] ?? 0) + 1;
    if (evt.state)   states[evt.state]       = (states[evt.state]       ?? 0) + 1;
    if (evt.city)    cities[evt.city]         = (cities[evt.city]         ?? 0) + 1;
  }

  const uniqueVisitors = new Set(events.map(e => e.ip).filter(Boolean)).size;
  return { uniqueVisitors, total: events.length, countries: sortTop(countries, 10), states: sortTop(states, 10), cities: sortTop(cities, 10) };
}

function aggregateEvents(events: EventRow[]) {
  const types:     Record<string, number> = {};
  const days:      Record<string, number> = {};
  const intervals: Record<string, number> = {};

  for (const evt of events) {
    if (evt.event_name)          types[evt.event_name]                   = (types[evt.event_name]                   ?? 0) + 1;
    if (evt.event_day)           days[evt.event_day]                     = (days[evt.event_day]                     ?? 0) + 1;
    if (evt.event_time_interval) intervals[evt.event_time_interval]      = (intervals[evt.event_time_interval]      ?? 0) + 1;
  }

  const processed = events.filter(e => e.processed).length;
  return {
    total: events.length, processed, pending: events.length - processed,
    processRate: events.length > 0 ? Math.round((processed / events.length) * 100) : 0,
    types: sortTop(types, 10), days: sortTop(days, 7), intervals: sortTop(intervals, 4),
  };
}

// ── OpenAI call (prompt compacto) ─────────────────────────────────────────────
async function callOpenAI(utms: ReturnType<typeof extractUtms>, traffic: ReturnType<typeof aggregateTraffic>, evs: ReturnType<typeof aggregateEvents>): Promise<{ utms: AiBlock; traffic: AiBlock; events: AiBlock } | null> {
  if (!OPENAI_KEY) return null;

  const top = (arr: RankedItem[], n = 5) => arr.slice(0, n).map(i => `${i.name}(${i.count})`).join(",") || "-";
  const pct = (n: number, t: number)    => t > 0 ? `${Math.round((n / t) * 100)}%` : "0%";

  const prompt =
`Analista marketing digital. Responda APENAS JSON válido.

DADOS(${utms.total} eventos):
UTM: com=${utms.withUtm}(${pct(utms.withUtm,utms.total)}) fontes=${top(utms.sources)} meios=${top(utms.mediums)} camp=${top(utms.campaigns)}
TRÁFEGO: únicos=${traffic.uniqueVisitors} países=${top(traffic.countries)} estados=${top(traffic.states)} cidades=${top(traffic.cities)}
CAPI: taxa=${evs.processRate}% total=${evs.total} tipos=${top(evs.types)} períodos=${top(evs.intervals)}

JSON:{"utms":{"summary":"1 frase","insights":["insight1","insight2","insight3"],"score":0-100},"traffic":{"summary":"1 frase","insights":["insight1","insight2","insight3"],"score":0-100},"events":{"summary":"1 frase","insights":["insight1","insight2","insight3"],"score":0-100}}`;

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: OPENAI_MODEL, temperature: 0.2, max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) { console.error("OpenAI error:", res.status, await res.text()); return null; }
    const json = await res.json();
    return JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  } catch (err) { console.error("OpenAI failed:", err); return null; }
}

// ── Build .md content ─────────────────────────────────────────────────────────
function buildMarkdown(
  propertyId: string,
  propertyName: string,
  utms: ReturnType<typeof extractUtms>,
  traffic: ReturnType<typeof aggregateTraffic>,
  evs: ReturnType<typeof aggregateEvents>,
  ai: { utms: AiBlock; traffic: AiBlock; events: AiBlock } | null,
  generatedAt: string
): string {
  const fmt  = (arr: RankedItem[], n = 10) => arr.slice(0, n).map((i, j) => `${j + 1}. ${i.name} — ${i.count.toLocaleString()}`).join("\n");
  const pct  = (n: number, t: number)      => t > 0 ? `${Math.round((n / t) * 100)}%` : "0%";
  const aiBlock = (b: AiBlock | null, label: string) =>
    b ? `**Score:** ${b.score}/100\n\n> ${b.summary}\n\n**Insights:**\n${b.insights.map((x, i) => `${i + 1}. ${x}`).join("\n")}`
      : `*${label}*`;

  return `# Análise Codmov
**Propriedade:** ${propertyName} (\`${propertyId}\`)
**Data:** ${generatedAt}
**Eventos analisados:** ${evs.total.toLocaleString()}

---

## UTMs ${ai?.utms ? `· Score ${ai.utms.score}/100` : ""}

${aiBlock(ai?.utms ?? null, "IA indisponível nesta análise")}

**Cobertura UTM:** ${utms.withUtm.toLocaleString()} de ${utms.total.toLocaleString()} eventos (${pct(utms.withUtm, utms.total)})

**Top Fontes (utm_source):**
${fmt(utms.sources)}

**Top Meios (utm_medium):**
${fmt(utms.mediums)}

**Top Campanhas (utm_campaign):**
${fmt(utms.campaigns)}

---

## Origem do Tráfego ${ai?.traffic ? `· Score ${ai.traffic.score}/100` : ""}

${aiBlock(ai?.traffic ?? null, "IA indisponível nesta análise")}

**Visitantes únicos (IP):** ${traffic.uniqueVisitors.toLocaleString()}

**Top Países:**
${fmt(traffic.countries)}

**Top Estados:**
${fmt(traffic.states)}

**Top Cidades:**
${fmt(traffic.cities)}

---

## Análise de Envios ${ai?.events ? `· Score ${ai.events.score}/100` : ""}

${aiBlock(ai?.events ?? null, "IA indisponível nesta análise")}

**Taxa CAPI:** ${evs.processRate}%
**Processados:** ${evs.processed.toLocaleString()} | **Pendentes:** ${evs.pending.toLocaleString()}

**Tipos de evento:**
${fmt(evs.types)}

**Dias de pico:**
${fmt(evs.days)}

**Períodos do dia:**
${fmt(evs.intervals)}
`;
}

// ── Storage helpers ───────────────────────────────────────────────────────────
async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  try {
    await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024 });
  } catch { /* já existe */ }
}

async function saveMarkdown(supabase: ReturnType<typeof createClient>, propertyId: string, content: string, eventCount: number): Promise<string | null> {
  await ensureBucket(supabase);
  const ts       = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${propertyId}/${ts}_${eventCount}evt.md`;
  const { error } = await supabase.storage.from(BUCKET).upload(filename, content, {
    contentType: "text/markdown; charset=utf-8",
    upsert: false,
  });
  if (error) { console.error("Storage upload failed:", error); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data?.publicUrl ?? null;
}

async function listAnalyses(supabase: ReturnType<typeof createClient>, propertyId: string) {
  try {
    const { data } = await supabase.storage.from(BUCKET).list(propertyId, {
      sortBy: { column: "created_at", order: "desc" },
      limit: 50,
    });
    return (data ?? []).map(f => ({
      name:      f.name,
      createdAt: f.created_at,
      url:       supabase.storage.from(BUCKET).getPublicUrl(`${propertyId}/${f.name}`).data.publicUrl,
    }));
  } catch { return []; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const { propertyId } = await req.json();
    if (!propertyId) return new Response(JSON.stringify({ error: "propertyId obrigatório" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Busca nome da propriedade
    const { data: prop } = await supabase.from("properties").select("name").eq("id", propertyId).single();
    const propertyName   = prop?.name ?? propertyId;

    // Busca TODOS os eventos (sem limite)
    const events  = await fetchAllEvents(supabase, propertyId);
    const utms    = extractUtms(events);
    const traffic = aggregateTraffic(events);
    const evStats = aggregateEvents(events);

    // IA
    const ai = await callOpenAI(utms, traffic, evStats);

    // Salva .md
    const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const mdContent   = buildMarkdown(propertyId, propertyName, utms, traffic, evStats, ai, generatedAt);
    const fileUrl     = await saveMarkdown(supabase, propertyId, mdContent, events.length);

    // Lista histórico
    const history = await listAnalyses(supabase, propertyId);

    return new Response(
      JSON.stringify({
        utms:    { ...utms,    ai: ai?.utms    ?? null },
        traffic: { ...traffic, ai: ai?.traffic ?? null },
        events:  { ...evStats, ai: ai?.events  ?? null },
        generatedAt,
        eventCount: events.length,
        fileUrl,
        history,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS } }
    );

  } catch (err) {
    console.error("analyze-events error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
  }
});
