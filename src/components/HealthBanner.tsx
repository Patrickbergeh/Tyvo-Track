import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X } from "lucide-react";

type Issue = { type: string; message: string };

export function HealthBanner() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [dismissed, setDismissed] = useState(false);

  async function check() {
    const found: Issue[] = [];

    try {
      // Eventos parados há mais de 20 min (process-fb-event fora do ar)
      const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { data: stale } = await supabase
        .from("fb_events_raw")
        .select("id")
        .eq("processed", false)
        .lt("created_at", cutoff)
        .limit(1);

      if (stale && stale.length > 0) {
        found.push({
          type: "stale",
          message: "Eventos parados há mais de 20 min — envio ao Facebook pode estar falhando.",
        });
      }

      // Erros retornados pelo Facebook CAPI na última hora
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("fb_events_raw")
        .select("fb_response")
        .eq("processed", true)
        .gte("created_at", since)
        .limit(30);

      const hasErrors = recent?.some((r) => {
        const resp = r.fb_response as Record<string, unknown> | null;
        if (!resp) return false;
        return (
          resp.error ||
          (typeof resp.events_received === "number" && resp.events_received === 0)
        );
      });

      if (hasErrors) {
        found.push({
          type: "fb_error",
          message: "Facebook CAPI retornou erros em eventos recentes.",
        });
      }
    } catch {
      found.push({
        type: "unreachable",
        message: "Não foi possível verificar o status da plataforma.",
      });
    }

    setIssues(found);
    // Reaparece após cada checagem mesmo se foi fechado (ficar avisando)
    if (found.length > 0) setDismissed(false);
  }

  useEffect(() => {
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (issues.length === 0 || dismissed) return null;

  return (
    <div className="bg-red-950/90 border-b border-red-700 px-4 py-2.5 flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-0.5">
        {issues.map((issue, i) => (
          <p key={i} className="text-sm text-red-200 leading-snug">
            {issue.message}
          </p>
        ))}
        <p className="text-xs text-red-400">Verificando a cada 60 s</p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-red-500 hover:text-red-300 transition-colors"
        title="Fechar (reaparece na próxima verificação se o problema persistir)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
