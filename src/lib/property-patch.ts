import type { Property } from '../integrations/supabase/client';
export function validatePropertyPatch(input: Partial<Property>): Partial<Property> {
  const patch: Partial<Property> = {};
  for (const key of ['name','pixel_id','access_token','test_event_code'] as const) {
    if (!(key in input)) continue;
    const value = String(input[key] ?? '').trim();
    if (key === 'name' && (!value || value.length > 255)) throw new Error('Informe um nome com até 255 caracteres.');
    if (key === 'pixel_id' && !/^\d{10,20}$/.test(value)) throw new Error('O Pixel ID precisa ter de 10 a 20 dígitos.');
    if (key === 'test_event_code') patch.test_event_code = value || null;
    else patch[key] = value;
  }
  for (const key of ['browser_pixel','capi_enabled','event_add_to_cart','event_add_to_wishlist','event_lead','tracking_enabled','fire_once','test_event_active'] as const) {
    if (typeof input[key] === 'boolean') patch[key] = input[key];
  }
  return patch;
}
