import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Server, Monitor, CheckCircle2, XCircle, Copy, Check, Info } from "lucide-react";
import { useState, useEffect } from "react";

async function sha256(value: string): Promise<string> {
  const buf = new TextEncoder().encode(value.toLowerCase().trim());
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface PayloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Record<string, any> | null;
}

/** Renders a JSON string with the event_id line highlighted */
function JsonViewer({ json, eventId }: { json: unknown; eventId?: string }) {
  const text = JSON.stringify(json, null, 2);
  const lines = text.split("\n");

  return (
    <pre className="p-4 text-xs font-mono leading-5 overflow-y-auto overflow-x-hidden max-h-[42vh] select-text whitespace-pre-wrap break-all">
      {lines.map((line, i) => {
        const isEventIdLine =
          !!eventId &&
          line.includes("event_id") &&
          line.includes(eventId);
        return (
          <div
            key={i}
            className={isEventIdLine ? "rounded px-1 -mx-1 bg-primary/20 text-primary font-bold" : "text-foreground/80"}
          >
            {line}
          </div>
        );
      })}
    </pre>
  );
}

export const PayloadDialog = ({
  open,
  onOpenChange,
  event,
}: PayloadDialogProps) => {
  const [copiedId, setCopiedId] = useState(false);
  const [browserJson, setBrowserJson] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!event) return;
    const compute = async () => {
      const [extId, ct, st, zp, country] = await Promise.all([
        event.external_id ? sha256(event.external_id) : Promise.resolve(null),
        event.city        ? sha256(event.city)        : Promise.resolve(null),
        event.state       ? sha256(event.state)       : Promise.resolve(null),
        event.zip         ? sha256(event.zip)         : Promise.resolve(null),
        event.country     ? sha256(event.country)     : Promise.resolve(null),
      ]);
      setBrowserJson({
        method:              "fbq('track', ...)",
        pixel_id:            "642258762285772",
        event_name:          event.event_name  || null,
        event_id:            event.event_id    || null,
        action_source:       "website",
        event_source_url:    event.page_url    || null,
        client_user_agent:   event.user_agent  || null,
        client_ip_address:   event.ip          || null,
        external_id:         extId,
        fbp:                 event.fbp         || null,
        fbc:                 event.fbc         || null,
        currency:            "BRL",
        ct,
        st,
        zp,
        country,
        event_day:           event.event_day           || null,
        event_day_in_month:  event.event_day_in_month  || null,
        event_month:         event.event_month         || null,
        event_time_interval: event.event_time_interval || null,
      });
    };
    compute();
  }, [event]);

  if (!event) return null;

  const sentViaServer  = event.processed === true;
  const sentViaBrowser = !!event.fbp;
  const eventId        = event.event_id || undefined;
  const fbResponse     = event.fb_response;

  const timeFields = {
    event_day:           event.event_day           ?? null,
    event_day_in_month:  event.event_day_in_month  ?? null,
    event_month:         event.event_month         ?? null,
    event_time_interval: event.event_time_interval ?? null,
  };
  const payloadSent = event.payload_sent
    ? event.payload_sent
    : {
        event_name:          event.event_name    || null,
        event_time:          event.event_time    || null,
        event_id:            event.event_id      || null,
        page_url:            event.page_url      || null,
        page_title:          event.page_title    || null,
        external_id:         event.external_id   || null,
        user_agent:          event.user_agent    || null,
        fbp:                 event.fbp           || null,
        fbc:                 event.fbc           || null,
        ip:                  event.ip            || null,
        country:             event.country       || null,
        state:               event.state         || null,
        city:                event.city          || null,
        zip:                 event.zip           || null,
        ...timeFields,
      };

  const copyEventId = async () => {
    if (!eventId) return;
    await navigator.clipboard.writeText(eventId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-full border border-border shadow-2xl bg-card">

        {/* Dedup badge — posicionado ao lado do botão fechar */}
        {sentViaServer && sentViaBrowser && (
          <div className="absolute top-3.5 right-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/25">
            <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />
            <span className="text-[10px] font-semibold text-[hsl(var(--success))] tracking-wide uppercase">Deduplica</span>
          </div>
        )}

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base pr-8">
            Detalhes do Evento

            {/* Info dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-5 w-5 rounded-full border border-border bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors shrink-0">
                  <Info className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="w-48 p-3 space-y-3">

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Servidor (CAPI)</span>
                  </div>
                  {sentViaServer
                    ? <span className="flex items-center gap-1 text-xs font-semibold text-[hsl(var(--success))]"><CheckCircle2 className="h-3 w-3" />Enviado</span>
                    : <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" />Pendente</span>}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Navegador (Pixel)</span>
                  </div>
                  {sentViaBrowser
                    ? <span className="flex items-center gap-1 text-xs font-semibold text-blue-400"><CheckCircle2 className="h-3 w-3" />Pixel ativo</span>
                    : <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" />Sem pixel</span>}
                </div>

                {sentViaServer && sentViaBrowser && (
                  <p className="text-[10px] text-[hsl(var(--success))] font-medium pt-0.5">✓ Deduplicação ativa</p>
                )}

                <div className="pt-1 border-t border-border space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Event ID</span>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] font-mono px-2 py-1 rounded-md bg-primary/15 text-primary font-bold tracking-wide truncate flex-1">
                      {eventId ?? "—"}
                    </code>
                    {eventId && (
                      <button
                        onClick={copyEventId}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Copiar Event ID"
                      >
                        {copiedId
                          ? <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                          : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

              </PopoverContent>
            </Popover>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">

          {/* ── Dois JSONs lado a lado ────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

            {/* Servidor */}
            <div className="rounded-xl border border-border bg-muted/30 overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-card shrink-0">
                <Server className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-bold text-foreground">Servidor — payload CAPI</span>
              </div>
              {payloadSent
                ? <JsonViewer json={payloadSent} eventId={eventId} />
                : <p className="p-4 text-xs text-muted-foreground">Payload não disponível</p>}
            </div>

            {/* Navegador */}
            <div className="rounded-xl border border-border bg-muted/30 overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-card shrink-0">
                <Monitor className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-sm font-bold text-foreground">Navegador — pixel browser</span>
              </div>
              {browserJson
                ? <JsonViewer json={browserJson} eventId={eventId} />
                : <p className="p-4 text-xs text-muted-foreground">Calculando hashes...</p>}
            </div>

          </div>

          {/* Resposta do Facebook */}
          {fbResponse && (
            <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-card">
                <span className="text-sm font-bold text-foreground">Resposta do Facebook</span>
              </div>
              <JsonViewer json={fbResponse} eventId={eventId} />
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
};
