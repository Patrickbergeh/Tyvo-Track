export { metaAccepted } from '../../supabase/functions/_shared/meta';
import { metaAccepted } from '../../supabase/functions/_shared/meta';
export function deliveryLabel(event: any): string {
  if (metaAccepted(event.fb_response)) return 'Aceito pelo Meta';
  if (event.delivery_status === 'expired') return 'Expirado';
  if (event.fb_response?.skipped) return 'Não enviado';
  if (event.delivery_status === 'retry') return 'Aguardando nova tentativa';
  if (event.fb_response?.error || event.fb_response?.events_received === 0) return 'Falha no envio';
  return event.processed ? 'Sem confirmação' : 'Pendente';
}
