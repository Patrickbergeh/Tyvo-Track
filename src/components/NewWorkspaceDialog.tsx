import { useState } from "react";
import { X, Building2, ArrowRight, Eye, EyeOff } from "lucide-react";

type Step = "name" | "config";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, pixelId: string, accessToken: string) => void;
  loading: boolean;
};

export function NewWorkspaceDialog({ open, onClose, onCreate, loading }: Props) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setStep("name");
    setName("");
    setPixelId("");
    setAccessToken("");
    onClose();
  };

  const handleCreate = () => {
    onCreate(name.trim(), pixelId.trim(), accessToken.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {step === "name" ? "Novo workspace" : name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {step === "name" ? "Passo 1 de 2" : "Passo 2 de 2 — Configurar pixel"}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-muted">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: step === "name" ? "50%" : "100%" }} />
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {step === "name" ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-base font-semibold text-foreground mb-1">Como vai chamar esse workspace?</p>
                <p className="text-xs text-muted-foreground">Ex: Yvenon Loja, Info Biteti, Stories que vendem…</p>
              </div>
              <input
                autoFocus
                className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
                placeholder="Nome do workspace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) setStep("config"); }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-base font-semibold text-foreground mb-1">Configure o Pixel do Facebook</p>
                <p className="text-xs text-muted-foreground">Você pode pular agora e configurar depois nas Configurações.</p>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pixel ID</label>
                  <input
                    autoFocus
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
                    placeholder="642258762285772"
                    value={pixelId}
                    onChange={(e) => setPixelId(e.target.value.replace(/\D/g, "").slice(0, 20))}
                  />
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
                      className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
                      placeholder="EAADRwHz…"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowToken(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-2">
          {step === "config" && (
            <button onClick={() => setStep("name")}
              className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
              Voltar
            </button>
          )}

          {step === "name" ? (
            <button
              onClick={() => setStep("config")}
              disabled={!name.trim()}
              className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading ? "Criando…" : "Criar workspace"}
            </button>
          )}
        </div>

        {step === "config" && (
          <div className="px-6 pb-5 -mt-2">
            <button onClick={() => onCreate(name.trim(), "", "")}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center">
              Pular — configurar depois
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
