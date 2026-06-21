import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cleanState } from "@/lib/geo";

// ── Types ──────────────────────────────────────────────────────────────────────
interface LiveEvent {
  id: string;
  event_name: string;
  page_url: string | null;
  page_title: string | null;
  created_at: string;
  ip: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  external_id: string | null;
  processed: boolean | null;
  fbp: string | null;
  fbc: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const COUNTRY: Record<string, string> = {
  br: "Brasil", us: "EUA", pt: "Portugal", ar: "Argentina",
  mx: "México", co: "Colômbia", cl: "Chile", pe: "Peru",
  es: "Espanha", gb: "Reino Unido", de: "Alemanha", fr: "França",
  it: "Itália", ca: "Canadá", au: "Austrália",
};

const BR_STATE: Record<string, string> = {
  ac:"Acre", al:"Alagoas", ap:"Amapá", am:"Amazonas", ba:"Bahia",
  ce:"Ceará", df:"DF", es:"Espírito Santo", go:"Goiás", ma:"Maranhão",
  mt:"Mato Grosso", ms:"Mato Grosso do Sul", mg:"Minas Gerais", pa:"Pará",
  pb:"Paraíba", pr:"Paraná", pe:"Pernambuco", pi:"Piauí",
  rj:"Rio de Janeiro", rn:"Rio Grande do Norte", rs:"Rio Grande do Sul",
  ro:"Rondônia", rr:"Roraima", sc:"Santa Catarina", sp:"São Paulo",
  se:"Sergipe", to:"Tocantins",
};

function resolveName(raw: string | null, type: "country" | "state" | "city"): string {
  if (!raw) return "—";
  const key = raw.toLowerCase().trim();
  if (type === "country") return COUNTRY[key] ?? raw.toUpperCase();
  if (type === "state")   return BR_STATE[key] ?? raw.toUpperCase();
  return raw.replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  return `${Math.floor(s / 3600)}h`;
}

// ── Event Card ─────────────────────────────────────────────────────────────────
function EventCard({ ev }: { ev: LiveEvent }) {
  const isPageView = ev.event_name === "PageView";
  const pageLabel = (ev.page_title || ev.page_url || "")
    .replace(/^https?:\/\//, "")
    .split("?")[0]
    .slice(0, 60);

  const geoLine = [
    resolveName(ev.country, "country"),
    cleanState(ev.state),
    resolveName(ev.city, "city"),
    ev.zip || null,
  ].filter((v) => v && v !== "—").join(" · ");

  return (
    <div className="border-b border-border/30 px-4 py-3 flex flex-col gap-1.5 hover:bg-muted/20 transition-colors">
      {/* Linha 1 — evento + status + horário */}
      <div className="flex items-center gap-2">
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isPageView
            ? "bg-blue-500/15 text-blue-400"
            : "bg-green-500/15 text-green-400"
        }`}>
          {ev.event_name}
        </span>
        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
          ev.processed
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-yellow-500/10 text-yellow-400"
        }`}>
          {ev.processed ? "Enviado" : "Pendente"}
        </span>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
          {fmtDate(ev.created_at)}
        </span>
        <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">
          ({timeAgo(ev.created_at)} atrás)
        </span>
      </div>

      {/* Linha 2 — página */}
      {pageLabel && (
        <p className="text-[11px] text-foreground/70 truncate leading-snug">
          {pageLabel}
        </p>
      )}

      {/* Linha 3 — geo + IP */}
      <div className="flex items-center gap-3 flex-wrap">
        {ev.ip && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {ev.ip}
          </span>
        )}
        {geoLine !== "—" && (
          <span className="text-[10px] text-muted-foreground/70">
            {geoLine}
          </span>
        )}
      </div>

      {/* Linha 4 — IDs */}
      <div className="flex items-center gap-3 flex-wrap">
        {ev.external_id && (
          <span className="text-[10px] text-muted-foreground/40 font-mono truncate max-w-[160px]">
            ext: {ev.external_id}
          </span>
        )}
        {ev.fbp && (
          <span className="text-[10px] text-muted-foreground/30 font-mono">
            fbp
          </span>
        )}
        {ev.fbc && (
          <span className="text-[10px] text-muted-foreground/30 font-mono">
            fbc
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
const Codmov = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: properties } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id,name")
        .order("created_at", { ascending: true });
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60000,
  });

  const activePropertyId =
    localStorage.getItem("active-property-id") ||
    properties?.[0]?.id ||
    "";

  const load = async (pid: string) => {
    if (!pid) return;
    const { data } = await supabase
      .from("fb_events_raw")
      .select("id,event_name,page_url,page_title,created_at,ip,country,state,city,zip,external_id,processed,fbp,fbc")
      .eq("property_id", pid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setEvents(data as LiveEvent[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!activePropertyId) return;
    setLoading(true);
    load(activePropertyId);
    const interval = setInterval(() => load(activePropertyId), 10000);
    return () => clearInterval(interval);
  }, [activePropertyId]);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Navbar */}
      <header className="border-b border-border bg-background shrink-0">
        <div className="flex items-center justify-between px-6 h-[60px] gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">Codmov</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost" size="icon"
              onClick={() => navigate("/settings")}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Bloco principal */}
      <div className="flex-1 min-h-0 flex flex-col mt-4 rounded-xl border border-border/40 bg-card overflow-hidden">
        {/* Header do bloco */}
        <div className="shrink-0 px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
            Atividade em tempo real
          </p>
          <span className="text-[10px] text-muted-foreground/40 tabular-nums">
            {events.length} eventos
          </span>
        </div>

        {/* Lista com scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && events.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="h-6 w-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-xs text-muted-foreground">Aguardando eventos…</p>
            </div>
          ) : (
            events.map(ev => <EventCard key={ev.id} ev={ev} />)
          )}
        </div>
      </div>
    </div>
  );
};

export default Codmov;
