// Legacy callers now use the same hosted loader as Settings. Pixel/CAPI settings
// are controlled by the selected property, avoiding a second divergent tracker.
export function getSnippet(_browserPixelEnabled: boolean, propertyId = "00000000-0000-0000-0000-000000000001"): string {
  const base = (import.meta as any).env.VITE_SUPABASE_URL as string;
  const url = `${base}/functions/v1/loader?id=${encodeURIComponent(propertyId)}`;
  return `<script src="${url}"></script>`;
}
export const SNIPPET_HTML = getSnippet(true);
