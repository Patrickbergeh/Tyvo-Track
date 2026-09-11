export function previewUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.searchParams.set('_tk_preview', '1');
    return url.href;
  } catch { return ''; }
}
