export const FUNCTION_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Gateway JWT validation alone also accepts the public anon JWT.
export async function authorized(req: Request, supabase: any, serviceKey: string, supabaseUrl?: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === serviceKey) return true;
  // Legacy service JWTs can differ from the runtime service key. The unverified
  // role only selects a verification path; PostgREST must validate signature,
  // expiry and the service-only RPC grant before access is allowed.
  let serviceCandidate = false;
  try { serviceCandidate = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch {}
  if (serviceCandidate && supabaseUrl) {
    try {
      const response = await fetcher(`${supabaseUrl}/rest/v1/rpc/verify_service_request`, {
        method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(5000),
      });
      return response.ok && await response.json() === true;
    } catch { return false; }
  }
  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data?.user;
}
