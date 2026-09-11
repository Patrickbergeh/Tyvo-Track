export function databaseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function eventDate(event: { event_time?: unknown; created_at?: unknown }): Date | null {
  const time = Number(event.event_time);
  if (Number.isFinite(time) && time > 0) {
    const date = new Date(time > 1e12 ? time : time * 1000);
    if (Number.isFinite(date.getTime())) return date;
  }
  return databaseDate(event.created_at);
}
