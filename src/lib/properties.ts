import { useQuery } from '@tanstack/react-query';
import { supabase, type Property } from '@/integrations/supabase/client';

export const PROPERTY_COLUMNS = 'id,name,pixel_id,access_token,browser_pixel,capi_enabled,event_add_to_cart,event_add_to_wishlist,event_lead,tracking_enabled,fire_once,test_event_code,test_event_active,created_at';
export function useProperties() {
  return useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select(PROPERTY_COLUMNS).order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60000,
  });
}
export function selectedProperty(properties: Property[] | undefined, savedId: string | null) {
  return properties?.find(property => property.id === savedId) ?? properties?.[0] ?? null;
}
