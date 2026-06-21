import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, LabelList, Label, Customized,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRegion } from "@/pages/Index";

// ── State abbr map ────────────────────────────────────────────────────────────
const STATE_ABBR: Record<string, string> = {
  "acre": "AC", "amazonas": "AM", "amapá": "AP", "amapa": "AP",
  "pará": "PA", "para": "PA", "rondônia": "RO", "rondonia": "RO",
  "roraima": "RR", "tocantins": "TO",
  "alagoas": "AL", "bahia": "BA", "ceará": "CE", "ceara": "CE",
  "maranhão": "MA", "maranhao": "MA", "paraíba": "PB", "paraiba": "PB",
  "pernambuco": "PE", "piauí": "PI", "piaui": "PI",
  "rio grande do norte": "RN", "sergipe": "SE",
  "distrito federal": "DF", "federal district": "DF",
  "goiás": "GO", "goias": "GO",
  "mato grosso do sul": "MS", "mato grosso": "MT",
  "espírito santo": "ES", "espirito santo": "ES",
  "minas gerais": "MG", "rio de janeiro": "RJ",
  "são paulo": "SP", "sao paulo": "SP",
  "paraná": "PR", "parana": "PR",
  "rio grande do sul": "RS", "santa catarina": "SC",
  "state of são paulo": "SP", "state of sao paulo": "SP",
  "state of rio de janeiro": "RJ", "state of minas gerais": "MG",
  "state of bahia": "BA", "state of paraná": "PR", "state of parana": "PR",
  "state of rio grande do sul": "RS", "state of santa catarina": "SC",
  "state of pernambuco": "PE", "state of ceará": "CE", "state of ceara": "CE",
  "state of goiás": "GO", "state of goias": "GO",
  "state of espírito santo": "ES", "state of espirito santo": "ES",
  "state of maranhão": "MA", "state of maranhao": "MA",
  "state of pará": "PA", "state of para": "PA",
  "state of amazonas": "AM", "state of mato grosso": "MT",
  "state of mato grosso do sul": "MS", "state of tocantins": "TO",
  "state of rondônia": "RO", "state of rondonia": "RO",
  "state of roraima": "RR", "state of amapá": "AP", "state of amapa": "AP",
  "state of acre": "AC", "state of alagoas": "AL",
  "state of paraíba": "PB", "state of paraiba": "PB",
  "state of piauí": "PI", "state of piaui": "PI",
  "state of rio grande do norte": "RN", "state of sergipe": "SE",
  "state of distrito federal": "DF",
};
function abbr(state: string | null): string {
  if (!state) return "";
  const k = state.toLowerCase().trim();
  if (/^[a-z]{2}$/.test(k)) return k.toUpperCase();
  return STATE_ABBR[k] || state;
}

// ── Region palette ────────────────────────────────────────────────────────────
const REGION_COLOR: Record<string, string> = {
  "Sudeste":       "#22c55e",
  "Sul":           "#4ade80",
  "Nordeste":      "#16a34a",
  "Centro-Oeste":  "#86efac",
  "Norte":         "#15803d",
  "Internacional": "#6ee7b7",
  "Outros (BR)":   "#bbf7d0",
};
const REGION_ORDER = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte", "Internacional", "Outros (BR)"];

const PIE_COLORS = [
  "#f59e0b", // âmbar
  "#ef4444", // vermelho
  "#a855f7", // roxo
  "#f97316", // laranja
  "#ec4899", // rosa
  "#e11d48", // crimson
  "#d946ef", // fúcsia
  "#fb923c", // laranja claro
  "#c084fc", // lilás
  "#fbbf24", // amarelo
];

const QUALITY_FIELDS = [
  { key: "fbp",         label: "FBP (cookie)"        },
  { key: "fbc",         label: "FBC (clique de ad)"  },
  { key: "external_id", label: "External ID"          },
  { key: "city",        label: "Geolocalização"       },
  { key: "processed",   label: "Enviado ao Facebook"  },
  { key: "ip",          label: "IP capturado"         },
];

type Evt = Record<string, any>;
interface ReportsProps { events: Evt[] }

function pct(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0;
}

const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name ?? "eventos"}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

const PieTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-foreground">{d.name}</p>
      <p style={{ color: d.payload.fill }}>{d.value} eventos ({d.payload.pct}%)</p>
    </div>
  );
};

const PageThumb = ({ thumbUrl, domain, faviconUrl }: { thumbUrl: string; domain: string; faviconUrl: string }) => {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="w-full h-full min-h-[100px] flex flex-col items-center justify-center gap-2 bg-muted/60">
      <img src={faviconUrl} alt={domain} className="h-8 w-8 rounded-md opacity-60" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      <span className="text-[9px] text-muted-foreground font-mono text-center px-1 truncate w-full text-center">{domain}</span>
    </div>
  ) : (
    <img
      src={thumbUrl}
      alt={domain}
      className="w-full h-full object-cover object-top min-h-[100px]"
      onError={() => setFailed(true)}
    />
  );
};

export const Reports = ({ events }: ReportsProps) => {
  const total = events.length;

  const regionData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      const r = getRegion(e.state, e.country);
      map[r] = (map[r] || 0) + 1;
    }
    return REGION_ORDER
      .filter((r) => map[r])
      .map((r) => ({ name: r, eventos: map[r], fill: REGION_COLOR[r] ?? "#22c55e" }))
      .sort((a, b) => b.eventos - a.eventos);
  }, [events]);

  const eventTypeData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      const n = e.event_name || "PageView";
      map[n] = (map[n] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value], i) => ({ name, value, pct: pct(value, total), fill: PIE_COLORS[i % PIE_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [events, total]);

  const cityData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      if (!e.city) continue;
      const uf = abbr(e.state);
      const label = uf || e.city;
      map[label] = (map[label] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [events]);

  const timelineData = useMemo(() => {
    const map: Record<string, number> = {};
    const now = Date.now();
    for (let i = 13; i >= 0; i--) {
      const key = new Date(now - i * 86400000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      map[key] = 0;
    }
    for (const e of events) {
      const ts = e.event_time ? e.event_time * 1000 : e.created_at ? new Date(e.created_at).getTime() : null;
      if (!ts) continue;
      const key = new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (key in map) map[key]++;
    }
    return Object.entries(map).map(([name, eventos]) => ({ name, eventos }));
  }, [events]);

  const qualityData = useMemo(() => {
    return QUALITY_FIELDS.map(({ key, label }) => {
      const count = events.filter((e) => key === "processed" ? e.processed === true : !!e[key]).length;
      return { label, count, pct: pct(count, total) };
    });
  }, [events, total]);

  const pageData = useMemo(() => {
    const STRIP = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","utm_id","fbclid","gclid","gclsrc","dclid","msclkid","ref","source"];
    const map: Record<string, { url: string; domain: string; path: string; visits: number; totalEvents: number; events: Record<string, number> }> = {};
    for (const e of events) {
      if (!e.page_url) continue;
      try {
        const u = new URL(e.page_url);
        STRIP.forEach((p) => u.searchParams.delete(p));
        const key = u.hostname + u.pathname;
        if (!map[key]) map[key] = { url: u.toString(), domain: u.hostname, path: u.pathname || "/", visits: 0, totalEvents: 0, events: {} };
        map[key].totalEvents++;
        const evtName = e.event_name || "PageView";
        map[key].events[evtName] = (map[key].events[evtName] || 0) + 1;
        if (evtName === "PageView") map[key].visits++;
      } catch {}
    }
    return Object.entries(map)
      .map(([, d]) => d)
      .sort((a, b) => b.totalEvents - a.totalEvents)
      .slice(0, 15);
  }, [events]);

  const hourData = useMemo(() => {
    const map: Record<number, number> = {};
    for (let h = 0; h < 24; h++) map[h] = 0;
    for (const e of events) {
      const ts = e.event_time ? e.event_time * 1000 : e.created_at ? new Date(e.created_at).getTime() : null;
      if (!ts) continue;
      map[new Date(ts).getHours()]++;
    }
    return Object.entries(map).map(([h, eventos]) => ({
      name: `${String(h).padStart(2, "0")}h`, eventos,
    }));
  }, [events]);

  if (!total) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Nenhum evento para exibir no relatório.
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full p-4 space-y-4">

      {/* Qualidade — barras grossas */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-bold">Qualidade dos Eventos</CardTitle>
          <p className="text-xs text-muted-foreground">Cobertura de dados em {total} eventos</p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {qualityData.map((q) => {
              const color = q.pct >= 80 ? "hsl(var(--success))" : q.pct >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
              return (
                <div key={q.label} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-muted-foreground">{q.label}</span>
                    <span className="text-sm font-bold" style={{ color }}>{q.pct}%</span>
                  </div>
                  <div className="h-7 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${q.pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{q.count} de {total}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Regiões + Tipos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Regiões — barras custom */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-bold">Regiões mais visitadas</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-3">
              {regionData.map((r) => {
                const p = pct(r.eventos, total);
                return (
                  <div key={r.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">{r.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{r.eventos}</span>
                        <span className="font-bold w-9 text-right" style={{ color: r.fill }}>{p}%</span>
                      </div>
                    </div>
                    <div className="h-8 w-full rounded-xl bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-xl transition-all duration-500 flex items-center px-3"
                        style={{ width: `${Math.max(p, 3)}%`, backgroundColor: r.fill }}
                      >
                        {p >= 18 && (
                          <span className="text-[11px] font-bold text-black/60 truncate">{r.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tipos de Evento — donut maior e moderno */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-bold">Tipos de Evento</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={480}>
              <PieChart margin={{ top: 50, right: 80, bottom: 50, left: 80 }} style={{ outline: "none" }}>
                <Customized component={() => (
                  <defs>
                    {eventTypeData.map((_, i) => {
                      const steps = [
                        { from: 1.0,  to: 0.55 },
                        { from: 0.45, to: 0.12 },
                        { from: 0.30, to: 0.08 },
                        { from: 0.20, to: 0.05 },
                        { from: 0.15, to: 0.03 },
                      ];
                      const total = eventTypeData.length || 1;
                      const { from, to } = steps[i] ?? { from: Math.max(0.1 - i * 0.01, 0.03), to: 0.02 };
                      return (
                        <linearGradient key={i} id={`slice-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={from} />
                          <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={to} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                ) as any} />
                <Pie
                  data={eventTypeData}
                  cx="50%" cy="50%"
                  innerRadius={105}
                  outerRadius={155}
                  dataKey="value"
                  paddingAngle={4}
                  cornerRadius={8}
                  stroke="transparent"
                  strokeWidth={0}
                  labelLine={false}
                  label={({ cx, cy, midAngle, outerRadius, fill, name, value, pct, index }) => {
                    const RADIAN = Math.PI / 180;
                    const sin = Math.sin(-midAngle * RADIAN);
                    const cos = Math.cos(-midAngle * RADIAN);
                    const startX = cx + outerRadius * cos;
                    const startY = cy + outerRadius * sin;
                    const midX   = cx + (outerRadius + 20) * cos;
                    const midY   = cy + (outerRadius + 20) * sin;
                    const endX   = midX + (cos >= 0 ? 32 : -32);
                    const endY   = midY;
                    const anchor = cos >= 0 ? "start" : "end";
                    const dotGradId = `grad-dot-${index}`;
                    return (
                      <g>
                        <defs>
                          <radialGradient id={dotGradId} cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="1" />
                            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
                          </radialGradient>
                        </defs>
                        {/* dot foreground→transparente na borda da fatia */}
                        <circle cx={startX} cy={startY} r={5} fill={`url(#${dotGradId})`} />
                        <path d={`M${startX},${startY} L${midX},${midY} L${endX},${endY}`}
                          stroke="hsl(var(--foreground))" strokeOpacity={0.4} strokeWidth={1.5} fill="none" />
                        {/* dot sólido no fim da linha */}
                        <circle cx={endX} cy={endY} r={4} fill="hsl(var(--foreground))" />
                        <text x={endX + (cos >= 0 ? 9 : -9)} y={endY - 8}
                          textAnchor={anchor} fill="hsl(var(--foreground))" fontSize={12} fontWeight={700}>
                          {name}
                        </text>
                        <text x={endX + (cos >= 0 ? 9 : -9)} y={endY + 8}
                          textAnchor={anchor} fill="hsl(var(--muted-foreground))" fontSize={12} fontWeight={600}>
                          {value} · {pct}%
                        </text>
                      </g>
                    );
                  }}
                >
                  {eventTypeData.map((_, i) => (
                    <Cell key={i} fill={`url(#slice-grad-${i})`} />
                  ))}
                  <Label
                    content={({ viewBox }: any) => {
                      const { cx, cy } = viewBox;
                      const avg = eventTypeData.length
                        ? Math.round(eventTypeData.slice(0, 2).reduce((s, d) => s + d.pct, 0) / Math.min(eventTypeData.length, 2))
                        : 0;
                      return (
                        <g>
                          <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="middle"
                            fill="hsl(var(--foreground))" fontSize={32} fontWeight={800}>
                            {avg}%
                          </text>
                          <text x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="middle"
                            fill="hsl(var(--muted-foreground))" fontSize={11}>
                            média top 2
                          </text>
                        </g>
                      );
                    }}
                  />
                </Pie>
                <Tooltip content={<PieTip />} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Timeline — mais alto */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-bold">Eventos — últimos 14 dias</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={timelineData} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip content={<Tip />} />
              <Line type="monotone" dataKey="eventos" stroke="#22c55e" strokeWidth={2.5}
                dot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top cidades + Hora */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-bold">Top 10 Estados</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5">
            <div className="space-y-2">
              {cityData.map((d, i) => {
                const maxVal = cityData[0]?.value || 1;
                const widthPct = Math.max((d.value / maxVal) * 100, 4);
                const isTop = i === 0;
                const colors = ["#22c55e","#3b82f6","#f59e0b","#ef4444","#a855f7","#06b6d4","#f97316","#ec4899","#84cc16","#14b8a6"];
                const color = colors[i % colors.length];
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                    <span className={`text-xs font-bold w-8 shrink-0 ${isTop ? "text-foreground" : "text-muted-foreground"}`}>{d.name}</span>
                    <div className="flex-1 h-7 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center px-3 transition-all duration-500"
                        style={{ width: `${widthPct}%`, backgroundColor: color }}
                      >
                        {widthPct > 20 && (
                          <span className="text-[10px] font-bold text-white/80 truncate">{d.value}</span>
                        )}
                      </div>
                    </div>
                    {widthPct <= 20 && (
                      <span className="text-[10px] font-bold text-muted-foreground w-6 shrink-0">{d.value}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-bold">Eventos por Hora do Dia</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={hourData} margin={{ left: 0, right: 8, top: 16, bottom: 4 }} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  stroke="hsl(var(--muted-foreground))"
                  allowDecimals={false}
                />
                <Tooltip content={<Tip />} cursor={{ fill: "hsl(var(--muted))", radius: 6 }} />
                <Bar dataKey="eventos" radius={[8, 8, 0, 0]} barSize={26}>
                  {hourData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.eventos === Math.max(...hourData.map(h => h.eventos)) ? "#22c55e" : "#4ade8066"}
                    />
                  ))}
                  <LabelList dataKey="eventos" position="top" style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }} formatter={(v: number) => v > 0 ? v : ""} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Eventos por Página — full width */}
      {pageData.length > 0 && (
        <Card className="border-border shadow-sm w-full">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-bold">Eventos por Página</CardTitle>
            <p className="text-xs text-muted-foreground">{pageData.length} páginas únicas</p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="space-y-3">
              {pageData.map((d, i) => {
                const maxEvents = pageData[0]?.totalEvents || 1;
                const barPct = Math.max((d.totalEvents / maxEvents) * 100, 2);
                const topEvents = Object.entries(d.events).sort((a, b) => b[1] - a[1]);
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${d.domain}&sz=32`;
                const thumbUrl = `https://image.thum.io/get/width/600/crop/340/noanimate/${encodeURIComponent(d.url)}`;
                const rankColors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"];
                const rankColor = rankColors[i] ?? "#6b7280";
                const eventPct = pct(d.totalEvents, pageData.reduce((s, p) => s + p.totalEvents, 0));
                return (
                  <div
                    key={d.domain + d.path}
                    className="w-full flex gap-4 rounded-2xl border border-border bg-muted/10 overflow-hidden hover:bg-muted/20 hover:shadow-md transition-all duration-200"
                  >
                    {/* rank + thumbnail */}
                    <div className="relative shrink-0 w-[140px] sm:w-[180px] bg-muted overflow-hidden">
                      <PageThumb thumbUrl={thumbUrl} domain={d.domain} faviconUrl={faviconUrl} />
                      <div
                        className="absolute top-2 left-2 h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-lg"
                        style={{ backgroundColor: rankColor }}
                      >
                        {i + 1}
                      </div>
                    </div>

                    {/* info */}
                    <div className="flex flex-col justify-center gap-2 py-4 pr-5 flex-1 min-w-0">
                      {/* domain + path */}
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={faviconUrl}
                          alt=""
                          className="h-4 w-4 shrink-0 rounded-sm"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{d.domain}</p>
                          {d.path !== "/" && (
                            <p className="text-[10px] text-muted-foreground font-mono truncate">{d.path}</p>
                          )}
                        </div>
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 ml-1 text-[10px] text-primary hover:underline opacity-60 hover:opacity-100"
                        >
                          ↗
                        </a>
                      </div>

                      {/* eventos + barra */}
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col leading-none">
                          <span className="text-3xl font-black tabular-nums" style={{ color: rankColor }}>
                            {d.totalEvents}
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            eventos · {d.visits} visitas
                          </span>
                        </div>
                        <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${barPct}%`, backgroundColor: rankColor }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {eventPct}%
                        </span>
                      </div>

                      {/* event badges */}
                      <div className="flex flex-wrap gap-1.5">
                        {topEvents.map(([name, cnt]) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold"
                          >
                            {name}
                            <span className="bg-primary/20 text-primary rounded-full px-1">{cnt}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
};
