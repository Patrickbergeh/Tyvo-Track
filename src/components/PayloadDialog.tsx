import { metaAccepted, deliveryLabel, deliveryDescription, exclusionLabel } from "@/lib/delivery";
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
import { useState } from "react";



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
  if (!event) return null;
  const sentViaServer = metaAccepted(event.fb_response);
  const sentViaBrowser = false;
  const eventId = event.event_id || undefined;
  const fbResponse = event.fb_response;
  const payloadSent = event.payload_sent || null;
  const browserJson = {
    property_id: event.property_id, event_name: event.event_name, event_id: event.event_id,
    page_url: event.page_url, event_time: event.event_time, fbp: event.fbp, fbc: event.fbc,
    traffic_source: event.traffic_source, traffic_medium: event.traffic_medium,
    custom_data: event.custom_data,
    delivery_status: event.delivery_status,
    ...(exclusionLabel(event) ? { meta_delivery: event.fb_response } : {}),
    note: "Dados coletados; recebimento e deduplicação do Pixel não verificados",
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
                    : <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" />{deliveryLabel(event)}</span>}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Navegador (Pixel)</span>
                  </div>
                  {sentViaBrowser
                    ? <span className="flex items-center gap-1 text-xs font-semibold text-blue-400"><CheckCircle2 className="h-3 w-3" />Pixel ativo</span>
                    : <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" />Não verificado</span>}
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
        {exclusionLabel(event) && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">{deliveryDescription(event)}</p>}

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
                <span className="text-sm font-bold text-foreground">Dados coletados</span>
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
