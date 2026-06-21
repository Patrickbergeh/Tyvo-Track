import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Property } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Clock, Globe, CheckCircle2, Eye, Zap, CircleDot, Settings,
  Server, Monitor, RefreshCw, ChevronDown, Building2, Plus,
  ChevronLeft, ChevronRight, Table2, MapPin, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HealthBanner } from "@/components/HealthBanner";
import { PayloadDialog } from "@/components/PayloadDialog";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { NewWorkspaceDialog } from "@/components/NewWorkspaceDialog";
import { VisitorMap } from "@/components/VisitorMap";
import { DateRangeFilter, getPresetRange, type DatePreset, type DateRange } from "@/components/DateRangeFilter";
import { prettySource, prettyMedium } from "@/lib/utm";
import { cleanState } from "@/lib/geo";

const PAGE_SIZE = 50;

const STATE_TO_REGION: Record<string, string> = {
  "acre":"Norte","amazonas":"Norte","amapá":"Norte","amapa":"Norte","pará":"Norte","para":"Norte",
  "rondônia":"Norte","rondonia":"Norte","roraima":"Norte","tocantins":"Norte",
  "alagoas":"Nordeste","bahia":"Nordeste","ceará":"Nordeste","ceara":"Nordeste",
  "maranhão":"Nordeste","maranhao":"Nordeste","paraíba":"Nordeste","paraiba":"Nordeste",
  "pernambuco":"Nordeste","piauí":"Nordeste","piaui":"Nordeste",
  "rio grande do norte":"Nordeste","sergipe":"Nordeste",
  "distrito federal":"Centro-Oeste","federal district":"Centro-Oeste",
  "goiás":"Centro-Oeste","goias":"Centro-Oeste",
  "mato grosso do sul":"Centro-Oeste","mato grosso":"Centro-Oeste",
  "espírito santo":"Sudeste","espirito santo":"Sudeste","minas gerais":"Sudeste",
  "rio de janeiro":"Sudeste","são paulo":"Sudeste","sao paulo":"Sudeste",
  "paraná":"Sul","parana":"Sul","rio grande do sul":"Sul","santa catarina":"Sul",
  "ac":"Norte","am":"Norte","ap":"Norte","pa":"Norte","ro":"Norte","rr":"Norte","to":"Norte",
  "al":"Nordeste","ba":"Nordeste","ce":"Nordeste","ma":"Nordeste","pb":"Nordeste",
  "pe":"Nordeste","pi":"Nordeste","rn":"Nordeste","se":"Nordeste",
  "df":"Centro-Oeste","go":"Centro-Oeste","mt":"Centro-Oeste","ms":"Centro-Oeste",
  "es":"Sudeste","mg":"Sudeste","rj":"Sudeste","sp":"Sudeste",
  "pr":"Sul","rs":"Sul","sc":"Sul",
};
const BRAZIL_NAMES = ["brazil","brasil","br","bra"];

export function getRegion(state: string | null, country: string | null): string {
  const isBrazil = country ? BRAZIL_NAMES.includes(country.toLowerCase().trim()) : false;
  if (!isBrazil) return "Internacional";
  if (!state) return "Outros (BR)";
  return STATE_TO_REGION[state.toLowerCase().trim()] ?? "Outros (BR)";
}

function stripUtm(raw: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","utm_id",
     "fbclid","gclid","gclsrc","dclid","msclkid","mc_eid","_ga","ref","source"]
      .forEach((p) => u.searchParams.delete(p));
    return u.toString();
  } catch { return raw; }
}

// Lê uma UTM da URL (fallback p/ eventos antigos sem colunas dedicadas)
function utmFromUrl(raw: string | null, key: string): string | null {
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).searchParams.get(key);
  } catch { return null; }
}

// Célula de UTM: valor em "pill". Com `full`, mostra o valor inteiro sem cortar;
// senão trunca na largura `w` e revela o resto no tooltip.
const UtmCell = ({ value, w = 130, full = false }: { value: string | null; w?: number; full?: boolean }) =>
  value
    ? <span title={value}
        style={full ? undefined : { maxWidth: w }}
        className={`inline-block rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80 align-middle ${full ? "whitespace-nowrap" : "max-w-full truncate"}`}>
        {value}
      </span>
    : <span className="text-[11px] text-muted-foreground/40">—</span>;

// Bandeira do país em SVG (flagcdn) + código. Cai para só o código se não houver bandeira.
const Flag = ({ code }: { code: string | null }) => {
  if (!code) return <span className="text-[11px] text-muted-foreground">—</span>;
  const c = code.toLowerCase().trim();
  return (
    <img
      src={`https://flagcdn.com/${c}.svg`}
      alt={c.toUpperCase()}
      title={c.toUpperCase()}
      loading="lazy"
      className="h-3.5 w-auto rounded-[2px] ring-1 ring-border/40"
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
};

const PageCell = ({ title, url }: { title: string; url: string }) => {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const hide = () => { timer.current = setTimeout(() => setOpen(false), 150); };
  const clean = url ? stripUtm(url) : "";
  // src do preview leva um sinalizador para o tracker NÃO disparar pixel/evento
  const previewSrc = clean ? clean + (clean.includes("?") ? "&" : "?") + "_tk_preview=1" : "";
  if (!url) return <span className="text-xs text-muted-foreground">{title}</span>;
  return (
    <div className="relative inline-block max-w-[200px]" onMouseEnter={show} onMouseLeave={hide} onTouchStart={() => setOpen(v => !v)}>
      <span className="text-primary flex items-center gap-1 cursor-pointer truncate text-xs">
        <Globe className="h-3 w-3 shrink-0" />
        <span className="truncate">{title}</span>
      </span>
      {open && (
        <div className="fixed z-[9999] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden flex flex-col"
          style={{ width: 420, height: 580, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
          onMouseEnter={show} onMouseLeave={hide}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50 shrink-0">
            <p className="text-xs font-semibold truncate flex-1 mr-2">{title}</p>
            <a href={clean} target="_blank" rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium">
              <Globe className="h-3 w-3" /> Abrir
            </a>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe key={previewSrc} src={previewSrc} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer"
              scrolling="yes" className="border-0 block" style={{ width: 420, height: "100%", minHeight: 500 }} />
          </div>
          <div className="px-3 py-1.5 border-t border-border bg-muted/30 shrink-0">
            <p className="text-[10px] font-mono text-muted-foreground truncate">{clean}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const Index = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [payloadEvt, setPayloadEvt] = useState<any>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [newWsOpen, setNewWsOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [activePropertyId, setActivePropertyId] = useState<string>(
    () => localStorage.getItem("active-property-id") ?? ""
  );
  const [view, setView] = useState<"table" | "map">(
    () => (localStorage.getItem("dashboard-view") as "table" | "map") ?? "table"
  );
const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);

  const activeDateRange: DateRange | null =
    datePreset === "all" ? null
    : datePreset === "custom" && customRange ? customRange
    : getPresetRange(datePreset as Exclude<DatePreset, "all" | "custom">);

  const { data: properties } = useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,name,pixel_id,access_token,browser_pixel,capi_enabled,event_add_to_cart,event_add_to_wishlist,event_lead,tracking_enabled,fire_once,test_event_code,test_event_active,created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60000,
  });

  const activeProperty = properties?.find(p => p.id === activePropertyId) ?? properties?.[0] ?? null;

  const handleSelectProperty = (id: string) => {
    localStorage.setItem("active-property-id", id);
    setActivePropertyId(id);
    setPage(1);
  };

  const createProperty = useMutation({
    mutationFn: async ({ name, pixelId, accessToken }: { name: string; pixelId: string; accessToken: string }) => {
      const { data, error } = await supabase
        .from("properties")
        .insert({ name, pixel_id: pixelId, access_token: accessToken })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      handleSelectProperty(data.id);
      setNewWsOpen(false);
      setWorkspaceOpen(false);
      navigate("/settings");
    },
  });

  const toggleTracking = useMutation({
    mutationFn: async (p: Property) => {
      const { error } = await supabase
        .from("properties")
        .update({ tracking_enabled: !p.tracking_enabled })
        .eq("id", p.id);
      if (error) throw error;
    },
    // Atualização otimista para o switch responder na hora
    onMutate: async (p: Property) => {
      await qc.cancelQueries({ queryKey: ["properties"] });
      const prev = qc.getQueryData<Property[]>(["properties"]);
      qc.setQueryData<Property[]>(["properties"], (old) =>
        (old ?? []).map((x) => (x.id === p.id ? { ...x, tracking_enabled: !x.tracking_enabled } : x))
      );
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(["properties"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });

  const reprocessPending = async () => {
    setReprocessing(true);
    try {
      await supabase.functions.invoke("process-fb-event");
    } catch (e) { console.error(e); }
    finally { setReprocessing(false); }
  };

  const openPayload = async (evt: any) => {
    const { data } = await supabase.from("fb_events_raw").select("*").eq("id", evt.id).single();
    setPayloadEvt(data ?? evt);
  };

  // Paginação server-side: carrega só a página atual (.range) e o total real (count),
  // nunca 100% dos dados de uma vez. Filtro de data aplicado no servidor (igual aos stats).
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ["fb-events-raw", activeProperty?.id, page, activeDateRange?.from?.toISOString(), activeDateRange?.to?.toISOString()],
    queryFn: async () => {
      if (!activeProperty) return { rows: [], totalCount: 0 };
      const fromIdx = (page - 1) * PAGE_SIZE;
      const toIdx = fromIdx + PAGE_SIZE - 1;
      let q = supabase
        .from("fb_events_raw")
        .select("id,event_name,event_time,created_at,processed,page_url,page_title,ip,country,state,city,zip,fbp,fbc,external_id,user_agent,event_id,event_day,event_day_in_month,event_month,event_time_interval,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id", { count: "exact" })
        .eq("property_id", activeProperty.id);
      if (activeDateRange) {
        q = q.gte("created_at", activeDateRange.from.toISOString())
             .lte("created_at", activeDateRange.to.toISOString());
      }
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(fromIdx, toIdx);
      if (error) throw error;
      return { rows: data ?? [], totalCount: count ?? 0 };
    },
    enabled: !!activeProperty,
    refetchInterval: 60000,
    staleTime: 30000,
    placeholderData: (prev) => prev, // mantém a página anterior visível enquanto carrega a nova
  });

  const { data: statsData } = useQuery({
    queryKey: ["fb-events-stats", activeProperty?.id, activeDateRange?.from?.toISOString(), activeDateRange?.to?.toISOString()],
    queryFn: async () => {
      if (!activeProperty) return { total: 0, processed: 0, unique: 0 };
      const applyFilters = (q: any) => {
        q = q.eq("property_id", activeProperty.id);
        if (!activeDateRange) return q;
        return q.gte("created_at", activeDateRange.from.toISOString()).lte("created_at", activeDateRange.to.toISOString());
      };
      const [{ count: total }, { count: proc }, uniqRes] = await Promise.all([
        applyFilters(supabase.from("fb_events_raw").select("*", { count: "exact", head: true })),
        applyFilters(supabase.from("fb_events_raw").select("*", { count: "exact", head: true }).eq("processed", true)),
        supabase.rpc("unique_visitors", {
          p_property: activeProperty.id,
          p_from: activeDateRange?.from?.toISOString() ?? null,
          p_to: activeDateRange?.to?.toISOString() ?? null,
        }),
      ]);
      return { total: total ?? 0, processed: proc ?? 0, unique: Number(uniqRes.data ?? 0) };
    },
    enabled: !!activeProperty,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const events = eventsData?.rows ?? [];
  const totalCount = eventsData?.totalCount ?? 0;

  const totalEvents = statsData?.total ?? 0;
  const processed   = statsData?.processed ?? 0;
  const pending     = totalEvents - processed;
  const uniqueVisitors = statsData?.unique ?? 0;

  // Total real de páginas vem do count do servidor (não das linhas carregadas)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Se a página atual passar do total (ex.: após trocar filtro/propriedade), volta p/ a última válida
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const setView_ = (v: "table" | "map") => {
    localStorage.setItem("dashboard-view", v);
    setView(v);
  };
return (
    <>
      <HealthBanner />
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-background shrink-0">
        <div className="flex items-center justify-between px-6 h-[60px] gap-4">

          {/* Workspace picker */}
          <div className="relative shrink-0">
            <button onClick={() => setWorkspaceOpen(v => !v)}
              onBlur={() => setTimeout(() => setWorkspaceOpen(false), 150)}
              className="flex items-center gap-2 outline-none group">
              <span className="text-sm font-semibold text-foreground">{activeProperty?.name ?? "…"}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${workspaceOpen ? "rotate-180" : ""}`} />
            </button>

            {workspaceOpen && (
              <div className="absolute top-full left-0 mt-2 w-64 z-50 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                <p className="px-3 pt-2.5 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Workspaces</p>
                {(properties ?? []).map(p => (
                  <div key={p.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors ${activeProperty?.id === p.id ? "bg-accent/60" : ""}`}>
                    <button onClick={() => { handleSelectProperty(p.id); setWorkspaceOpen(false); }}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left outline-none">
                      <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-3 w-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{p.pixel_id || "Sem pixel"}</p>
                      </div>
                      {activeProperty?.id === p.id && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </button>
                    {/* Toggle: liga/desliga o disparo do pixel+script desta propriedade */}
                    <button
                      type="button"
                      title={p.tracking_enabled ? "Pixel ativo — clique para desativar" : "Pixel desativado — clique para ativar"}
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleTracking.mutate(p); }}
                      className={`relative h-5 w-9 rounded-full shrink-0 transition-colors outline-none ${p.tracking_enabled ? "bg-emerald-500" : "bg-muted-foreground/30"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${p.tracking_enabled ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                  </div>
                ))}
                <div className="border-t border-border mt-1">
                  <button onClick={() => { setWorkspaceOpen(false); setNewWsOpen(true); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent transition-colors">
                    <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <Plus className="h-3 w-3 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-primary">Novo workspace</p>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Filtros centrais */}
          <div className="flex items-center gap-2 flex-1 justify-center flex-wrap">
            <DateRangeFilter value={datePreset} customRange={customRange} onChange={(p, r) => { setDatePreset(p); setCustomRange(p === "custom" ? r : null); setPage(1); }} />
          </div>

          {/* Ações direita */}
          <div className="flex items-center gap-1 shrink-0">
            {/* View toggle */}
            <div className="flex items-center border border-border rounded-sm overflow-hidden mr-1">
              {([["table", Table2, "Dados"], ["map", MapPin, "Mapa"]] as const).map(([v, Icon, label], i) => (
                <button key={v} onClick={() => setView_(v)} title={label}
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition-colors ${view === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"} ${i === 0 ? "border-r border-border" : ""}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col gap-5 min-h-0 pt-4">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total de Eventos", value: totalEvents, color: "text-foreground", icon: Zap, iconColor: "text-primary", bg: "bg-primary/8" },
            { label: "Visitas Únicas", value: uniqueVisitors, color: "text-foreground", icon: Users, iconColor: "text-blue-500", bg: "bg-blue-500/8" },
            { label: "Processados", value: processed, color: "text-[hsl(var(--success))]", icon: CheckCircle2, iconColor: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/8" },
            { label: "Pendentes", value: pending, color: "text-[hsl(var(--warning))]", icon: CircleDot, iconColor: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/8" },
          ].map(({ label, value, color, icon: Icon, iconColor, bg }) => (
            <Card key={label} className="border-border shadow-none">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`h-10 w-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                  <div className="flex items-center gap-2">
                    <AnimatedNumber value={value} className={`text-2xl font-bold ${color}`} />
                    {label === "Pendentes" && value > 0 && (
                      <button onClick={reprocessPending} disabled={reprocessing}
                        className="flex items-center gap-1 text-[10px] font-medium text-[hsl(var(--warning))] border border-[hsl(var(--warning))]/30 rounded-md px-1.5 py-0.5 hover:bg-[hsl(var(--warning))]/10 transition-colors">
                        <RefreshCw className={`h-2.5 w-2.5 ${reprocessing ? "animate-spin" : ""}`} />
                        {reprocessing ? "…" : "Reenviar"}
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Área principal */}
        <Card className="border-border shadow-none flex-1 min-h-0 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Carregando eventos…</p>
              </div>
            </div>
          ) : view === "map" ? (
            <div className="flex-1 relative" style={{ minHeight: 400 }}>
              <div className="absolute inset-0">
                <VisitorMap regionFilter="all" propertyId={activeProperty?.id ?? ""} />
              </div>
            </div>
          ) : !events.length ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Zap className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">Nenhum evento ainda</p>
                <p className="text-xs text-muted-foreground">Instale o loader no seu site para começar a rastrear</p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-auto flex-1 min-h-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium">Canal</TableHead>
                      <TableHead className="text-xs font-medium">Evento</TableHead>
                      <TableHead className="text-xs font-medium whitespace-nowrap">Data / Hora</TableHead>
                      <TableHead className="text-xs font-medium">Página</TableHead>
                      <TableHead className="text-xs font-medium min-w-[150px] text-center pl-5">Origem</TableHead>
                      <TableHead className="text-xs font-medium min-w-[95px] text-center">Mídia</TableHead>
                      <TableHead className="text-xs font-medium min-w-[140px] text-center">Campanha</TableHead>
                      <TableHead className="text-xs font-medium">IP</TableHead>
                      <TableHead className="text-xs font-medium">País</TableHead>
                      <TableHead className="text-xs font-medium">Estado</TableHead>
                      <TableHead className="text-xs font-medium">Cidade</TableHead>
                      <TableHead className="text-xs font-medium">CEP</TableHead>
                      <TableHead className="text-xs font-medium">Event ID</TableHead>
                      <TableHead className="text-xs font-medium">External ID</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map(evt => {
                      const time = evt.event_time
                        ? format(new Date(evt.event_time * 1000), "dd/MM/yy HH:mm:ss", { locale: ptBR })
                        : evt.created_at
                        ? format(new Date(evt.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })
                        : "—";
                      return (
                        <TableRow key={evt.id} className="border-border hover:bg-muted/30 transition-colors">
                          <TableCell className="py-2">
                            {evt.processed ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--success))]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
                                Enviado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                                Pendente
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-1">
                              <span title="CAPI" className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded font-medium ${evt.processed ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" : "bg-muted text-muted-foreground"}`}>
                                <Server className="h-2 w-2" /> CAPI
                              </span>
                              <span title="Pixel" className={`inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded font-medium ${evt.fbp ? "bg-blue-500/10 text-blue-500" : "bg-muted text-muted-foreground"}`}>
                                <Monitor className="h-2 w-2" /> Pixel
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-[10px] border-primary/20 text-primary bg-primary/5 font-medium px-1.5 py-0">
                              {evt.event_name || "PageView"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">{time}</TableCell>
                          <TableCell className="py-2 max-w-[180px]">
                            <PageCell title={evt.page_title || "—"} url={evt.page_url || ""} />
                          </TableCell>
                          <TableCell className="py-2 text-center pl-5"><UtmCell w={120} value={prettySource(evt.utm_source ?? utmFromUrl(evt.page_url, "utm_source"))} /></TableCell>
                          <TableCell className="py-2 text-center"><UtmCell w={90}  value={prettyMedium(evt.utm_medium ?? utmFromUrl(evt.page_url, "utm_medium"))} /></TableCell>
                          <TableCell className="py-2 text-center"><UtmCell w={135} value={evt.utm_campaign ?? utmFromUrl(evt.page_url, "utm_campaign")} /></TableCell>
                          <TableCell className="py-2 text-[11px] font-mono text-muted-foreground">{evt.ip || "—"}</TableCell>
                          <TableCell className="py-2"><Flag code={evt.country} /></TableCell>
                          <TableCell className="py-2 text-[11px] text-muted-foreground">{cleanState(evt.state)}</TableCell>
                          <TableCell className="py-2 text-[11px] text-muted-foreground capitalize">{evt.city || "—"}</TableCell>
                          <TableCell className="py-2 text-[11px] font-mono text-muted-foreground">{evt.zip || "—"}</TableCell>
                          <TableCell className="py-2">
                            <code className="text-[10px] font-mono text-primary bg-primary/8 px-1.5 py-0.5 rounded">
                              {evt.event_id ? evt.event_id.slice(0, 12) + "…" : "—"}
                            </code>
                          </TableCell>
                          <TableCell className="py-2 text-[11px] font-mono text-muted-foreground max-w-[80px] truncate">{evt.external_id ? evt.external_id.slice(0, 8) + "…" : "—"}</TableCell>
                          <TableCell className="py-2">
                            <button onClick={() => openPayload(evt)}
                              className="h-6 w-6 flex items-center justify-center rounded hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-border shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} de {totalCount.toLocaleString("pt-BR")} eventos
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-30 hover:bg-accent transition-colors">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs font-medium text-muted-foreground px-2">{page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="h-7 w-7 flex items-center justify-center rounded border border-border disabled:opacity-30 hover:bg-accent transition-colors">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </main>

      <PayloadDialog open={!!payloadEvt} onOpenChange={open => !open && setPayloadEvt(null)} event={payloadEvt} />
      <NewWorkspaceDialog
        open={newWsOpen}
        onClose={() => setNewWsOpen(false)}
        onCreate={(name, pixelId, accessToken) => createProperty.mutate({ name, pixelId, accessToken })}
        loading={createProperty.isPending}
      />
    </>
  );
};

export default Index;
