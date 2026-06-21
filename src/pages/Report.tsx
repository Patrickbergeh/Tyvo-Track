import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DateRangeFilter, getPresetRange, type DatePreset, type DateRange } from "@/components/DateRangeFilter";
import { prettySource, mediumKind, type MediumKind } from "@/lib/utm";
import { BarChart3, DollarSign, Sprout, Users } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

type Row = { src: string | null; med: string | null; total: number };

const KIND_COLOR: Record<MediumKind, string> = {
  "Pago":     "hsl(var(--primary))",
  "Orgânico": "hsl(var(--success))",
  "Outros":   "hsl(var(--muted-foreground))",
};
const SOURCE_COLORS = [
  "hsl(var(--primary))", "hsl(var(--success))", "#6366f1", "#ec4899", "#f59e0b", "#14b8a6", "#94a3b8",
];

const nf = (n: number) => n.toLocaleString("pt-BR");

const Report = () => {
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);

  const activeDateRange: DateRange | null =
    datePreset === "all" ? null
    : datePreset === "custom" && customRange ? customRange
    : getPresetRange(datePreset as Exclude<DatePreset, "all" | "custom">);

  const { data: properties } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id,name").order("created_at", { ascending: true });
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60000,
  });
  const activePropertyId = localStorage.getItem("active-property-id") || properties?.[0]?.id || "";

  const { data: rows, isLoading } = useQuery<Row[]>({
    queryKey: ["utm-report", activePropertyId, activeDateRange?.from?.toISOString(), activeDateRange?.to?.toISOString()],
    queryFn: async () => {
      if (!activePropertyId) return [];
      const { data, error } = await supabase.rpc("utm_report", {
        p_property: activePropertyId,
        p_from: activeDateRange ? activeDateRange.from.toISOString() : null,
        p_to:   activeDateRange ? activeDateRange.to.toISOString()   : null,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!activePropertyId,
    refetchInterval: 60000,
    staleTime: 30000,
    placeholderData: (prev) => prev, // mantém os dados na tela ao trocar o filtro (nada some)
  });

  // ── Agregações (valor real, vindo do servidor) ──
  const all = rows ?? [];
  const total = all.reduce((s, r) => s + Number(r.total), 0);

  const kindAgg: Record<MediumKind, number> = { "Pago": 0, "Orgânico": 0, "Outros": 0 };
  for (const r of all) kindAgg[mediumKind(r.med)] += Number(r.total);

  const srcMap = new Map<string, number>();
  for (const r of all) {
    const label = prettySource(r.src) ?? "Direto / sem origem";
    srcMap.set(label, (srcMap.get(label) ?? 0) + Number(r.total));
  }
  const bySource = [...srcMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const kindData = ([
    { name: "Pago", value: kindAgg["Pago"] },
    { name: "Orgânico", value: kindAgg["Orgânico"] },
    { name: "Outros", value: kindAgg["Outros"] },
  ] as { name: MediumKind; value: number }[]).filter(d => d.value > 0);

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <header className="border-b border-border bg-background shrink-0">
        <div className="flex items-center justify-between px-6 h-[60px] gap-4">
          <h1 className="text-sm font-semibold leading-none">Relatório</h1>
          <div className="flex items-center gap-3">
            <DateRangeFilter
              value={datePreset}
              customRange={customRange}
              onChange={(p, r) => { setDatePreset(p); setCustomRange(p === "custom" ? r : null); }}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Carregando relatório…</div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Nenhum acesso no período</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ajuste o filtro de datas para ver os dados.</p>
          </div>
        ) : (
          <div className="w-full space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={Users}      label="Total de acessos" value={total}            accent="text-foreground"             sub="no período" />
              <StatCard icon={DollarSign} label="Pago"             value={kindAgg["Pago"]}     accent="text-primary"                sub={`${pct(kindAgg["Pago"])}% do total`} />
              <StatCard icon={Sprout}     label="Orgânico"         value={kindAgg["Orgânico"]} accent="text-[hsl(var(--success))]"  sub={`${pct(kindAgg["Orgânico"])}% do total`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Donut Pago vs Orgânico */}
              <Card className="shadow-none lg:col-span-2">
                <CardContent className="p-5">
                  <SectionTitle>Pago vs Orgânico</SectionTitle>
                  <div className="relative h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={kindData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                          innerRadius={92} outerRadius={130} paddingAngle={3} cornerRadius={5} stroke="none">
                          {kindData.map((d) => <Cell key={d.name} fill={KIND_COLOR[d.name]} />)}
                        </Pie>
                        <Tooltip
                          formatter={(v: number, n) => [`${nf(v)} (${pct(v)}%)`, n as string]}
                          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--popover-foreground))", boxShadow: "0 4px 16px hsl(var(--background)/0.4)" }}
                          itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                          labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                          wrapperStyle={{ zIndex: 50, outline: "none" }}
                          allowEscapeViewBox={{ x: true, y: true }}
                          isAnimationActive={false}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* total no centro do anel */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-bold tabular-nums leading-none">{nf(total)}</span>
                      <span className="text-xs text-muted-foreground mt-1.5">acessos</span>
                    </div>
                  </div>
                  {/* legenda */}
                  <div className="mt-4 space-y-2">
                    {kindData.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[d.name] }} />
                          <span className="font-medium">{d.name}</span>
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {nf(d.value)} <span className="text-muted-foreground/60">· {pct(d.value)}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Ranking por origem — lista com barras inline */}
              <Card className="shadow-none lg:col-span-3 self-start">
                <CardContent className="p-5">
                  <SectionTitle>Acessos por origem</SectionTitle>
                  <div className="space-y-3.5">
                    {bySource.map(({ name, value }, i) => (
                      <div key={name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                            <span className="truncate font-medium">{name}</span>
                          </span>
                          <span className="text-muted-foreground tabular-nums shrink-0 ml-3">
                            {nf(value)} <span className="text-muted-foreground/60">· {pct(value)}%</span>
                          </span>
                        </div>
                        <OriginBar percent={total > 0 ? (value / total) * 100 : 0} color={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// Barra de origem: preenche de 0 → valor (e re-anima ao trocar filtro), com brilho moderno.
function OriginBar({ percent, color }: { percent: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    setW(0); // reseta p/ animar o preenchimento a cada mudança de dado/filtro
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(percent)));
    return () => cancelAnimationFrame(id);
  }, [percent]);
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
      <div className="relative h-full overflow-hidden rounded-full transition-[width] duration-1000 ease-out"
        style={{ width: `${w}%`, background: color }}>
        <span className="origin-shimmer" />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">{children}</p>;
}

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: number; sub: string; accent: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <Icon className={`h-4 w-4 ${accent}`} />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <AnimatedNumber value={value} className={`text-3xl font-bold tabular-nums ${accent}`} />
        <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default Report;
