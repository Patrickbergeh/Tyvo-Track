import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SUPABASE_KEY = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type Property = {
  id: string;
  name: string;
  pixel_id: string;
  access_token: string;
  browser_pixel: boolean;
  capi_enabled: boolean;
  event_add_to_cart: boolean;
  event_add_to_wishlist: boolean;
  event_lead: boolean;
  tracking_enabled: boolean;
  fire_once: boolean;
  test_event_code: string | null;
  test_event_active: boolean;
  created_at: string;
};
