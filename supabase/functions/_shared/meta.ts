export function validMetaCookie(value: unknown, kind: "fbp" | "fbc", now = Date.now()): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  const match = /^fb\.\d+\.(\d{13})\.([^\s;]+)$/.exec(value);
  if (!match) return;
  const time = Number(match[1]);
  if (time > now + 300000 || time < now - 90 * 86400000) return;
  if (kind === "fbp" && !/^\d+$/.test(match[2])) return;
  return value;
}

export function eventTimestamp(value: unknown, now = Math.floor(Date.now() / 1000)): number {
  let time = Number(value);
  if (time > 1e12) time = Math.floor(time / 1000);
  if (!Number.isFinite(time) || time <= 0) throw new Error("invalid_event_time");
  if (time > now + 300) throw new Error("future_event_time");
  if (time < now - 7 * 86400) throw new Error("event_expired");
  return Math.min(Math.floor(time), now);
}

export function customData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ["currency", "content_name", "content_category", "content_type", "order_id", "status", "event_day", "event_month", "event_time_interval"]) {
    if (typeof input[key] === "string" && input[key].length <= 255) out[key] = input[key];
  }
  for (const key of ["value", "num_items", "event_day_in_month"]) {
    if (typeof input[key] === "number" && Number.isFinite(input[key]) && input[key] >= 0) out[key] = input[key];
  }
  if (Array.isArray(input.content_ids)) out.content_ids = input.content_ids.filter(x => typeof x === "string" || typeof x === "number").slice(0, 100).map(x => String(x).slice(0, 255));
  if (Array.isArray(input.contents)) out.contents = input.contents.slice(0, 100).filter(x => x && typeof x === "object" && ["string", "number"].includes(typeof x.id) && Number.isFinite(x.quantity) && x.quantity > 0).map(x => ({ id: String(x.id).slice(0, 255), quantity: x.quantity, ...(Number.isFinite(x.item_price) && x.item_price >= 0 ? { item_price: x.item_price } : {}) }));
  if (typeof out.currency === "string") {
    out.currency = out.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(out.currency as string)) delete out.currency;
  }
  return out;
}

export async function hashIdentifier(value: unknown, field: string): Promise<string[] | undefined> {
  if (typeof value !== "string" || !value.trim()) return;
  if (/^[a-f0-9]{64}$/i.test(value)) return [value.toLowerCase()];
  let normalized = value.trim().toLowerCase();
  if (field === "ph") normalized = normalized.replace(/\D/g, "");
  if (["ct", "fn", "ln"].includes(field)) normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  if (field === "zp") normalized = normalized.replace(/[\s-]/g, "");
  if (!normalized) return;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("")];
}

export function metaAccepted(response: unknown): boolean {
  const data = response as { events_received?: number; error?: unknown } | null;
  return !!data && !data.error && typeof data.events_received === "number" && data.events_received > 0;
}

export function retryableMeta(status: number, body: any): boolean {
  return status === 429 || status >= 500 || body?.error?.is_transient === true || [1, 2, 4, 17, 32, 613].includes(Number(body?.error?.code));
}
