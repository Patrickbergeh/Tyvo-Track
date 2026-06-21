import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Property } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Building2,
  Eye, EyeOff, Trash2, Copy, Check,
  Zap, MonitorSmartphone, FlaskConical, Code2, AlertTriangle, ScanLine,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const SUPABASE_PROJECT = "tqqqnmdffmzolnlrggqd";

type SwitchDef = { label: string; description?: string; key: keyof Property };

const SWITCHES: SwitchDef[] = [
  { label: "Pixel no Navegador", description: "Dispara o fbq() direto no browser do visitante", key: "browser_pixel" },
  { label: "Conversions API (CAPI)", description: "Envia eventos pelo servidor via API do Meta", key: "capi_enabled" },
  { label: "Evento Add to Cart", description: "Adicione a class addtocart-btn nos botões do site", key: "event_add_to_cart" },
  { label: "Evento Add to Wishlist", description: "Adicione a class addtowhist-btn nos botões do site", key: "event_add_to_wishlist" },
  { label: "Evento Lead", description: "Dispara Lead ao enviar formulário Elementor com sucesso", key: "event_lead" },
  { label: "Disparar apenas uma vez por sessão", description: "Evita duplicação em recarregamentos de página", key: "fire_once" },
];

type Tab = "pixel" | "eventos" | "instalacao" | "avancado";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "pixel",      label: "Pixel",      icon: ScanLine },
  { id: "eventos",    label: "Eventos",    icon: Zap },
  { id: "instalacao", label: "Instalação", icon: Code2 },
  { id: "avancado",   label: "Avançado",   icon: AlertTriangle },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checked ? "bg-primary" : "bg-input"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

const Settings = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activePropertyId, setActivePropertyId] = useState<string>(
    () => localStorage.getItem("active-property-id") ?? ""
  );
  const [tab, setTab] = useState<Tab>("pixel");
  const [showToken, setShowToken] = useState(false);
  const [snippetMode, setSnippetMode] = useState<"url" | "full">("url");
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [form, setForm] = useState<Partial<Property>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  const { data: properties } = useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeProperty = properties?.find((p) => p.id === activePropertyId) ?? properties?.[0] ?? null;

  useEffect(() => {
    if (activeProperty) {
      loadedRef.current = false;
      setForm(activeProperty);
      setTimeout(() => { loadedRef.current = true; }, 0);
    }
  }, [activeProperty?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Property>) => {
      const { error } = await supabase.from("properties").update(data).eq("id", activeProperty!.id);
      if (error) throw error;
    },
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
  });

  const triggerSave = (newForm: Partial<Property>) => {
    if (!loadedRef.current || !activeProperty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveMutation.mutate(newForm), 700);
  };

  const saveNow = (newForm: Partial<Property>) => {
    if (!loadedRef.current || !activeProperty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    saveMutation.mutate(newForm);
  };

  const val = (key: keyof Property): boolean =>
    Boolean(key in form ? form[key] : activeProperty?.[key] ?? false);

  const toggle = (key: keyof Property) => {
    const newForm = { ...form, [key]: !val(key) };
    setForm(newForm);
    saveNow(newForm);
  };

  const updateField = (key: keyof Property, value: string | null) => {
    const newForm = { ...form, [key]: value };
    setForm(newForm);
    triggerSave(newForm);
  };

const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").delete().eq("id", activeProperty!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      localStorage.removeItem("active-property-id");
      navigate("/");
    },
  });


  const loaderUrl = activeProperty
    ? `https://${SUPABASE_PROJECT}.supabase.co/functions/v1/loader?id=${activeProperty.id}`
    : "";
  const loaderTag = activeProperty ? `<script src="${loaderUrl}"></script>` : "";

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-6 h-14 gap-4">

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                <Building2 className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm font-semibold">{activeProperty?.name ?? "…"}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-xs transition-opacity duration-300 ${saveStatus === "idle" ? "opacity-0" : "opacity-100"} ${saveStatus === "saved" ? "text-green-500" : "text-muted-foreground"}`}>
              {saveStatus === "saving" ? "Salvando…" : "✓ Salvo"}
            </span>
            <ThemeToggle />
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-6 pb-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {activeProperty && (
        <main className="px-6 py-8 flex flex-col gap-6">

          {/* ── Aba: Pixel ─────────────────────────────────────────────────── */}
          {tab === "pixel" && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <ScanLine className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Identificação do Pixel</h2>
                  <p className="text-[11px] text-muted-foreground">Dados de conexão com o Meta Pixel</p>
                </div>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome da propriedade</label>
                  <input
                    autoComplete="off"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.name ?? ""}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pixel ID</label>
                  <input
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="642258762285772"
                    value={form.pixel_id ?? ""}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, "").slice(0, 20);
                      updateField("pixel_id", clean);
                    }}
                  />
                  {(() => {
                    const id = form.pixel_id ?? "";
                    const valid = /^\d{10,20}$/.test(id);
                    const hasValue = id.length > 0;
                    if (!hasValue) return null;
                    return (
                      <p className={`text-[11px] mt-1.5 ${valid ? "text-green-500" : "text-destructive"}`}>
                        {valid ? "✓ Pixel ID válido" : "✗ Pixel ID inválido — deve conter apenas números (10–20 dígitos)"}
                      </p>
                    );
                  })()}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Access Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? "text" : "password"}
                      autoComplete="new-password"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                      value={form.access_token ?? ""}
                      onChange={(e) => updateField("access_token", e.target.value)}
                    />
                    <button type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowToken((v) => !v)}>
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Aba: Eventos ───────────────────────────────────────────────── */}
          {tab === "eventos" && (
            <>
              <section className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                  <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Canais e Disparos</h2>
                    <p className="text-[11px] text-muted-foreground">Controle quais eventos e canais estão ativos</p>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {SWITCHES.map(({ label, description, key }) => (
                    <div key={key} className="flex items-center justify-between px-5 py-3.5 gap-4">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
                      </div>
                      <Toggle checked={val(key)} onChange={() => toggle(key)} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                  <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                    <FlaskConical className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Modo de Teste</h2>
                    <p className="text-[11px] text-muted-foreground">Test Event Code do Facebook Events Manager</p>
                  </div>
                </div>
                <div className="px-5 py-3.5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Ativar Test Event Code</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Ativa o modo de teste no Facebook Events Manager</p>
                    </div>
                    <Toggle checked={val("test_event_active")} onChange={() => toggle("test_event_active")} />
                  </div>
                  {val("test_event_active") && (
                    <input
                      autoFocus
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      className="w-full rounded-md border border-primary/40 bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="TEST12345"
                      value={form.test_event_code ?? ""}
                      onChange={(e) => updateField("test_event_code", e.target.value || null)}
                    />
                  )}
                </div>
              </section>
            </>
          )}

          {/* ── Aba: Instalação ────────────────────────────────────────────── */}
          {tab === "instalacao" && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <Code2 className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Instalação do Tracker</h2>
                  <p className="text-[11px] text-muted-foreground">Cole no &lt;head&gt; do seu site</p>
                </div>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                <div className="flex gap-1 bg-muted rounded-md p-1 w-fit">
                  {(["url", "full"] as const).map((mode) => (
                    <button key={mode} onClick={() => setSnippetMode(mode)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${snippetMode === mode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {mode === "url" ? "URL única" : "Script completo"}
                    </button>
                  ))}
                </div>

                <div className="relative rounded-lg bg-muted border border-border overflow-hidden">
                  <div className="p-3 pr-24">
                    <code className="text-xs font-mono text-foreground break-all">{loaderTag}</code>
                  </div>
                  <button onClick={() => copy(loaderTag)}
                    className="absolute top-2.5 right-2.5 flex items-center gap-1.5 text-[11px] bg-background border border-border rounded px-2.5 py-1.5 hover:bg-accent transition-colors font-medium">
                    {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                </div>

                {snippetMode === "url" && (
                  <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <MonitorSmartphone className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                    <span>Mudanças nas configurações aplicam em todos os sites automaticamente em até 5 min — sem trocar o código.</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Aba: Avançado ──────────────────────────────────────────────── */}
          {tab === "avancado" && (
            <section className="rounded-xl border border-destructive/30 bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-destructive/20">
                <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                </div>
                <h2 className="text-sm font-semibold text-destructive">Zona de perigo</h2>
              </div>
              <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Excluir esta propriedade</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Esta ação é permanente e não pode ser desfeita.</p>
                </div>
                <Button variant="outline" size="sm"
                  className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive/60 shrink-0"
                  onClick={() => { if (confirm(`Excluir "${activeProperty.name}"? Esta ação não pode ser desfeita.`)) deleteMutation.mutate(); }}
                  disabled={deleteMutation.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              </div>
            </section>
          )}

        </main>
      )}
    </div>
  );
};

export default Settings;
