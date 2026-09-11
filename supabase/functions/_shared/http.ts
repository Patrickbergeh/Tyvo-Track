export class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function readObject(req: Request, maxBytes = 65536, allowEmpty = false): Promise<Record<string, any>> {
  if (Number(req.headers.get('content-length')) > maxBytes) throw new RequestError('payload_too_large', 413);
  const reader = req.body?.getReader();
  let size = 0, raw = '';
  const decoder = new TextDecoder();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new RequestError('payload_too_large', 413); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
  }
  if (!raw.trim() && allowEmpty) return {};
  let result: unknown;
  try { result = JSON.parse(raw); } catch { throw new RequestError('invalid_json'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new RequestError('invalid_payload');
  return result as Record<string, any>;
}
