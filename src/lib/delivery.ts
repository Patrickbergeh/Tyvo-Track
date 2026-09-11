export { metaAccepted } from '../../supabase/functions/_shared/meta';
import { metaAccepted } from '../../supabase/functions/_shared/meta';
export function exclusionLabel(event: any): string | null {
  if (metaAccepted(event.fb_response) || event.delivery_status !== 'skipped' || !event.fb_response?.skipped) return null;
  const labels: Record<string,string> = { excluded_organic: 'orgânico', excluded_bio: 'bio', excluded_manychat: 'ManyChat' };
  return labels[event.fb_response.reason] || null;
}
export function deliveryDescription(event: any): string {
  const excluded = exclusionLabel(event);
  if (!excluded) return deliveryLabel(event);
  const response = event.fb_response;
  return `Bloqueado pela regra de ${excluded}. Evento mantido na plataforma. `
    + (response.blocked_before_capi ? 'Nenhum envio CAPI foi realizado para este registro. ' : 'Novas tentativas CAPI bloqueadas; tentativas anteriores permanecem no histórico. ')
    + (response.browser_suppressed === true ? 'O rastreador informou que também bloqueou o Pixel do navegador.' : 'O envio pelo navegador não foi confirmado; uma instalação antiga ou outro script pode ter disparado o Pixel.');
}
export function deliveryLabel(event: any): string {
  if (metaAccepted(event.fb_response)) return 'Aceito pelo Meta';
  const excluded = exclusionLabel(event);
  if (excluded) {
    const prefix = !event.fb_response.blocked_before_capi ? 'Reenvio bloqueado'
      : event.fb_response.browser_suppressed === true ? 'Não enviado' : 'CAPI bloqueada';
    return `${prefix} · ${excluded}`;
  }
  if (event.delivery_status === 'expired') return 'Expirado';
  if (event.fb_response?.skipped) return 'Não enviado';
  if (event.delivery_status === 'retry') return 'Aguardando nova tentativa';
  if (event.fb_response?.error || event.fb_response?.events_received === 0) return 'Falha no envio';
  return event.processed ? 'Sem confirmação' : 'Pendente';
}
